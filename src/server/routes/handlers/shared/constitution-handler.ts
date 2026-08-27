import type { Request, Response } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { ModelClient } from '../../../../models/types.js';
import { NovelConstitution } from '../../../../novel/constitution-types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { generateAndPersistConstitution } from './constitution-service.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('constitution-handler');

function getNovelId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

/**
 * GET /api/novels/:id/constitution
 */
export async function getConstitution(
  req: Request,
  res: Response,
  novelManager: NovelManager,
): Promise<void> {
  try {
    const novel = await novelManager.getNovel(getNovelId(req));
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return;
    }
    res.json({ constitution: novel.constitution ?? null });
  } catch (err) {
    const message = safeErrorMessage(err, '获取宪章失败');
    res.status(500).json({ error: message });
  }
}

/**
 * POST /api/novels/:id/constitution/generate
 */
export async function generateConstitution(
  req: Request,
  res: Response,
  novelManager: NovelManager,
  modelClient: ModelClient,
): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = 90_000;
  const timer = setTimeout(() => controller.abort(new Error(`宪章生成超时（>${Math.round(timeoutMs / 1000)} 秒）`)), timeoutMs);
  try {
    const novel = await novelManager.getNovel(getNovelId(req));
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return;
    }

    const constitution = await generateAndPersistConstitution({
      novel,
      novelManager,
      modelClient,
      source: 'generate',
      signal: controller.signal,
    });
    log.info('宪章已生成', { novelId: novel.id, version: constitution.version });
    res.json({ constitution });
  } catch (err) {
    const message = safeErrorMessage(err, '生成宪章失败');
    log.error('生成宪章失败', { novelId: getNovelId(req), error: message });
    const status = controller.signal.aborted ? 504 : 500;
    res.status(status).json({ error: message });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PUT /api/novels/:id/constitution
 */
export async function updateConstitution(
  req: Request,
  res: Response,
  novelManager: NovelManager,
): Promise<void> {
  try {
    const novel = await novelManager.getNovel(getNovelId(req));
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return;
    }

    const parsed = NovelConstitution.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '宪章数据格式错误' });
      return;
    }

    const constitution = {
      ...parsed.data,
      version: (novel.constitution?.version ?? 0) + 1,
      generatedAt: novel.constitution?.generatedAt ?? parsed.data.generatedAt,
      updatedAt: new Date().toISOString(),
    };

    await novelManager.saveConstitution(novel.id, constitution, 'manual-save');
    log.info('宪章已更新', { novelId: novel.id, version: constitution.version });
    res.json({ constitution });
  } catch (err) {
    const message = safeErrorMessage(err, '更新宪章失败');
    res.status(500).json({ error: message });
  }
}

export async function getConstitutionVersions(
  req: Request,
  res: Response,
  novelManager: NovelManager,
): Promise<void> {
  try {
    const novel = await novelManager.getNovel(getNovelId(req));
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return;
    }
    const history = await novelManager.getConstitutionVersions(novel.id);
    res.json(history);
  } catch (err) {
    const message = safeErrorMessage(err, '获取宪章版本失败');
    res.status(500).json({ error: message });
  }
}

export async function rollbackConstitution(
  req: Request,
  res: Response,
  novelManager: NovelManager,
): Promise<void> {
  try {
    const novel = await novelManager.getNovel(getNovelId(req));
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return;
    }
    const rawVersion = Array.isArray(req.params.version) ? req.params.version[0] : req.params.version;
    const version = Number.parseInt(String(rawVersion ?? ''), 10);
    if (!Number.isFinite(version) || version <= 0) {
      res.status(400).json({ error: '版本号无效' });
      return;
    }

    const constitution = await novelManager.rollbackConstitutionToVersion(novel.id, version);
    log.info('宪章已回滚', { novelId: novel.id, targetVersion: version, currentVersion: constitution.version });
    res.json({ constitution });
  } catch (err) {
    const message = safeErrorMessage(err, '回滚宪章失败');
    const status = /不存在/.test(message) ? 404 : 500;
    res.status(status).json({ error: message });
  }
}
