/**
 * 角色信箱路由 — 读者给角色写信，AI 以角色身份回信。
 * AI 调用层：复用 writer agent，传入角色档案 + 读者信件。
 */
import { Router, Request, Response } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { NovelAgent, AgentContext } from '../../agents/types.js';
import type { ModelClient } from '../../models/types.js';
import type { LetterService } from '../../services/letter-service.js';
import type { AuthDb } from '../../auth/types.js';
import type { UnifiedMessageService } from '../../services/unified-message-service.js';
import { getProfile } from '../../auth/user-service.js';
import { buildFullSoulPrompt } from '../../novel/character-soul-context.js';

/** 获取角色定位中文标签 */
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

/** 从请求获取 userId */
function getUserId(req: Request): string | undefined {
  return ((req as any).auth as { id?: string } | undefined)?.id;
}

export function createLetterRouter(
  letterService: LetterService,
  novelManager: NovelManager,
  agents?: Map<string, NovelAgent>,
  modelClient?: ModelClient,
  authDb?: AuthDb,
  msgService?: UnifiedMessageService,
): Router {
  const router = Router();

  /** GET /api/letters/characters?novelId=xxx — 获取可写信的角色列表 */
  router.get('/characters', async (req: Request, res: Response) => {
    try {
      const { novelId } = req.query;
      if (!novelId || typeof novelId !== 'string') {
        res.status(400).json({ error: '缺少 novelId' });
        return;
      }
      const characters = await novelManager.getCharacters?.(novelId) ?? [];
      // 仅返回作者开启信箱的角色
      const writable = (characters as any[])
        .filter((c) => c.mailboxEnabled === true && c.name && c.name.length >= 2 && c.status !== 'exited')
        .map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          roleLabel: getRoleLabel(c.role),
          personality: c.personality || '',
          personalityTraits: c.personalityTraits || [],
          portraitImagePath: c.portraitImagePath || '',
        }));
      res.json({ characters: writable });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '获取角色失败' });
    }
  });

  /** POST /api/letters/send — 写信 + AI 回信 */
  router.post('/send', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId, characterId, message } = req.body ?? {};
      if (!novelId || !characterId || !message) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
      }
      const trimmed = String(message).trim();
      if (trimmed.length === 0 || trimmed.length > 500) {
        res.status(400).json({ error: '信件内容需在 1-500 字之间' });
        return;
      }

      // 频率限制
      const rateCheck = letterService.checkRateLimit(userId, characterId);
      if (!rateCheck.ok) {
        res.status(429).json({ error: rateCheck.reason });
        return;
      }

      // 获取小说信息
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '作品未找到' });
        return;
      }

      // 获取角色完整档案
      const characters = await novelManager.getCharacters?.(novelId) ?? [];
      const character = (characters as any[]).find((c) => c.id === characterId);
      if (!character) {
        res.status(404).json({ error: '角色未找到' });
        return;
      }

      // 获取读者笔名/用户名
      let readerName = '匿名读者';
      try {
        if (authDb) {
          const profile = await getProfile(authDb, userId);
          readerName = profile?.penName || profile?.username || '匿名读者';
        }
      } catch { /* 忽略 */ }

      // 获取世界观上下文
      let worldContext = '';
      try {
        const worldEntries = await (novelManager as any).getWorldEntries?.(novelId) ?? [];
        worldContext = (worldEntries as any[]).map((e: any) =>
          `[${e.category || '设定'}] ${e.name}: ${e.description || ''}`
        ).join('\n');
      } catch { /* 忽略 */ }

      // 获取角色最新状态快照（情绪/压力/信念）
      let latestSnapshot: any = null;
      try {
        const snapshots = await novelManager.getCharacterStateSnapshots(novelId, characterId);
        if (snapshots.length > 0) {
          latestSnapshot = snapshots.sort((a: any, b: any) => b.chapterNumber - a.chapterNumber)[0];
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
        const novelMeta = await novelManager.getNovel(novelId);
        const latestFinal = (novelMeta as any).finalizedChapterCount ?? 0;
        if (latestFinal > 0) {
          const [events, factsRecord] = await Promise.all([
            novelManager.getCharacterEvents(novelId, characterId),
            novelManager.getChapterFacts(novelId),
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

      // 构建 AI 回信指令
      const characterContext = [
        `角色名: ${character.name}`,
        `角色定位: ${getRoleLabel(character.role)}`,
        `性格: ${character.personality || '未设定'}`,
        `性格标签: ${(character.personalityTraits || []).join('、') || '无'}`,
        `语言风格: ${character.speechStyle || '未设定'}`,
        `口头禅/台词: ${(character.speechExamples || []).join('；') || '无'}`,
        `背景: ${character.backstory || '未设定'}`,
        `动机: ${character.motivation || '未设定'}`,
        `当前状态: ${character.currentState || '未设定'}`,
        soulContext ? `\n${soulContext}` : '',
      ].filter(Boolean).join('\n');

      // 调用 writer agent 生成角色回信
      let replyContent = '';
      const agent = agents?.get('writer');
      if (agent && modelClient) {
        const context: AgentContext = {
          novelId,
          genre: (novel as any).genre || '奇幻',
          novelTitle: novel.title,
          novelSynopsis: novel.synopsis || novel.description || '',
          characterContext,
          worldContext,
          userDirection: `你是《${novel.title}》中的角色「${character.name}」。

读者给你写了一封信：
"""
${trimmed}
"""

请以角色的身份回信。要求：
1. 严格保持角色的性格、语言风格和口头禅
2. 回信 200-400 字
3. 不要出戏，绝对不要提及"AI""语言模型""我是程序"等
4. 可以透露一些角色的内心想法和情感——但如果你有隐藏秘密或公私面具，不要轻易暴露真实面目
5. 如果读者问的问题超出角色认知范围，以角色的方式自然回避
6. 如果你有未愈合的创伤或未兑现的承诺，可以在相关话题中自然带出
7. 如果当前情绪状态显示你压力很大或情绪低落，回信的语气要体现这一点
8. 直接输出回信内容，不要加引号、标题或解释`,
        };
        const output = await agent.execute(context, modelClient);
        replyContent = (output.content || '').trim();
        // 清理可能的 markdown 包裹
        replyContent = replyContent.replace(/^```[\w]*\n?/g, '').replace(/```$/g, '').trim();
      }

      if (!replyContent) {
        res.status(500).json({ error: '角色暂时无法回信，请稍后再试' });
        return;
      }

      // 保存信件
      const record = letterService.saveLetter({
        novelId,
        novelTitle: novel.title,
        characterId,
        characterName: character.name,
        characterRole: getRoleLabel(character.role),
        readerId: userId,
        readerName,
        readerMessage: trimmed,
        replyContent,
      });

      // 写入统一消息中心：角色来信
      if (msgService) {
        try {
          msgService.notifyCharacterLetter({
            userId,
            characterId,
            characterName: character.name,
            novelId,
            replyPreview: replyContent,
            letterId: record.id,
            portraitImagePath: character.portraitImagePath,
          });
        } catch { /* 消息写入不阻塞主流程 */ }
      }

      res.json({ letter: record });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '寄信失败' });
    }
  });

  /** GET /api/letters/history — 我的信箱（可选 novelId 过滤） */
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.query;
      const letters = letterService.listByReader(
        userId,
        typeof novelId === 'string' ? novelId : undefined,
      );
      res.json({ letters });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '查询失败' });
    }
  });

  /** GET /api/letters/by-novel?novelId=xxx — 作者查看某小说的信件 */
  router.get('/by-novel', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.query;
      if (!novelId || typeof novelId !== 'string') {
        res.status(400).json({ error: '缺少 novelId' });
        return;
      }
      // 权限检查：只有小说作者可以查看
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '作品未找到' });
        return;
      }
      if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '无权查看' });
        return;
      }
      const letters = letterService.listByNovel(novelId);
      const stats = letterService.getCharacterStats(novelId);
      res.json({ letters, stats, total: letters.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '查询失败' });
    }
  });

  /** DELETE /api/letters/:id — 删除历史信件 */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const id = String(req.params.id ?? '');
      if (!id) {
        res.status(400).json({ error: '缺少信件 ID' });
        return;
      }
      const deleted = letterService.deleteLetter(id, userId);
      if (!deleted) {
        res.status(404).json({ error: '信件不存在或无权删除' });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '删除失败' });
    }
  });

  return router;
}
