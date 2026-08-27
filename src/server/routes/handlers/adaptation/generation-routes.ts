import type { Router } from 'express';
import path from 'node:path';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  ensureNovelAccess,
  GenerateAdaptationBody,
  toPosix,
  type ResolvedAdaptationRouteDeps,
} from './route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerAdaptationGenerationRoutes(
  router: Router,
  deps: Pick<
    ResolvedAdaptationRouteDeps,
    'adaptationManager' | 'audioAdapter' | 'authDb' | 'comicAdapter' | 'extractor' | 'modelClient' | 'novelManager' | 'shortDramaAdapter'
  >,
): void {
  router.post('/generate', async (req, res) => {
    const parsed = GenerateAdaptationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const novel = await deps.novelManager.getNovel(novelId);
      let payloadPath =
        parsed.data.payloadPath ??
        `adaptations/${parsed.data.mode}/${parsed.data.chapterNumberStart}-${parsed.data.chapterNumberEnd}.json`;
      const artifactMeta: Record<string, unknown> = {};

      if (parsed.data.mode === 'audio') {
        const modelAccess = await resolveUserModelAccess({
          authDb: deps.authDb,
          userId: req.auth?.id,
          headers: req.headers,
          novel,
        });
        if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
          res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
          return;
        }
        const activeModelClient = modelAccess.client ?? deps.modelClient;
        const runId = `${parsed.data.chapterNumberStart}-${parsed.data.chapterNumberEnd}-${Date.now()}`;
        const outputDirRelative = toPosix(path.join('adaptations', 'audio', `run-${runId}`));
        const audioResult = await deps.audioAdapter.generate({
          novelId,
          chapterNumberStart: parsed.data.chapterNumberStart,
          chapterNumberEnd: parsed.data.chapterNumberEnd,
          outputDirRelative,
          modelClient: activeModelClient,
          dialogueIntensity: parsed.data.audioDialogueIntensity,
          rewriteLevel: parsed.data.audioRewriteLevel,
          narrationMaxRatio: parsed.data.audioNarrationMaxRatio,
          genreOverride: parsed.data.audioGenreOverride,
          synthesizeAudio: parsed.data.audioSynthesizeAudio ?? false,
        });
        payloadPath = audioResult.payloadPath;
        artifactMeta.audio = audioResult;
      } else if (parsed.data.mode === 'comic' || parsed.data.mode === 'short-drama') {
        const runId = `${parsed.data.chapterNumberStart}-${parsed.data.chapterNumberEnd}-${Date.now()}`;
        const outputDirRelative = toPosix(path.join(
          'adaptations',
          parsed.data.mode === 'comic' ? 'comic' : 'short-drama',
          `run-${runId}`,
        ));
        const characters = await deps.novelManager.getCharacters(novelId);

        const sceneCardsByChapter: Record<number, import('../../../../novel/types.js').SceneCard[]> = {};
        for (let chapter = parsed.data.chapterNumberStart; chapter <= parsed.data.chapterNumberEnd; chapter++) {
          let cards = await deps.adaptationManager.getSceneCards(novelId, chapter);
          if (cards.length === 0) {
            const chapterData = await deps.novelManager.getChapter(novelId, chapter);
            if (chapterData?.content?.trim()) {
              cards = deps.extractor.extract({
                chapterNumber: chapter,
                chapterTitle: chapterData.title,
                chapterContent: chapterData.content,
                characters: characters.map((char) => ({ id: char.id, name: char.name })),
              });
              await deps.adaptationManager.saveSceneCards(novelId, chapter, cards);
            }
          }
          sceneCardsByChapter[chapter] = cards;
        }

        if (parsed.data.mode === 'comic') {
          const comicResult = await deps.comicAdapter.generate({
            novelId,
            chapterNumberStart: parsed.data.chapterNumberStart,
            chapterNumberEnd: parsed.data.chapterNumberEnd,
            outputDirRelative,
            sceneCardsByChapter,
          });
          payloadPath = comicResult.payloadPath;
          artifactMeta.comic = comicResult;
        } else {
          const shortDramaResult = await deps.shortDramaAdapter.generate({
            novelId,
            chapterNumberStart: parsed.data.chapterNumberStart,
            chapterNumberEnd: parsed.data.chapterNumberEnd,
            outputDirRelative,
            sceneCardsByChapter,
            characterProfiles: characters.map((character) => ({
              id: character.id,
              name: character.name,
              aliases: character.aliases,
              appearance: character.appearance,
              personality: character.personality,
              speechStyle: character.speechStyle,
            })),
          });
          payloadPath = shortDramaResult.payloadPath;
          artifactMeta.shortDrama = shortDramaResult;
        }
      }

      const pack = await deps.adaptationManager.createPackage({
        novelId,
        chapterNumberStart: parsed.data.chapterNumberStart,
        chapterNumberEnd: parsed.data.chapterNumberEnd,
        mode: parsed.data.mode,
        payloadPath,
        qaReportPath: parsed.data.qaReportPath,
      });

      res.status(201).json({
        ...pack,
        artifacts: artifactMeta,
      });
    } catch (err) {
      res.status(500).json({
        error: '创建改编包失败',
        detail: safeErrorMessage(err, String(err)),
      });
    }
  });
}
