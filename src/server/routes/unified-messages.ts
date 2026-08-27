/**
 * 统一消息路由
 * 职责：提供微信式消息列表（会话列表 + 会话内消息），标记已读
 */
import { Router, type Request, type Response } from 'express';
import type { UnifiedMessageService, UnifiedMessage } from '../../services/unified-message-service.js';
import type { CharacterOutreachService } from '../../services/character-outreach-service.js';
import type { NotificationService } from '../../services/notification-service.js';
import type { LetterService } from '../../services/letter-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';

export function createUnifiedMessageRouter(
  msgService: UnifiedMessageService,
  outreachService?: CharacterOutreachService,
  novelManager?: NovelManager,
  notificationService?: NotificationService,
  letterService?: LetterService,
) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    return ((req as any).auth as { id?: string } | undefined)?.id;
  }

  /** 将旧通知转为统一消息格式 */
  function legacyNotifToUnified(n: any): UnifiedMessage {
    return {
      id: `legacy-notif-${n.id}`,
      userId: n.userId,
      type: n.type === 'chapter_ready' ? 'update_reminder' as const
        : n.type === 'favorite_update' ? 'side_story_recommend' as const
        : 'system' as const,
      conversationId: 'legacy-system',
      conversationName: 'STAR 消息助手',
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
    };
  }

  /** 将旧信件转为统一消息格式 */
  function legacyLetterToUnified(l: any): UnifiedMessage {
    return {
      id: `legacy-letter-${l.id}`,
      userId: l.readerId,
      type: 'character_letter' as const,
      conversationId: `character_${l.characterId}`,
      conversationName: l.characterName,
      title: `${l.characterName}给你回信了`,
      body: l.replyContent || '',
      data: {
        novelId: l.novelId,
        characterId: l.characterId,
        letterId: l.id,
        route: `/m/novel/${l.novelId}?tab=mailbox&letter=${l.id}`,
        actionLabel: '查看回信',
      },
      read: false, // 旧信件默认未读（首次加载时）
      createdAt: typeof l.createdAt === 'number' ? new Date(l.createdAt).toISOString() : l.createdAt,
    };
  }

  /** GET /api/unified-messages/conversations — 获取会话列表（合并新旧系统） */
  router.get('/conversations', (_req: Request, res: Response) => {
    const userId = getUserId(_req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    // 新系统消息
    const conversations = msgService.getConversations(userId);

    // 合并旧通知（一个 system 会话）
    if (notificationService) {
      try {
        const legacyNotifs = notificationService.getInAppNotifications(userId, { limit: 100 });
        if (legacyNotifs.items.length > 0) {
          const legacyUnread = legacyNotifs.unreadCount;
          const lastNotif = legacyNotifs.items[0];
          const existingIdx = conversations.findIndex((c) => c.conversationId === 'legacy-system');
          if (existingIdx >= 0) {
            conversations[existingIdx].unreadCount += legacyUnread;
            if (new Date(lastNotif.createdAt) > new Date(conversations[existingIdx].lastTime)) {
              conversations[existingIdx].lastMessage = {
                id: `legacy-notif-${lastNotif.id}`,
                type: 'system',
                title: lastNotif.title,
                createdAt: lastNotif.createdAt,
              };
              conversations[existingIdx].lastTime = lastNotif.createdAt;
            }
          } else {
            conversations.push({
              conversationId: 'legacy-system',
              conversationName: 'STAR 消息助手',
              lastMessage: {
                id: `legacy-notif-${lastNotif.id}`,
                type: 'system',
                title: lastNotif.title,
                createdAt: lastNotif.createdAt,
              },
              unreadCount: legacyUnread,
              lastTime: lastNotif.createdAt,
            });
          }
        }
      } catch { /* 忽略旧数据读取失败 */ }
    }

    // 合并旧信件（角色会话）
    if (letterService) {
      try {
        const legacyLetters = letterService.listByReader(userId);
        // 按角色聚合
        const charGroups = new Map<string, { name: string; letters: any[] }>();
        for (const l of legacyLetters) {
          const cid = `character_${l.characterId}`;
          if (!charGroups.has(cid)) {
            charGroups.set(cid, { name: l.characterName, letters: [] });
          }
          charGroups.get(cid)!.letters.push(l);
        }
        for (const [cid, group] of charGroups) {
          const existing = conversations.find((c) => c.conversationId === cid);
          if (!existing) {
            // 旧会话没有统一消息，但仍要展示
            const lastLetter = group.letters.sort((a, b) => b.createdAt - a.createdAt)[0];
            conversations.push({
              conversationId: cid,
              conversationName: group.name,
              lastMessage: {
                id: `legacy-letter-${lastLetter.id}`,
                type: 'character_letter',
                title: `${group.name}给你回信了`,
                createdAt: typeof lastLetter.createdAt === 'number'
                  ? new Date(lastLetter.createdAt).toISOString()
                  : lastLetter.createdAt,
              },
              unreadCount: 0, // 旧消息默认已读
              lastTime: typeof lastLetter.createdAt === 'number'
                ? new Date(lastLetter.createdAt).toISOString()
                : String(lastLetter.createdAt),
            });
          }
        }
      } catch { /* 忽略 */ }
    }

    // 按时间排序
    conversations.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
    const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
    res.json({ conversations, totalUnread });
  });

  /** GET /api/unified-messages/conversation/:conversationId — 获取某会话全部消息（含旧数据） */
  router.get('/conversation/:conversationId', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    const cid = String(req.params.conversationId);

    let msgs: UnifiedMessage[] = [];

    // 旧通知会话
    if (cid === 'legacy-system' && notificationService) {
      try {
        const legacy = notificationService.getInAppNotifications(userId, { limit: 200 });
        msgs = legacy.items.map(legacyNotifToUnified);
      } catch { /* 忽略 */ }
    } else if (cid.startsWith('character_') && letterService) {
      // 角色会话：合并新旧
      const newMsgs = msgService.getConversationMessages(userId, cid);
      msgs = [...newMsgs];
      try {
        const charId = cid.replace('character_', '');
        const allLetters = letterService.listByReader(userId);
        const charLetters = allLetters.filter((l: any) => l.characterId === charId);
        const legacyIds = new Set(msgs.map((m) => m.data?.letterId));
        for (const l of charLetters) {
          if (!legacyIds.has(l.id)) {
            msgs.push(legacyLetterToUnified(l));
          }
        }
        // 已有统一消息但 body 可能被截断，从原始信件补全
        const letterMap = new Map(allLetters.map((l: any) => [l.id, l]));
        for (const m of msgs) {
          const letterId = m.data?.letterId;
          if (letterId && letterMap.has(letterId)) {
            const fullLetter = letterMap.get(letterId);
            m.body = fullLetter.replyContent || m.body;
          }
        }
      } catch { /* 忽略 */ }
    } else {
      // 普通会话（新系统）
      msgs = msgService.getConversationMessages(userId, cid);
    }

    // 按时间倒序
    msgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ messages: msgs });
  });

  /** GET /api/unified-messages/unread-count — 获取未读数（合并新旧） */
  router.get('/unread-count', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    let count = msgService.getUnreadCount(userId);
    if (notificationService) {
      try {
        count += notificationService.getUnreadCount(userId);
      } catch { /* 忽略 */ }
    }
    res.json({ count });
  });

  /** POST /api/unified-messages/read/:id — 标记单条已读（含旧系统） */
  router.post('/read/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    const id = String(req.params.id);
    if (id.startsWith('legacy-notif-') && notificationService) {
      try {
        notificationService.markRead(userId, id.replace('legacy-notif-', ''));
      } catch { /* 忽略 */ }
    } else {
      msgService.markRead(userId, id);
    }
    res.json({ ok: true });
  });

  /** POST /api/unified-messages/read-conversation/:conversationId — 标记会话已读（含旧系统） */
  router.post('/read-conversation/:conversationId', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    const cid = String(req.params.conversationId);
    if (cid === 'legacy-system' && notificationService) {
      try { notificationService.markAllRead(userId); } catch { /* 忽略 */ }
    } else {
      msgService.markConversationRead(userId, cid);
    }
    res.json({ ok: true });
  });

  /** POST /api/unified-messages/read-all — 全部已读（含旧系统） */
  router.post('/read-all', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    msgService.markAllRead(userId);
    if (notificationService) {
      try { notificationService.markAllRead(userId); } catch { /* 忽略 */ }
    }
    res.json({ ok: true });
  });

  /** DELETE /api/unified-messages/:id — 删除单条消息 */
  router.delete('/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    const id = String(req.params.id);
    msgService.deleteMessage(userId, id);
    res.json({ ok: true });
  });

  /** POST /api/unified-messages/outreach/check — 触发角色搭话检查 */
  router.post('/outreach/check', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId || !outreachService || !novelManager) {
      res.status(400).json({ error: '服务未就绪' });
      return;
    }

    const { novelId, currentChapterNumber, currentChapterTitle, scenario } = req.body ?? {};
    if (!novelId || !scenario) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    try {
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '作品未找到' });
        return;
      }

      const characters = await (novelManager as any).getCharacters?.(novelId) ?? [];
      // 获取所有角色的最新状态快照
      let allSnapshots: Map<string, any> = new Map();
      try {
        for (const c of characters as any[]) {
          const snaps = await novelManager.getCharacterStateSnapshots(novelId, c.id);
          if (snaps.length > 0) {
            const latest = snaps.sort((a: any, b: any) => b.chapterNumber - a.chapterNumber)[0];
            allSnapshots.set(c.id, latest);
          }
        }
      } catch { /* 忽略 */ }

      const enabled = (characters as any[]).map((c: any) => ({
        id: c.id,
        name: c.name,
        role: c.role || '',
        roleLabel: c.role || '角色',
        personality: c.personality || '',
        personalityTraits: c.personalityTraits || [],
        backstory: c.backstory || '',
        speechStyle: c.speechStyle || '',
        speechExamples: c.speechExamples || [],
        portraitImagePath: c.portraitImagePath || '',
        mailboxEnabled: c.mailboxEnabled,
        drives: c.drives,
        persona: c.persona,
        psychology: c.psychology,
        symbolism: c.symbolism,
        growthTrack: c.growthTrack,
        latestSnapshot: allSnapshots.get(c.id) ?? null,
      }));

      const triggered = await outreachService.tryOutreach(userId, enabled, {
        novelId,
        novelTitle: novel.title,
        currentChapterNumber,
        currentChapterTitle,
        scenario: scenario as any,
      });

      res.json({ triggered });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '搭话检查失败' });
    }
  });

  /** POST /api/unified-messages/delete-batch — 批量删除消息 */
  router.post('/delete-batch', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return;
    }
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '请提供要删除的消息 ID 列表' });
      return;
    }
    const deleted = msgService.deleteMessages(userId, ids);
    res.json({ ok: true, deleted });
  });

  return router;
}
