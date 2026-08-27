import { z } from 'zod';
import type { Router } from 'express';
import type { StoryStateManager } from '../../../../novel/story-state-manager.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  decryptNovelApiKey,
  encryptNovelApiKey,
  isApiKeyMasked,
  maskApiKeyForDisplay,
} from '../../helpers/novel-api-key-crypto.js';
import { NOVEL_CONSTITUTION_TAG_IDS } from '../../../../config/novel-constitution-tags.js';
import { type LoadNovelRouteFn } from './route-support.js';

const UpdateNovelBody = z.object({
  title: z.string().min(1).optional(),
  genre: z.enum(['fantasy', 'mystery', 'modern', 'scifi', 'historical', 'romance', 'custom']).optional(),
  synopsis: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'writing', 'paused', 'completed', 'published']).optional(),
  targetChapters: z.number().int().positive().optional(),
  titleGuidance: z.boolean().optional(),
  startupPlatformProfile: z.enum(['auto', 'fanqie', 'qidian']).optional(),
  edgeNarratorVoice: z.string().min(1).optional(),
  tags: z.array(z.string().min(1).max(20)).max(10).optional(),
  constitutionTags: z.array(z.enum(NOVEL_CONSTITUTION_TAG_IDS as [string, ...string[]])).max(6).optional(),
  coverImage: z.string().optional(),
  modelConfig: z.object({
    provider: z.enum([
      'anthropic', 'openai', 'custom-openai', 'ollama', 'deepseek', 'qwen', 'zhipu',
      'moonshot', 'doubao', 'baichuan', 'stepfun', 'minimax', 'siliconflow',
    ]),
    source: z.enum(['platform', 'user-profile']).optional(),
    userApiProfileId: z.string().uuid().optional(),
    userApiProfileStorageMode: z.enum(['server', 'local']).optional(),
    userApiProfileName: z.string().max(80).optional(),
    apiKey: z.string().max(200).default(''),
    model: z.string().default(''),
    baseUrl: z.string().default(''),
    temperature: z.number().min(0).max(2).default(0.7),
  }).optional().nullable(),
  embeddingConfig: z.object({
    provider: z.enum(['openai', 'ollama', 'qwen', 'zhipu', 'siliconflow']),
    apiKey: z.string().max(200).default(''),
    model: z.string().default(''),
    baseUrl: z.string().default(''),
  }).optional().nullable(),
  titleRecommendations: z.array(z.object({
    id: z.string().uuid(),
    platform: z.enum(['qidian', 'fanqie', 'general']),
    titles: z.array(z.object({ title: z.string(), reasoning: z.string().default('') })),
    shortSynopsis: z.string().default(''),
    longSynopsis: z.string().default(''),
    tags: z.array(z.string()).default([]),
    marketingInsight: z.string().default(''),
    createdAt: z.string().datetime(),
  })).optional(),
});

type NovelLifecycleRouteDeps = {
  novelManager: {
    getNovel: (id: string) => Promise<any>;
    updateNovel: (id: string, updates: Record<string, any>) => Promise<any>;
    deleteNovel: (id: string) => Promise<void>;
  };
  storyStateManager?: StoryStateManager;
  novelMemory?: NovelMemory;
  bookStoreManager?: BookStoreManager;
  loadAccessibleNovel: LoadNovelRouteFn;
};

function sanitizeNovelApiKeys(novel: any): void {
  if (novel?.modelConfig?.apiKey) {
    const plain = decryptNovelApiKey(novel.modelConfig.apiKey);
    novel.modelConfig.apiKey = plain ? maskApiKeyForDisplay(plain) : '';
  }
  if (novel?.embeddingConfig?.apiKey) {
    const plain = decryptNovelApiKey(novel.embeddingConfig.apiKey);
    novel.embeddingConfig.apiKey = plain ? maskApiKeyForDisplay(plain) : '';
  }
}

export function registerNovelLifecycleRoutes(
  router: Router,
  { novelManager, storyStateManager, novelMemory, bookStoreManager, loadAccessibleNovel }: NovelLifecycleRouteDeps,
): void {
  router.put('/:id', async (req, res) => {
    try {
      const novel = await novelManager.getNovel(req.params.id);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const userId = req.auth?.id ?? 'dev';
      const novelOwnerId = novel.ownerId ?? 'dev';
      if (novelOwnerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '无权修改此小说' });
        return;
      }

      const parsed = UpdateNovelBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const updates = { ...parsed.data } as Record<string, any>;
      if (updates.modelConfig === null) {
        updates.modelConfig = undefined;
      }
      if (updates.modelConfig?.apiKey) {
        if (isApiKeyMasked(updates.modelConfig.apiKey)) {
          updates.modelConfig.apiKey = novel.modelConfig?.apiKey ?? '';
        } else {
          updates.modelConfig.apiKey = encryptNovelApiKey(updates.modelConfig.apiKey);
        }
      }
      const embeddingConfigChanged = 'embeddingConfig' in parsed.data;
      if (updates.embeddingConfig === null) {
        updates.embeddingConfig = undefined;
      }
      if (updates.embeddingConfig?.apiKey) {
        if (isApiKeyMasked(updates.embeddingConfig.apiKey)) {
          updates.embeddingConfig.apiKey = novel.embeddingConfig?.apiKey ?? '';
        } else {
          updates.embeddingConfig.apiKey = encryptNovelApiKey(updates.embeddingConfig.apiKey);
        }
      }
      const updatedNovel = await novelManager.updateNovel(req.params.id, updates);
      if (embeddingConfigChanged) {
        novelMemory?.invalidateNovelEmbedding(req.params.id);
      }
      sanitizeNovelApiKeys(updatedNovel);
      res.json(updatedNovel);
    } catch (err) {
      const message = safeErrorMessage(err, '更新小说失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const novelId = req.params.id;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const userId = req.auth?.id ?? 'dev';
      const novelOwnerId = novel.ownerId ?? 'dev';
      if (novelOwnerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '无权删除此小说' });
        return;
      }

      if (bookStoreManager) {
        const book = await bookStoreManager.getBookByNovelId(novelId);
        if (book && book.publishStatus !== 'rejected') {
          res.status(409).json({ error: '该小说已发布到书城，请先从书城下架后再删除' });
          return;
        }
      }

      await novelManager.deleteNovel(novelId);
      storyStateManager?.clearNovelCache(novelId);
      res.status(204).send();
    } catch (err) {
      const message = safeErrorMessage(err, '删除小说失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const novel = await loadAccessibleNovel(req, res);
      if (!novel) return;
      sanitizeNovelApiKeys(novel);
      res.json(novel);
    } catch (err) {
      const message = safeErrorMessage(err, '获取小说详情失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
