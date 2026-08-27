import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { ModelClient } from '../../models/types.js';
import { analyzeText } from '../../style/style-analyzer.js';
import { mergeStyleProfiles } from '../../style/style-merger.js';
import type { StyleDNA } from '../../style/style-types.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export function createStyleDnaRouter(novelManager: NovelManager, _modelClient?: ModelClient): Router {
  const router = Router({ mergeParams: true });

  const sendDeprecated = (res: import('express').Response, code: string, error = 'Style DNA reference import endpoint has been deprecated.') => {
    res.status(410).json({
      error,
      code,
    });
  };

  async function ensureNovelAccess(
    req: import('express').Request,
    res: import('express').Response,
  ): Promise<string | null> {
    const { novelId } = req.params as Record<string, string>;
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return null;
    }
    return novelId;
  }

  router.get('/', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res);
      if (!novelId) {
        return;
      }
      const dna = await novelManager.getStyleDna(novelId);
      res.json(dna);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取风格 DNA 失败') });
    }
  });

  router.post('/analyze', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res);
      if (!novelId) {
        return;
      }

      const { sampleText, sampleName, mode } = req.body as {
        sampleText: string;
        sampleName: string;
        mode: 'replace' | 'merge';
      };
      if (!sampleText || sampleText.length < 500) {
        res.status(400).json({ error: '样本文本至少需要 500 字' });
        return;
      }

      const analysis = analyzeText(sampleText);
      const existing = await novelManager.getStyleDna(novelId);
      const now = new Date().toISOString();
      const sample = {
        name: sampleName || '未命名样本',
        charCount: sampleText.length,
        addedAt: now,
      };

      let dna: StyleDNA;
      if (mode === 'merge' && existing) {
        dna = mergeStyleProfiles(existing, analysis, sampleText.length);
        dna.samples = [...existing.samples, sample];
      } else {
        dna = {
          id: randomUUID(),
          novelId,
          name: existing?.name ?? '默认风格',
          sentenceLength: analysis.sentenceLength,
          paragraphStructure: analysis.paragraphStructure,
          dialogue: analysis.dialogue,
          rhetoric: analysis.rhetoric,
          vocabulary: analysis.vocabulary,
          tone: analysis.tone,
          userNotes: existing?.userNotes ?? '',
          samples: [sample],
          totalSampleChars: sampleText.length,
          enabled: existing?.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        };
      }

      await novelManager.saveStyleDna(novelId, dna);
      res.json(dna);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '分析风格失败') });
    }
  });

  router.post('/preview', async (req, res) => {
    if (!(await ensureNovelAccess(req, res))) {
      return;
    }
    sendDeprecated(
      res,
      'STYLE_DNA_PREVIEW_DEPRECATED',
      'Style DNA preview endpoint has been deprecated.',
    );
  });

  router.put('/', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res);
      if (!novelId) {
        return;
      }
      const existing = await novelManager.getStyleDna(novelId);
      if (!existing) {
        res.status(404).json({ error: '风格 DNA 不存在' });
        return;
      }

      const { enabled, userNotes, name } = req.body as {
        enabled?: boolean;
        userNotes?: string;
        name?: string;
      };
      if (typeof enabled === 'boolean') {
        existing.enabled = enabled;
      }
      if (typeof userNotes === 'string') {
        existing.userNotes = userNotes;
      }
      if (typeof name === 'string') {
        existing.name = name;
      }

      existing.updatedAt = new Date().toISOString();
      await novelManager.saveStyleDna(novelId, existing);
      res.json(existing);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '更新风格 DNA 失败') });
    }
  });

  router.delete('/', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res);
      if (!novelId) {
        return;
      }
      await novelManager.deleteStyleDna(novelId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '删除风格 DNA 失败') });
    }
  });

  router.post('/analyze-reference', async (req, res) => {
    if (!(await ensureNovelAccess(req, res))) {
      return;
    }
    sendDeprecated(res, 'STYLE_DNA_ANALYZE_REFERENCE_DEPRECATED');
  });

  router.post('/import-reference', async (req, res) => {
    if (!(await ensureNovelAccess(req, res))) {
      return;
    }
    sendDeprecated(res, 'STYLE_DNA_IMPORT_REFERENCE_DEPRECATED');
  });

  return router;
}
