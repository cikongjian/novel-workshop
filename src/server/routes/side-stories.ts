/**
 * AI 番外生成路由 — 读者用自己的 AI Key 生成番外（SSE 流式），作者审核发布。
 * 生成后通知作者审核；发布后通知收藏该小说的读者。
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SideStoryService, SideStorySceneType } from '../../services/side-story-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { ModelClient, ChatMessage } from '../../models/types.js';
import type { AuthDb } from '../../auth/types.js';
import type { NotificationService } from '../../services/notification-service.js';
import type { UnifiedMessageService } from '../../services/unified-message-service.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { resolveUserModelAccess } from './helpers/user-api-model-resolver.js';

function getUserId(req: Request): string | null {
  return req.auth?.id ?? null;
}

const SCENE_LABELS: Record<SideStorySceneType, string> = {
  childhood: '角色童年',
  daily: '日常番外',
  'what-if': '如果线',
  prequel: '前传故事',
  custom: '自定义场景',
};

function buildSystemPrompt(
  novelTitle: string,
  novelSynopsis: string,
  characters: any[],
  sceneType: SideStorySceneType,
  customScene: string | undefined,
  wordCount: number,
): string {
  const charProfiles = characters
    .map((c) => {
      return `### ${c.name}（${c.role || '角色'}）
- 性格：${c.personality || '未设定'}
- 语言风格：${c.speechStyle || '未设定'}
- 背景：${c.backstory || '未设定'}
- 动机：${c.motivation || '未设定'}
- 当前状态：${c.currentState || '未设定'}`;
    })
    .join('\n\n');

  const sceneDesc =
    sceneType === 'custom' && customScene
      ? `自定义场景：${customScene}`
      : SCENE_LABELS[sceneType];

  return `你是一位专业的小说番外创作专家。请根据以下信息创作一篇番外短篇。

## 小说信息
- 标题：《${novelTitle}》
- 简介：${novelSynopsis || '（暂无简介）'}

## 角色信息
${charProfiles}

## 场景要求
${sceneDesc}

## 创作要求
1. 保持角色性格一致，严格符合原作设定
2. 番外独立成篇，不影响主线剧情
3. 字数约 ${wordCount} 字
4. 如果是"角色童年"，需要符合角色背景故事，展现成长经历
5. 如果是"日常番外"，写轻松温馨的日常场景
6. 如果是"如果线"，可以大胆假设角色做了不同选择后的故事
7. 如果是"前传故事"，写正文开始之前的事件
8. 开头直接进入故事，不要写"番外""标题"等元信息
9. 用第三人称叙事，文学性强，有画面感

请直接输出番外正文，不要有任何前言、解释或标记。`;
}

export function createSideStoryRouter(
  sideStoryService: SideStoryService,
  novelManager: NovelManager,
  _modelClient: ModelClient | undefined,
  authDb?: AuthDb,
  notificationService?: NotificationService,
  bookStoreManager?: BookStoreManager,
  msgService?: UnifiedMessageService,
): Router {
  const router = Router();

  // ── 生成番外（SSE 流式） ──
  router.post('/generate', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }

      const {
        novelId,
        characterIds,
        sceneType,
        customScene,
        wordCount: requestedWordCount,
      } = req.body as {
        novelId: string;
        characterIds: string[];
        sceneType: SideStorySceneType;
        customScene?: string;
        wordCount?: number;
      };

      if (!novelId || !characterIds?.length || !sceneType) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
      }

      // 频率限制
      const limitCheck = sideStoryService.checkDailyLimit(novelId, userId);
      if (!limitCheck.ok) {
        res.status(429).json({ error: limitCheck.reason });
        return;
      }

      // 获取小说信息
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      // 解析读者的 AI Key（不传 novel，强制使用读者自己的 Key）
      const access = await resolveUserModelAccess({
        authDb,
        userId,
        headers: req.headers,
      });

      if (!access.client || !access.billingBypass) {
        res.status(403).json({
          error: '生成番外需要配置自己的 AI Key，请先在「我的 → API 设置」中添加',
        });
        return;
      }

      const userClient = access.client;

      // 获取角色信息
      const allCharacters = (await novelManager.getCharacters?.(novelId)) ?? [];
      const selectedCharacters = (allCharacters as any[]).filter((c) =>
        characterIds.includes(c.id),
      );
      if (selectedCharacters.length === 0) {
        res.status(404).json({ error: '未找到选中的角色' });
        return;
      }

      const wordCount = Math.min(Math.max(requestedWordCount ?? 2000, 1000), 3000);

      const systemPrompt = buildSystemPrompt(
        novel.title,
        novel.synopsis || novel.description || '',
        selectedCharacters,
        sceneType,
        customScene,
        wordCount,
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请开始创作番外故事。' },
      ];

      // SSE 流式输出
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let fullContent = '';
      try {
        await userClient.chatStream(messages, { temperature: 0.9, maxTokens: wordCount * 2 }, (chunk: string) => {
          fullContent += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        });

        // 保存番外
        const charNames = selectedCharacters.map((c) => c.name);
        const title = `${charNames.join('与')}的${SCENE_LABELS[sceneType]}`;
        const story = sideStoryService.create({
          novelId,
          title,
          content: fullContent.trim(),
          characterIds,
          characterNames: charNames,
          sceneType,
          customScene,
          generatedBy: userId,
        });

        // 通知作者有新番外待审核（fire-and-forget，含作者自己生成的情况）
        if (notificationService && novel.ownerId) {
          try {
            notificationService.addInAppNotification(novel.ownerId, {
              userId: novel.ownerId,
              type: 'system',
              title: '有新番外待审核',
              body: `读者生成了一篇《${novel.title}》的番外「${title}」，快来审核`,
              data: {
                novelId,
                novelTitle: novel.title,
                route: `/m/novel/${novelId}`,
              },
            });
            void notificationService.sendPushToUser(novel.ownerId, {
              title: '有新番外待审核',
              body: `《${novel.title}》有读者生成的番外待审核`,
              tag: `side-story-review-${novelId}`,
              data: { route: `/m/novel/${novelId}` },
            });
          } catch (e) {
            console.error('[side-stories] notify author failed:', e);
          }
        }

        res.write(`data: ${JSON.stringify({ type: 'done', storyId: story.id, title: story.title, status: story.status })}\n\n`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI 生成失败';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }
      res.end();
    } catch (err) {
      console.error('[side-stories] generate error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '生成番外失败' });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: '生成番外失败' })}\n\n`);
        res.end();
      }
    }
  });

  // ── 列表 ──
  router.get('/by-novel/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const isOwner = novel.ownerId === userId || req.auth?.role === 'admin';
      const stories = sideStoryService.listByNovel(novelId, isOwner);
      res.json(stories);
    } catch (err) {
      console.error('[side-stories] list error:', err);
      res.status(500).json({ error: '获取列表失败' });
    }
  });

  // ── 详情 ──
  router.get('/:id', async (req, res) => {
    try {
      const story = sideStoryService.getById(req.params.id);
      if (!story) {
        res.status(404).json({ error: '番外不存在' });
        return;
      }
      // 非已发布的只有作者和生成者可看
      const userId = getUserId(req);
      const novel = await novelManager.getNovel(story.novelId);
      const isOwner = novel?.ownerId === userId || req.auth?.role === 'admin';
      if (story.status !== 'published' && !isOwner && story.generatedBy !== userId) {
        res.status(403).json({ error: '无权查看' });
        return;
      }
      res.json(story);
    } catch (err) {
      console.error('[side-stories] detail error:', err);
      res.status(500).json({ error: '获取详情失败' });
    }
  });

  // ── 审核 ──
  router.post('/:id/review', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { id } = req.params;
      const { status } = req.body as { status: 'approved' | 'rejected' | 'published' };
      if (!['approved', 'rejected', 'published'].includes(status)) {
        res.status(400).json({ error: '无效的审核状态' });
        return;
      }
      const story = sideStoryService.getById(id);
      if (!story) {
        res.status(404).json({ error: '番外不存在' });
        return;
      }
      const novel = await novelManager.getNovel(story.novelId);
      if (!novel || (novel.ownerId !== userId && req.auth?.role !== 'admin')) {
        res.status(403).json({ error: '无权审核' });
        return;
      }
      const updated = sideStoryService.review(id, status, userId);

      // 发布番外时通知收藏该小说的读者（fire-and-forget）
      if (status === 'published' && notificationService && bookStoreManager) {
        try {
          const book = await bookStoreManager.getBookByNovelId(story.novelId);
          const favoritedBy: string[] = book?.favoritedBy ?? [];
          const sceneLabel = SCENE_LABELS[story.sceneType] || '番外';
          const notifTitle = `《${novel.title}》有新番外啦`;
          const notifBody = `${story.characterNames.join('与')}的${sceneLabel}已发布，快来阅读`;

          for (const readerId of favoritedBy) {
            // 跳过作者自己和生成者
            if (readerId === novel.ownerId || readerId === story.generatedBy) continue;
            try {
              notificationService.addInAppNotification(readerId, {
                userId: readerId,
                type: 'favorite_update',
                title: notifTitle,
                body: notifBody,
                data: {
                  novelId: story.novelId,
                  novelTitle: novel.title,
                  route: `/m/novel/${story.novelId}`,
                },
              });
              void notificationService.sendPushToUser(readerId, {
                title: notifTitle,
                body: notifBody,
                tag: `side-story-published-${story.novelId}`,
                data: { route: `/m/novel/${story.novelId}` },
              });
              // 写入统一消息中心：番外推荐
              if (msgService) {
                try {
                  msgService.notifySideStory({
                    userId: readerId,
                    novelId: story.novelId,
                    storyTitle: story.title,
                    storyId: story.id,
                    characterName: story.characterNames?.[0],
                    characterId: story.characterIds?.[0],
                  });
                } catch { /* 不阻塞 */ }
              }
            } catch (e) {
              console.error(`[side-stories] notify reader ${readerId} failed:`, e);
            }
          }
        } catch (e) {
          console.error('[side-stories] notify favorited readers failed:', e);
        }
      }

      res.json(updated);
    } catch (err) {
      console.error('[side-stories] review error:', err);
      res.status(500).json({ error: '审核失败' });
    }
  });

  // ── 点赞 ──
  router.post('/:id/like', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const result = sideStoryService.toggleLike(req.params.id, userId);
      if (!result) {
        res.status(404).json({ error: '番外不存在' });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error('[side-stories] like error:', err);
      res.status(500).json({ error: '点赞失败' });
    }
  });

  // ── 删除 ──
  router.delete('/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const story = sideStoryService.getById(req.params.id);
      if (!story) {
        res.status(404).json({ error: '番外不存在' });
        return;
      }
      const novel = await novelManager.getNovel(story.novelId);
      const isOwner = novel?.ownerId === userId || req.auth?.role === 'admin';
      if (!isOwner && story.generatedBy !== userId) {
        res.status(403).json({ error: '无权删除' });
        return;
      }
      sideStoryService.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error('[side-stories] delete error:', err);
      res.status(500).json({ error: '删除失败' });
    }
  });

  // ── 获取配置 ──
  router.get('/config/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const isOwner = novel.ownerId === userId || req.auth?.role === 'admin';
      if (!isOwner) {
        res.status(403).json({ error: '无权操作' });
        return;
      }
      const config = sideStoryService.getConfig(novelId);
      res.json(config ?? { novelId, enabledCharacterIds: [], dailyLimitPerReader: 3, autoPublish: false });
    } catch (err) {
      console.error('[side-stories] get config error:', err);
      res.status(500).json({ error: '获取配置失败' });
    }
  });

  // ── 更新配置 ──
  router.put('/config/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel || (novel.ownerId !== userId && req.auth?.role !== 'admin')) {
        res.status(403).json({ error: '无权操作' });
        return;
      }
      const updates = req.body as Partial<{
        enabledCharacterIds: string[];
        dailyLimitPerReader: number;
        autoPublish: boolean;
      }>;
      const config = sideStoryService.updateConfig(novelId, updates);
      res.json(config);
    } catch (err) {
      console.error('[side-stories] update config error:', err);
      res.status(500).json({ error: '更新配置失败' });
    }
  });

  return router;
}
