import { Router } from 'express';
import { z } from 'zod';
import { WechatArticleProjectStore } from '../../publishing/wechat-article-project-store.js';
import { WechatArticleTopicIdeaService } from '../../publishing/wechat-article-topic-idea-service.js';
import { WechatArticleWorkbenchService } from '../../publishing/wechat-article-workbench-service.js';
import type { ModelClient } from '../../models/types.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

const CreateWechatArticleProjectSchema = z.object({
  title: z.string().trim().min(2).max(80),
  targetAudience: z.string().trim().min(2).max(80),
  articleType: z.string().trim().min(2).max(40),
  corePromise: z.string().trim().min(6).max(200),
  sourceNotes: z.string().trim().max(4000).optional(),
  targetWords: z.number().int().min(600).max(6000),
});

const SaveWechatArticleDraftSchema = z.object({
  draft: z.string().trim().min(20).max(30000),
});

const GenerateWechatArticleTopicIdeasSchema = z.object({
  count: z.number().int().min(6).max(12).optional(),
  focus: z.string().trim().min(2).max(120).optional(),
});

export function createWechatArticleRouter(params: {
  dataDir: string;
  modelClient?: ModelClient;
}): Router {
  const router = Router();
  const store = new WechatArticleProjectStore(params.dataDir);
  const workbenchService = params.modelClient
    ? new WechatArticleWorkbenchService(params.modelClient)
    : null;
  const topicIdeaService = params.modelClient
    ? new WechatArticleTopicIdeaService(params.modelClient)
    : null;

  function requireWorkbench(res: import('express').Response): boolean {
    if (workbenchService) return true;
    res.status(503).json({ error: 'AI 模型尚未配置，暂时无法生成或评审文章' });
    return false;
  }

  router.get('/projects', async (_req, res) => {
    try {
      const projects = await store.listProjects();
      res.json({ projects });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '读取公众号文章项目失败') });
    }
  });

  router.post('/topic-ideas', async (req, res) => {
    if (!topicIdeaService) {
      res.status(503).json({ error: 'AI 模型尚未配置，暂时无法生成选题' });
      return;
    }
    try {
      const body = GenerateWechatArticleTopicIdeasSchema.parse(req.body ?? {});
      const ideas = await topicIdeaService.generateIdeas(body);
      res.json({ ideas });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0]?.message ?? '请求参数无效' });
        return;
      }
      res.status(500).json({ error: safeErrorMessage(error, '生成公众号选题失败') });
    }
  });

  router.post('/projects', async (req, res) => {
    try {
      const body = CreateWechatArticleProjectSchema.parse(req.body);
      const project = await store.createProject(body);
      res.status(201).json({ project });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0]?.message ?? '请求参数无效' });
        return;
      }
      res.status(500).json({ error: safeErrorMessage(error, '创建公众号文章项目失败') });
    }
  });

  router.get('/projects/:projectId', async (req, res) => {
    try {
      const project = await store.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '文章项目不存在' });
        return;
      }
      res.json({ project });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '读取文章项目失败') });
    }
  });

  router.post('/projects/:projectId/generate-draft', async (req, res) => {
    if (!requireWorkbench(res)) return;
    try {
      const project = await store.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '文章项目不存在' });
        return;
      }
      const generated = await workbenchService!.generateDraft(project);
      const updated = await store.saveDraft(project.id, generated);
      res.json({ project: updated });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '生成文章初稿失败') });
    }
  });

  router.post('/projects/:projectId/save-draft', async (req, res) => {
    try {
      const body = SaveWechatArticleDraftSchema.parse(req.body);
      const updated = await store.saveManualDraft(req.params.projectId, body);
      if (!updated) {
        res.status(404).json({ error: '文章项目不存在' });
        return;
      }
      res.json({ project: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0]?.message ?? '请求参数无效' });
        return;
      }
      res.status(500).json({ error: safeErrorMessage(error, '保存人工稿件失败') });
    }
  });

  router.post('/projects/:projectId/review', async (req, res) => {
    if (!requireWorkbench(res)) return;
    try {
      const project = await store.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '文章项目不存在' });
        return;
      }
      const review = await workbenchService!.reviewDraft(project);
      const updated = await store.saveReview(project.id, review);
      res.json({ project: updated });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '五维评审失败') });
    }
  });

  router.post('/projects/:projectId/revise-draft', async (req, res) => {
    if (!requireWorkbench(res)) return;
    try {
      const project = await store.getProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '文章项目不存在' });
        return;
      }
      const revised = await workbenchService!.reviseDraft(project);
      const updated = await store.saveRevisedDraft(project.id, revised);
      res.json({ project: updated });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '根据评审修订文章失败') });
    }
  });

  return router;
}
