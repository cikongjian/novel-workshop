import type { Router } from 'express';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../../ai/usage-context.js';
import { parseJsonWithRepair } from '../../../../utils/json-repair.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import type { EnsureNovelAccess, SeriesRouterDeps } from './route-support.js';

type StoryStateRouteDeps = Pick<
  SeriesRouterDeps,
  'agents' | 'broadcastJson' | 'modelClient' | 'novelManager' | 'storyStateManager'
> & {
  ensureNovelAccess: EnsureNovelAccess;
};

export function registerSeriesStoryStateRoutes(
  router: Router,
  {
    agents,
    broadcastJson,
    ensureNovelAccess,
    modelClient,
    novelManager,
    storyStateManager,
  }: StoryStateRouteDeps,
): void {
  router.post('/story-state/:novelId/backfill', async (req, res, next) => {
    try {
      if (!novelManager || !modelClient || !agents) {
        res.status(503).json({ error: 'AI 模型或 Agent 未就绪' }); return;
      }
      const trackerAgent = agents.get('story-state-tracker');
      if (!trackerAgent) {
        res.status(503).json({ error: 'story-state-tracker Agent 未注册' }); return;
      }

      const { novelId } = req.params;
      const startChapter = parseInt(req.body.startChapter ?? '1', 10);
      if (!(await ensureNovelAccess(req, res, novelId))) {
        return;
      }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) { res.status(404).json({ error: '小说不存在' }); return; }
      const aiUsageContext = getAiUsageContext();

      res.json({ success: true, message: '回填任务已启动，请关注 WebSocket 进度推送' });

      void runWithAiUsageContextAsync(
        aiUsageContext ?? {
          scope: 'http',
          operationKey: 'series.story-state-backfill',
          operationLabel: 'Story state backfill',
          operationRegistered: true,
          novelId,
        },
        async () => {
          const chapters = await novelManager.listChapters(novelId);
          const sorted = chapters
            .filter((c: any) => c.chapterNumber >= startChapter)
            .sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
          const characters = await novelManager.getCharacters(novelId);
          const characterNames = characters.map((c: any) => c.name);
          let done = 0;
          const total = sorted.length;

          let state = await storyStateManager.getState(novelId);

          for (const chapterInfo of sorted) {
            const { chapterNumber } = chapterInfo as any;
            const existing = state.snapshots.find(snapshot => snapshot.chapterNumber === chapterNumber);
            if (existing) {
              done++;
              broadcastJson?.({ type: 'backfill:progress', novelId, chapterNumber, status: 'skipped', done, total });
              continue;
            }

            const chapter = await novelManager.getChapter(novelId, chapterNumber);
            if (!chapter?.content?.trim()) {
              done++;
              broadcastJson?.({ type: 'backfill:progress', novelId, chapterNumber, status: 'empty', done, total });
              continue;
            }

            try {
              broadcastJson?.({ type: 'backfill:progress', novelId, chapterNumber, status: 'processing', done, total });
              const previousSnapshot = state.snapshots.length > 0 ? state.snapshots[state.snapshots.length - 1] : null;
              const trackerInput = storyStateManager.buildTrackerInput(
                chapterNumber,
                chapter.content,
                previousSnapshot,
                characterNames,
              );
              const result = await trackerAgent.execute(
                {
                  novelId,
                  novelTitle: novel.title,
                  novelSynopsis: novel.synopsis,
                  genre: novel.genre,
                  chapterNumber,
                  inputText: trackerInput,
                },
                modelClient,
              );
              const rawContent = result.content;
              const sepIdx = rawContent.indexOf('---STATE_SNAPSHOT---');
              if (sepIdx >= 0) {
                const jsonStr = rawContent.slice(sepIdx + '---STATE_SNAPSHOT---'.length).trim();
                const parsed = parseJsonWithRepair<any>(jsonStr);
                if (parsed) {
                  parsed.createdAt = new Date().toISOString();
                  await storyStateManager.saveSnapshot(novelId, parsed);
                  const idx = state.snapshots.findIndex(snapshot => snapshot.chapterNumber === parsed.chapterNumber);
                  if (idx >= 0) {
                    state.snapshots[idx] = parsed;
                  } else {
                    state.snapshots.push(parsed);
                    state.snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
                  }
                  state.latestChapter = Math.max(state.latestChapter, parsed.chapterNumber);
                }
              }
              done++;
              broadcastJson?.({ type: 'backfill:progress', novelId, chapterNumber, status: 'done', done, total });
            } catch (err) {
              done++;
              broadcastJson?.({
                type: 'backfill:progress',
                novelId,
                chapterNumber,
                status: 'error',
                error: safeErrorMessage(err, '内部错误'),
                done,
                total,
              });
            }
          }

          await storyStateManager.compressIfNeeded(novelId);
          broadcastJson?.({ type: 'backfill:complete', novelId, total: done });
        },
      ).catch(() => {});
    } catch (err) { next(err); }
  });

  router.get('/story-state/:novelId', async (req, res, next) => {
    try {
      if (!(await ensureNovelAccess(req, res, req.params.novelId))) {
        return;
      }
      const state = await storyStateManager.getState(req.params.novelId);
      res.json(state);
    } catch (err) { next(err); }
  });

  router.get('/story-state/:novelId/:chapterNumber', async (req, res, next) => {
    try {
      if (!(await ensureNovelAccess(req, res, req.params.novelId))) {
        return;
      }
      void req;
      res.status(410).json({
        error: '章节级故事状态快照接口已下线，请改用当前故事状态接口或 CLI 工具。',
        code: 'SERIES_STORY_STATE_CHAPTER_DEPRECATED',
      });
    } catch (err) { next(err); }
  });
}
