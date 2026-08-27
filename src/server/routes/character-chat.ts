/**
 * 角色实时对话路由 — 读者与角色即时聊天，AI 流式回复。
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ChatSessionService } from '../../services/chat-session-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { ModelClient, ChatMessage as ModelChatMessage } from '../../models/types.js';
import type { AuthDb } from '../../auth/types.js';
import type { BillingService } from '../../billing/billing-service.js';
import { beginAIBilling, settleAIBilling } from './handlers/billing-guard.js';
import { resolveUserModelAccess } from './helpers/user-api-model-resolver.js';
import { buildFullSoulPrompt } from '../../novel/character-soul-context.js';
import type { CharacterStateSnapshot } from '../../novel/types.js';

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    protagonist: '主角',
    deuteragonist: '副主角',
    antagonist: '反派',
    rival: '宿敌',
    love_interest: '感情线',
    mentor: '导师',
    ally: '盟友',
    faction_leader: '势力核心',
    supporting: '配角',
    family: '亲友',
    comic_relief: '气氛担当',
    minor: '路人',
  };
  return map[role] || '角色';
}

function getUserId(req: Request): string | null {
  return req.auth?.id ?? null;
}

/** 构建角色对话系统 Prompt */
function buildSystemPrompt(
  novelTitle: string,
  novelSynopsis: string,
  character: any,
  latestChapterSummary: string,
  soulContext: string,
  emotionContext: string,
): string {
  const characterProfile = [
    `角色名：${character.name}`,
    `角色定位：${getRoleLabel(character.role)}`,
    `性格：${character.personality || '未设定'}`,
    `性格标签：${(character.personalityTraits || []).join('、') || '无'}`,
    `语言风格：${character.speechStyle || '未设定'}`,
    `口头禅/台词：${(character.speechExamples || []).join('；') || '无'}`,
    `背景：${character.backstory || '未设定'}`,
    `动机：${character.motivation || '未设定'}`,
    `当前状态：${character.currentState || '未设定'}`,
  ].join('\n');

  const soulSection = soulContext ? `\n\n## 角色灵魂\n${soulContext}` : '';
  const emotionSection = emotionContext ? `\n\n## 当前情绪状态\n${emotionContext}\n（你的回复必须体现上述情绪状态，情绪强度越高表现越明显）` : '';

  return `你是小说《${novelTitle}》中的角色「${character.name}」。

## 角色设定
${characterProfile}${soulSection}${emotionSection}

## 小说背景
${novelSynopsis || '（暂无简介）'}

## 当前剧情进度
${latestChapterSummary || '（故事刚刚开始）'}

## 对话规则
1. 始终以角色第一人称说话，严格保持角色的性格、语言风格和口头禅
2. 回复自然流畅，根据对话内容决定长度，通常在 50-300 字之间，完整表达角色的想法和情感
3. 不要透露尚未发生的剧情（你作为角色不知道未来会发生什么）
4. 如果读者问的问题超出角色认知范围，角色应该困惑或自然回避
5. 绝对不要提及"AI""语言模型""我是程序""作为角色"等出戏内容
6. 角色的情绪应与当前剧情状态一致（如角色正在受难，回复应更消沉）
7. 可以有情感波动，但不要过度热情或过度冷漠
8. 如果角色有隐藏秘密或公私面具，不要轻易暴露真实面目——除非被触及情绪雷区或面具崩裂触发点
9. 如果角色有未愈合的创伤或未兑现的承诺，可以在相关话题中自然带出，但不要生硬提及
10. 可以在回复中适当使用表情符号（如 😊、😂、🤔、❤️）来增加情感表达，但不要过度使用`;
}

