import type { Request, Response, Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import {
  resolveChapterGenerationStatus,
  type BufferedGenerationStatus,
  type GetNovelGenerationStatusFn,
} from '../../../../services/chapter-generation-status-service.js';
import { recoverStaleChapterGenerationLock } from '../../../../services/chapter-generation-recovery-service.js';
import { getActiveChapterGenerationTaskChapters } from '../chapter-generate-background.js';

export type ChapterGenerationStatusDeps = {
  novelManager: NovelManager;
  getNovelGenerationStatus?: GetNovelGenerationStatusFn;
};

function getSingleParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function emptyBufferedStatus(): BufferedGenerationStatus {
  return {
    isGenerating: false,
    chapterNumber: null,
    activeAgents: [],
    agentStatuses: {},
    writingAssistantOutput: '',
    lastCompletedChapter: null,
    lastCompletedAt: null,
    lastFailedChapter: null,
    lastFailedAt: null,
    lastFailureMessage: '',
    metadataUpdatedAt: null,
  };
}

export function registerGenerationStatusRoutes(router: Router, deps: ChapterGenerationStatusDeps): void {
  router.get('/generation-status', async (req: Request, res: Response) => {
    const novelId = getSingleParam((req.params as Record<string, string | undefined>).novelId);
    if (!novelId) {
      res.status(400).json({ error: 'novelId is required' });
      return;
    }

    try {
      const bufferedStatus = deps.getNovelGenerationStatus?.(novelId) ?? emptyBufferedStatus();
      const status = await resolveChapterGenerationStatus({
        novelManager: deps.novelManager,
        novelId,
        bufferedStatus,
        activeChapterNumbers: getActiveChapterGenerationTaskChapters(novelId),
      });
      res.json(status);
    } catch {
      res.status(500).json({ error: '查询生成状态失败' });
    }
  });

  router.post('/generation-status/recover-stale-lock', async (req: Request, res: Response) => {
    const novelId = getSingleParam((req.params as Record<string, string | undefined>).novelId);
    if (!novelId) {
      res.status(400).json({ error: 'novelId is required' });
      return;
    }

    try {
      const result = await recoverStaleChapterGenerationLock({
        novelManager: deps.novelManager,
        novelId,
        activeChapterNumbers: getActiveChapterGenerationTaskChapters(novelId),
      });
      res.json(result);
    } catch {
      res.status(500).json({ error: '恢复生成状态失败' });
    }
  });
}
