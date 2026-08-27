/**
 * 统一消息服务
 * 
 * 职责：聚合角色来信、番外推荐、追更提醒、系统通知为统一消息流，
 * 按"会话"（角色/小说/系统）分组，支持微信式消息列表查询。
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { resolvePathWithin } from '../utils/path-safety.js';

const log = createLogger('UnifiedMessageService');

// ===== 类型 =====

export type UnifiedMessageType = 'character_letter' | 'side_story_recommend' | 'update_reminder' | 'character_outreach' | 'comic_published' | 'system';

export interface UnifiedMessage {
  id: string;
  userId: string;
  type: UnifiedMessageType;
  /** 会话分组 key：character_{characterId} / novel_{novelId} / system */
  conversationId: string;
  /** 会话展示名：角色名/书名/"系统消息" */
  conversationName: string;
  /** 会话头像来源：角色画像路径 */
  conversationAvatar?: string;
  /** 消息标题（预览用，如角色发来的第一句话） */
  title: string;
  /** 消息正文 */
  body: string;
  /** 跳转/操作载荷 */
  data?: {
    novelId?: string;
    characterId?: string;
    chapterNumber?: number;
    sideStoryId?: string;
    letterId?: string;
    route?: string;
    broadcastId?: string;
    /** 快捷操作文案 */
    actionLabel?: string;
  };
  read: boolean;
  createdAt: string;
}

interface MessagesStore {
  messages: UnifiedMessage[];
}

const MAX_MESSAGES = 500;

// ===== 服务 =====

export class UnifiedMessageService {
  private storeDir: string;

  constructor(dataDir: string) {
    this.storeDir = path.join(dataDir, 'unified-messages');
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
  }

  private filePath(userId: string): string {
    return resolvePathWithin(this.storeDir, `${userId}.json`);
  }

  private load(userId: string): MessagesStore {
    try {
      const fp = this.filePath(userId);
      if (!fs.existsSync(fp)) return { messages: [] };
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      return { messages: [] };
    }
  }

  private save(userId: string, store: MessagesStore) {
    if (store.messages.length > MAX_MESSAGES) {
      store.messages = store.messages.slice(0, MAX_MESSAGES);
    }
    fs.writeFileSync(this.filePath(userId), JSON.stringify(store, null, 2), 'utf-8');
  }

  /** 添加消息 */
  addMessage(userId: string, msg: Omit<UnifiedMessage, 'id' | 'read' | 'createdAt'>): UnifiedMessage {
    const store = this.load(userId);
    const newMsg: UnifiedMessage = {
      ...msg,
      id: randomUUID(),
      read: false,
      createdAt: new Date().toISOString(),
    };
    store.messages.unshift(newMsg);
    this.save(userId, store);
    return newMsg;
  }

  /** 按 broadcastId 删除所有用户的消息（管理员撤销广播时调用） */
  deleteMessagesByBroadcastId(broadcastId: string): number {
    let deleted = 0;
    try {
      const files = fs.readdirSync(this.storeDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const userId = file.replace('.json', '');
        const store = this.load(userId);
        const before = store.messages.length;
        store.messages = store.messages.filter(m => m.data?.broadcastId !== broadcastId);
        if (store.messages.length < before) {
          this.save(userId, store);
          deleted += before - store.messages.length;
        }
      }
    } catch { /* ignore */ }
    return deleted;
  }

  /** 删除单条消息（仅限该用户自己的消息） */
  deleteMessage(userId: string, messageId: string): boolean {
    const store = this.load(userId);
    const idx = store.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return false;
    store.messages.splice(idx, 1);
    this.save(userId, store);
    return true;
  }

  /** 批量删除消息 */
  deleteMessages(userId: string, messageIds: string[]): number {
    const store = this.load(userId);
    const idSet = new Set(messageIds);
    const before = store.messages.length;
    store.messages = store.messages.filter((m) => !idSet.has(m.id));
    const deleted = before - store.messages.length;
    if (deleted > 0) this.save(userId, store);
    return deleted;
  }

  /**
   * 获取会话列表（微信式：按 conversationId 聚合，每组取最新一条）
   */
  getConversations(userId: string): {
    conversationId: string;
    conversationName: string;
    conversationAvatar?: string;
    lastMessage: Pick<UnifiedMessage, 'id' | 'type' | 'title' | 'createdAt' | 'data'>;
    unreadCount: number;
    /** 最新消息时间（排序用） */
    lastTime: string;
  }[] {
    const store = this.load(userId);
    const groups = new Map<string, UnifiedMessage[]>();

    for (const m of store.messages) {
      const list = groups.get(m.conversationId) || [];
      list.push(m);
      groups.set(m.conversationId, list);
    }

    const conversations = [...groups.entries()].map(([cid, msgs]) => {
      const sorted = msgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const last = sorted[0];
      const unread = sorted.filter((m) => !m.read).length;
      return {
        conversationId: cid,
        conversationName: last.conversationName,
        conversationAvatar: last.conversationAvatar,
        lastMessage: {
          id: last.id,
          type: last.type,
          title: last.title,
          createdAt: last.createdAt,
          data: last.data,
        },
        unreadCount: unread,
        lastTime: last.createdAt,
      };
    });

    return conversations.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
  }