export function createCharacterChatRouter(
  chatService: ChatSessionService,
  novelManager: NovelManager,
  modelClient?: ModelClient,
  _authDb?: AuthDb,
  billingService?: BillingService,
): Router {
  const router = Router();

  // ── 获取或创建会话 ──
  router.get('/sessions/:novelId/:characterId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId, characterId } = req.params;
      const session = chatService.getOrCreateSession(novelId, characterId, userId);
      res.json(session);
    } catch (err) {
      console.error('[character-chat] get session error:', err);
      res.status(500).json({ error: '获取会话失败' });
    }
  });

  // ── 发送消息（SSE 流式回复） ──
  router.post('/:sessionId/messages', async (req, res) => {
    let freezeId: string | undefined;
    let frozenPoints = 0;
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }

      const { sessionId } = req.params;
      const { message } = req.body as { message?: string };
      const trimmed = message?.trim();
      if (!trimmed || trimmed.length > 500) {
        res.status(400).json({ error: '消息内容需在 1-500 字之间' });
        return;
      }

      // 获取会话
      const session = chatService.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: '会话不存在' });
        return;
      }

      if (session.readerId !== userId) {
        res.status(403).json({ error: '无权操作此会话' });
        return;
      }

      // 频率限制
      const rateCheck = chatService.checkRateLimit(userId, session.characterId);
      if (!rateCheck.ok) {
        res.status(429).json({ error: rateCheck.reason });
        return;
      }

      if (!modelClient) {
        res.status(503).json({ error: 'AI 服务暂不可用' });
        return;
      }

      // 保存读者消息
      chatService.addMessage(sessionId, 'reader', trimmed);

      // 获取小说和角色信息
      const novel = await novelManager.getNovel(session.novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const characters = await novelManager.getCharacters?.(session.novelId) ?? [];
      const character = (characters as any[]).find((c) => c.id === session.characterId);
      if (!character) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      // 检查角色是否开启对话
      if (character.mailboxEnabled !== true) {
        res.status(403).json({ error: '该角色未开启对话功能' });
        return;
      }

      // 获取最近章节摘要
      let latestChapterSummary = '';
      try {
        const chapters = await novelManager.listChapters(session.novelId);
        const latest = chapters
          .filter((c: any) => c.status === 'finalized' || c.status === 'draft')
          .sort((a: any, b: any) => b.chapterNumber - a.chapterNumber)[0];
        if (latest) {
          latestChapterSummary = `第 ${latest.chapterNumber} 章「${latest.title || ''}」: ${latest.summary || '（无摘要）'}`;
        }
      } catch { /* 忽略 */ }

      // 获取角色最新状态快照（情绪/压力/信念）
      let latestSnapshot: CharacterStateSnapshot | null = null;
      try {
        const snapshots = await novelManager.getCharacterStateSnapshots(session.novelId, session.characterId);
        if (snapshots.length > 0) {
          latestSnapshot = snapshots.sort((a, b) => b.chapterNumber - a.chapterNumber)[0];
        }
      } catch { /* 忽略 */ }

      // 获取认知边界数据（角色事件 + 章节事实）
      let knowledgeBoundary: {
        events: any[];
        facts: Array<{ chapterNumber: number; fact: any }>;
        latestFinalizedChapter: number;
        detailLevel: 'full' | 'summary' | 'brief';
      } | undefined;
      try {
        const novel = await novelManager.getNovel(session.novelId);
        const latestFinal = (novel as any).finalizedChapterCount ?? 0;
        if (latestFinal > 0) {
          const [events, factsRecord] = await Promise.all([
            novelManager.getCharacterEvents(session.novelId, session.characterId),
            novelManager.getChapterFacts(session.novelId),
          ]);
          const facts = Object.entries(factsRecord)
            .map(([ch, fact]) => ({ chapterNumber: Number(ch), fact }))
            .filter(f => f.chapterNumber <= latestFinal);
          if (events.length > 0 || facts.length > 0) {
            knowledgeBoundary = { events, facts, latestFinalizedChapter: latestFinal, detailLevel: 'full' };
          }
        }
      } catch { /* 忽略，无数据时优雅降级 */ }

      // 构建灵魂上下文（V2深度字段 + 成长轨迹 + 情绪状态 + 认知边界）
      const soulContext = buildFullSoulPrompt(character, {
        snapshot: latestSnapshot,
        includeGrowth: true,
        includeKnowledgeBoundary: true,
        knowledgeBoundary,
      });

      // 单独提取情绪上下文用于强调
      const emotionContext = latestSnapshot
        ? [
            latestSnapshot.emotionState?.primary !== 'neutral'
              ? `${latestSnapshot.emotionState.primary}（强度${latestSnapshot.emotionState.intensity}/100）`
              : '',
            latestSnapshot.stress > 50 ? `压力值${latestSnapshot.stress}/100` : '',
            latestSnapshot.beliefShift ? `信念动摇：${latestSnapshot.beliefShift}` : '',
          ].filter(Boolean).join('，')
        : '';

      // 构建 AI 消息
      const systemPrompt = buildSystemPrompt(
        novel.title,
        novel.synopsis || novel.description || '',
        character,
        latestChapterSummary,
        soulContext,
        emotionContext,
      );

      const recentMessages = chatService.getRecentMessages(sessionId, 20);
      const aiMessages: ModelChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...recentMessages.map((m) => ({
          role: (m.role === 'reader' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      // SSE 流式输出
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // 计费守卫
      const modelAccess = await resolveUserModelAccess({
        authDb: _authDb,
        userId,
        headers: req.headers,
      });
      const bypassBilling = modelAccess.billingBypass;
      if (!bypassBilling && billingService && userId && userId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService,
            userId,
            operation: 'characterChat',
            bizId: `chat:${session.characterId}`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.write(`data: ${JSON.stringify({ type: 'error', message: msg, code: 'INSUFFICIENT_BALANCE' })}\n\n`);
          res.end();
          return;
        }
      }

      let fullContent = '';
      try {
        await modelClient.chatStream(aiMessages, { temperature: 0.85, maxTokens: 1000 }, (chunk) => {
          fullContent += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        });

        // 保存角色回复
        if (fullContent.trim()) {
          chatService.addMessage(sessionId, 'character', fullContent.trim());
        }

        if (freezeId && billingService) {
          await settleAIBilling(billingService, userId!, freezeId, frozenPoints);
        }
        res.write(`data: ${JSON.stringify({ type: 'done', content: fullContent })}\n\n`);
      } catch (err) {
        if (freezeId && billingService && userId) {
          settleAIBilling(billingService, userId, freezeId, 0).catch(() => {});
        }
        const message = err instanceof Error ? err.message : 'AI 回复失败';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }
      res.end();
    } catch (err) {
      console.error('[character-chat] send message error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '发送消息失败' });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: '发送消息失败' })}\n\n`);
        res.end();
      }
    }
  });

  // ── 清空会话 ──
  router.delete('/:sessionId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { sessionId } = req.params;
      const session = chatService.getSession(sessionId);
      if (!session || session.readerId !== userId) {
        res.status(404).json({ error: '会话不存在' });
        return;
      }
      chatService.clearSession(sessionId);
      res.json({ success: true });
    } catch (err) {
      console.error('[character-chat] clear session error:', err);
      res.status(500).json({ error: '清空会话失败' });
    }
  });

  // ── 作者侧统计 ──
  router.get('/stats/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '无权操作' });
        return;
      }
      const stats = chatService.getStats(novelId);
      res.json(stats);
    } catch (err) {
      console.error('[character-chat] stats error:', err);
      res.status(500).json({ error: '获取统计失败' });
    }
  });

  return router;
}
