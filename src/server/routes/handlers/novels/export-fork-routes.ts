import { z } from 'zod';
import type { Router } from 'express';
import { exportNovel } from '../../../../novel/exporter.js';
import type { NovelMetadata } from '../../../../novel/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { type LoadNovelRouteFn } from './route-support.js';

const ExportNovelBody = z.object({
  format: z.enum(['markdown', 'txt', 'html', 'epub']),
  includeMetadata: z.boolean().optional(),
  includeToc: z.boolean().optional(),
  chapterRange: z.object({
    from: z.number().int().positive(),
    to: z.number().int().positive(),
  }).optional(),
  stripSpeakerMarkers: z.boolean().optional(),
});

const ForkNovelBody = z.object({
  fromChapter: z.number().int().positive(),
  newTitle: z.string().min(1).optional(),
});

type ExportForkRouteDeps = {
  novelManager: {
    forkNovel: (id: string, fromChapter: number, newTitle: string | undefined, ownerId: string) => Promise<NovelMetadata>;
  };
  loadAccessibleNovel: LoadNovelRouteFn;
  tryAttachForkToUniverse: (sourceNovelId: string, forkedNovel: NovelMetadata, fromChapter: number) => Promise<void>;
};

export function registerNovelExportForkRoutes(
  router: Router,
  { novelManager, loadAccessibleNovel, tryAttachForkToUniverse }: ExportForkRouteDeps,
): void {
  router.post('/:id/export', async (req, res) => {
    try {
      const novel = await loadAccessibleNovel(req, res);
      if (!novel) return;
      const parsed = ExportNovelBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const result = await exportNovel(novelManager as any, novel.id, parsed.data);

      if (result.buffer) {
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
        res.send(result.buffer);
      } else {
        res.json({ content: result.content, filename: result.filename, mimeType: result.mimeType });
      }
    } catch (err) {
      const message = safeErrorMessage(err, '导出小说失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.post('/:id/fork', async (req, res) => {
    try {
      const sourceNovel = await loadAccessibleNovel(req, res);
      if (!sourceNovel) return;
      const parsed = ForkNovelBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const ownerId = req.auth?.id ?? 'dev';
      const novel = await novelManager.forkNovel(
        sourceNovel.id,
        parsed.data.fromChapter,
        parsed.data.newTitle,
        ownerId,
      );
      await tryAttachForkToUniverse(sourceNovel.id, novel, parsed.data.fromChapter).catch(() => {});
      res.status(201).json(novel);
    } catch (err) {
      const message = safeErrorMessage(err, '创建分支失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