  /** 获取某个会话的所有消息 */
  getConversationMessages(userId: string, conversationId: string): UnifiedMessage[] {
    const store = this.load(userId);
    return store.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** 获取总未读数 */
  getUnreadCount(userId: string): number {
    const store = this.load(userId);
    return store.messages.filter((m) => !m.read).length;
  }

  /** 标记单条已读 */
  markRead(userId: string, messageId: string) {
    const store = this.load(userId);
    const target = store.messages.find((m) => m.id === messageId);
    if (target) {
      target.read = true;
      this.save(userId, store);
    }
  }

  /** 标记某会话全部已读 */
  markConversationRead(userId: string, conversationId: string) {
    const store = this.load(userId);
    let changed = false;
    for (const m of store.messages) {
      if (m.conversationId === conversationId && !m.read) {
        m.read = true;
        changed = true;
      }
    }
    if (changed) this.save(userId, store);
  }

  /** 标记全部已读 */
  markAllRead(userId: string) {
    const store = this.load(userId);
    for (const m of store.messages) {
      m.read = true;
    }
    this.save(userId, store);
  }

  /**
   * 便捷：角色来信消息
   */
  notifyCharacterLetter(params: {
    userId: string;
    characterId: string;
    characterName: string;
    novelId: string;
    replyPreview: string;
    letterId: string;
    portraitImagePath?: string;
  }): UnifiedMessage {
    return this.addMessage(params.userId, {
      userId: params.userId,
      type: 'character_letter',
      conversationId: `character_${params.characterId}`,
      conversationName: params.characterName,
      conversationAvatar: params.portraitImagePath,
      title: `${params.characterName}给你回信了`,
      body: params.replyPreview,
      data: {
        novelId: params.novelId,
        characterId: params.characterId,
        letterId: params.letterId,
        route: `/m/novel/${params.novelId}?tab=mailbox&letter=${params.letterId}`,
        actionLabel: '查看回信',
      },
    });
  }

  /**
   * 便捷：番外推荐消息（角色安利语气）
   */
  notifySideStory(params: {
    userId: string;
    novelId: string;
    storyTitle: string;
    storyId: string;
    characterName?: string;
    characterId?: string;
  }): UnifiedMessage {
    const charName = params.characterName || '角色';
    return this.addMessage(params.userId, {
      userId: params.userId,
      type: 'side_story_recommend',
      conversationId: params.characterId ? `character_${params.characterId}` : `novel_${params.novelId}`,
      conversationName: params.characterId ? charName : '番外广场',
      title: `${charName}推荐了一篇番外`,
      body: `"${params.storyTitle}" – 点击查看`,
      data: {
        novelId: params.novelId,
        sideStoryId: params.storyId,
        characterId: params.characterId,
        route: `/m/novel/${params.novelId}?tab=stories&story=${params.storyId}`,
        actionLabel: '阅读番外',
      },
    });
  }

  /**
   * 便捷：追更提醒
   */
  notifyChapterUpdate(params: {
    userId: string;
    novelId: string;
    novelTitle: string;
    chapterNumber: number;
    chapterTitle?: string;
  }): UnifiedMessage {
    return this.addMessage(params.userId, {
      userId: params.userId,
      type: 'update_reminder',
      conversationId: `novel_${params.novelId}`,
      conversationName: params.novelTitle,
      title: `《${params.novelTitle}》更新了`,
      body: params.chapterTitle
        ? `第 ${params.chapterNumber} 章 · ${params.chapterTitle}`
        : `第 ${params.chapterNumber} 章已发布`,
      data: {
        novelId: params.novelId,
        chapterNumber: params.chapterNumber,
        route: `/m/novel/${params.novelId}`,
        actionLabel: '立即阅读',
      },
    });
  }

  /**
   * 便捷：角色主动搭话
   */
  notifyCharacterOutreach(params: {
    userId: string;
    characterId: string;
    characterName: string;
    novelId: string;
    message: string;
    portraitImagePath?: string;
  }): UnifiedMessage {
    return this.addMessage(params.userId, {
      userId: params.userId,
      type: 'character_outreach',
      conversationId: `character_${params.characterId}`,
      conversationName: params.characterName,
      conversationAvatar: params.portraitImagePath,
      title: params.characterName,
      body: params.message.slice(0, 300),
      data: {
        novelId: params.novelId,
        characterId: params.characterId,
        route: `/m/novel/${params.novelId}?tab=mailbox`,
        actionLabel: '回信',
      },
    });
  }

  /**
   * 便捷：角色进化通知（关键事件：突破、觉醒、背叛、死亡等）
   */
  notifyCharacterEvolution(params: {
    userId: string;
    characterId: string;
    characterName: string;
    novelId: string;
    novelTitle: string;
    chapterNumber: number;
    evolutionType: string;
    portraitImagePath?: string;
  }): UnifiedMessage {
    return this.addMessage(params.userId, {
      userId: params.userId,
      type: 'character_outreach',
      conversationId: `character_${params.characterId}`,
      conversationName: params.characterName,
      conversationAvatar: params.portraitImagePath,
      title: `${params.characterName}发生了关键变化`,
      body: `第 ${params.chapterNumber} 章：${params.evolutionType}`,
      data: {
        novelId: params.novelId,
        characterId: params.characterId,
        chapterNumber: params.chapterNumber,
        route: `/m/novel/${params.novelId}?tab=characters&char=${params.characterId}`,
        actionLabel: '查看详情',
      },
    });
  }

  /**
   * 便捷：漫画发布通知（通知收藏该小说的读者）
   */
  notifyComicPublished(params: {
    userId: string;
    novelId: string;
    novelTitle: string;
    chapterNumber: number;
  }): UnifiedMessage {
    return this.addMessage(params.userId, {
      userId: params.userId,
      type: 'comic_published',
      conversationId: `novel_${params.novelId}`,
      conversationName: params.novelTitle,
      title: `《${params.novelTitle}》第 ${params.chapterNumber} 章漫画已发布`,
      body: '点击查看本章漫画',
      data: {
        novelId: params.novelId,
        chapterNumber: params.chapterNumber,
        route: `/m/novel/${params.novelId}/read?comicPanel=1`,
        actionLabel: '看漫画',
      },
    });
  }
}
