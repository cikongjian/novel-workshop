import fs from 'node:fs/promises';
import path from 'node:path';
import type { Router } from 'express';
import { getNovelsDir } from '../../../../config/index.js';
import { resolveNovelStorageDir } from '../../../../novel/data-root.js';
import { resolvePathWithin } from '../../../../utils/path-safety.js';
import {
  DeleteAdaptationQuery,
  ensureNovelAccess,
  ListAdaptationQuery,
  RunQABody,
  type ResolvedAdaptationRouteDeps,
} from './route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerAdaptationPackageRoutes(
  router: Router,
  deps: Pick<
    ResolvedAdaptationRouteDeps,
    'adaptationManager' | 'complianceChecker' | 'novelManager' | 'qaGate'
  >,
): void {
  router.get('/', async (req, res) => {
    const parsed = ListAdaptationQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const packages = await deps.adaptationManager.listPackages(novelId, parsed.data);
      res.json(packages);
    } catch (err) {
      res.status(500).json({
        error: '获取改编包列表失败',
        detail: safeErrorMessage(err, String(err)),
      });
    }
  });

  router.get('/:packageId/payload', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const pack = await deps.adaptationManager.getPackage(novelId, req.params.packageId);
      if (!pack) {
        res.status(404).json({ error: '改编包不存在' });
        return;
      }

      const novelDir = resolveNovelStorageDir(getNovelsDir(), novelId);
      const payloadAbsolutePath = path.isAbsolute(pack.payloadPath)
        ? resolvePathWithin(novelDir, path.relative(novelDir, pack.payloadPath))
        : resolvePathWithin(novelDir, pack.payloadPath);
      const payloadRaw = await fs.readFile(payloadAbsolutePath, 'utf-8');
      const payload = JSON.parse(payloadRaw) as unknown;
      res.json({
        packageId: pack.id,
        mode: pack.mode,
        payloadPath: pack.payloadPath,
        payload,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error?.code === 'ENOENT') {
        res.status(404).json({ error: '改编产物文件不存在' });
        return;
      }
      res.status(500).json({
        error: '读取改编产物失败',
        detail: safeErrorMessage(err, String(err)),
      });
    }
  });

  router.get('/:packageId', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const pack = await deps.adaptationManager.getPackage(novelId, req.params.packageId);
      if (!pack) {
        res.status(404).json({ error: '改编包不存在' });
        return;
      }
      res.json(pack);
    } catch (err) {
      res.status(500).json({
        error: '获取改编包失败',
        detail: safeErrorMessage(err, String(err)),
      });
    }
  });

  router.delete('/:packageId', async (req, res) => {
    const parsedQuery = DeleteAdaptationQuery.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: parsedQuery.error.issues[0].message });
      return;
    }

    const removeArtifactsRaw = parsedQuery.data.removeArtifacts;
    const removeArtifacts = removeArtifactsRaw === undefined
      ? true
      : removeArtifactsRaw === true || removeArtifactsRaw === 'true';

    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const result = await deps.adaptationManager.deletePackage(novelId, req.params.packageId, {
        removeArtifacts,
      });
      if (!result.deleted) {
        res.status(404).json({ error: '改编包不存在' });
        return;
      }
      res.json({
        packageId: req.params.packageId,
        deleted: true,
        removeArtifacts,
        removedArtifacts: result.removedArtifacts,
      });
    } catch (err) {
      res.status(500).json({
        error: '删除改编包失败',
        detail: safeErrorMessage(err, String(err)),
      });
    }
  });

  router.post('/:packageId/qa', async (req, res) => {
    const parsed = RunQABody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const pack = await deps.adaptationManager.getPackage(novelId, req.params.packageId);
      if (!pack) {
        res.status(404).json({ error: '改编包不存在' });
        return;
      }

      let passed: boolean;
      let qaReport: unknown;

      if (typeof parsed.data.passed === 'boolean') {
        passed = parsed.data.passed;
        qaReport = {
          packageId: pack.id,
          mode: pack.mode,
          passed,
          checkedAt: new Date().toISOString(),
          source: 'manual',
        };
      } else {
        const sceneCardCountByChapter: Record<number, number> = {};
        for (let chapter = pack.chapterNumberStart; chapter <= pack.chapterNumberEnd; chapter++) {
          const cards = await deps.adaptationManager.getSceneCards(novelId, chapter);
          sceneCardCountByChapter[chapter] = cards.length;
        }
        const report = deps.qaGate.evaluate({
          pack,
          sceneCardCountByChapter,
        });
        passed = report.passed;
        qaReport = report;
      }

      const qaReportPath = await deps.adaptationManager.saveQAReport(
        novelId,
        pack.id,
        qaReport,
        parsed.data.qaReportPath,
      );
      const next = await deps.adaptationManager.updatePackageStatus(novelId, pack.id, {
        status: passed ? 'passed' : 'failed',
        qaReportPath,
      });

      res.json({ ...next, qaResult: qaReport });
    } catch (err) {
      const message = safeErrorMessage(err, String(err));
      if (message.includes('不存在')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({
        error: '更新改编包 QA 状态失败',
        detail: message,
      });
    }
  });

  router.post('/:packageId/publish-ready-check', async (req, res) => {
    try {
      const novelId = await ensureNovelAccess(req, res, deps.novelManager);
      if (!novelId) {
        return;
      }
      const pack = await deps.adaptationManager.getPackage(novelId, req.params.packageId);
      if (!pack) {
        res.status(404).json({ error: '改编包不存在' });
        return;
      }

      const result = await deps.complianceChecker.check(novelId, pack);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: '发布前检查失败',
        detail: safeErrorMessage(err, String(err)),
      });
    }
  });
}
