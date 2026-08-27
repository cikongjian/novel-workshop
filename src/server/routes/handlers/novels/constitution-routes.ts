import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { ModelClient } from '../../../../models/types.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  getConstitution,
  getConstitutionVersions,
  rollbackConstitution,
  updateConstitution,
} from '../shared/constitution-handler.js';
import { constitutionGenerationService } from '../shared/constitution-generation-service.js';
import { type LoadNovelRouteFn } from './route-support.js';

type NovelConstitutionRouteDeps = {
  novelManager: NovelManager;
  authDb?: AuthDb;
  modelClient?: ModelClient;
  broadcastJson?: (frame: Record<string, unknown>) => void;
  loadAccessibleNovel: LoadNovelRouteFn;
  loadOwnedNovelForWrite: LoadNovelRouteFn;
};

export function registerNovelConstitutionRoutes(
  router: Router,
  {
    novelManager,
    authDb,
    modelClient,
    broadcastJson,
    loadAccessibleNovel,
    loadOwnedNovelForWrite,
  }: NovelConstitutionRouteDeps,
): void {
  router.get('/:id/constitution', async (req, res) => {
    const novel = await loadAccessibleNovel(req, res);
    if (!novel) return;
    await getConstitution(req, res, novelManager);
  });

  router.get('/:id/constitution/versions', async (req, res) => {
    const novel = await loadAccessibleNovel(req, res);
    if (!novel) return;
    await getConstitutionVersions(req, res, novelManager);
  });

  router.get('/:id/constitution/generation-status', async (req, res) => {
    const novel = await loadOwnedNovelForWrite(req, res);
    if (!novel) return;
    res.json({ task: constitutionGenerationService.getTask(novel.id) });
  });

  router.post('/:id/constitution/generate', async (req, res) => {
    const novel = await loadOwnedNovelForWrite(req, res);
    if (!novel) return;
    const activeTask = constitutionGenerationService.getTask(novel.id);
    if (activeTask && (activeTask.status === 'queued' || activeTask.status === 'running')) {
      res.status(202).json({ task: activeTask });
      return;
    }
    const modelAccess = await resolveUserModelAccess({
      authDb,
      userId: req.auth?.id,
      headers: req.headers,
      novel,
    });
    if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
      res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
      return;
    }
    const activeModelClient = modelAccess.client ?? modelClient;
    if (!activeModelClient) {
      res.status(503).json({ error: 'AI 功能尚未就绪：缺少可用模型配置' });
      return;
    }
    const task = constitutionGenerationService.startTask({
      novel,
      novelManager,
      modelClient: activeModelClient,
      broadcastJson,
    });
    res.status(202).json({ task });
  });

  router.put('/:id/constitution', async (req, res) => {
    const novel = await loadOwnedNovelForWrite(req, res);
    if (!novel) return;
    await updateConstitution(req, res, novelManager);
  });

  router.post('/:id/constitution/rollback/:version', async (req, res) => {
    const novel = await loadOwnedNovelForWrite(req, res);
    if (!novel) return;
    await rollbackConstitution(req, res, novelManager);
  });
}
