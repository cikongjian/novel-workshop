/**
 * 角色实时对话会话服务 — 存储读者与角色的聊天记录。
 * 纯数据存储层，AI 调用在路由层完成。
 */
import fs from 'fs';
import path from 'path';

/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'reader' | 'character';
  content: string;
  createdAt: number;
}

/** 聊天会话 */
export interface ChatSession {
  id: string;
  novelId: string;
  characterId: string;
  readerId: string;
  messages: ChatMessage[];
  createdAt: number;
  lastActiveAt: number;
}

/** 存储结构 */
interface ChatStore {
  sessions: ChatSession[];
}

/** 每角色每日消息上限（免费读者） */
const MAX_MESSAGES_PER_CHARACTER_DAILY = 20;
/** 保留最近消息条数（用于 AI 上下文） */
const MAX_CONTEXT_MESSAGES = 20;

export class ChatSessionService {
  private readonly storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'character-chats.json');
  }

  private loadStore(): ChatStore {
    if (!fs.existsSync(this.storePath)) return { sessions: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<ChatStore>;
      return { sessions: raw.sessions ?? [] };
    } catch {
      return { sessions: [] };
    }
  }

  private saveStore(store: ChatStore): void {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private uuid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 获取或创建会话 */
  getOrCreateSession(novelId: string, characterId: string, readerId: string): ChatSession {
    const store = this.loadStore();
    let session = store.sessions.find(
      (s) => s.novelId === novelId && s.characterId === characterId && s.readerId === readerId,
    );
    if (!session) {
      const now = Date.now();
      session = {
        id: this.uuid(),
        novelId,
        characterId,
        readerId,
        messages: [],
        createdAt: now,
        lastActiveAt: now,
      };
      store.sessions.push(session);
      this.saveStore(store);
    }
    return session;
  }

  /** 按 ID 获取会话 */
  getSession(sessionId: string): ChatSession | null {
    const store = this.loadStore();
    return store.sessions.find((s) => s.id === sessionId) ?? null;
  }

  /** 添加消息 */
  addMessage(sessionId: string, role: 'reader' | 'character', content: string): ChatMessage | null {
    const store = this.loadStore();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const msg: ChatMessage = {
      id: this.uuid(),
      role,
      content,
      createdAt: Date.now(),
    };
    session.messages.push(msg);
    session.lastActiveAt = Date.now();
    this.saveStore(store);
    return msg;
  }

  /** 获取会话最近消息（用于 AI 上下文） */
  getRecentMessages(sessionId: string, limit = MAX_CONTEXT_MESSAGES): ChatMessage[] {
    const store = this.loadStore();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  /** 清空会话 */
  clearSession(sessionId: string): boolean {
    const store = this.loadStore();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    session.messages = [];
    session.lastActiveAt = Date.now();
    this.saveStore(store);
    return true;
  }

  /** 检查频率限制 */
  checkRateLimit(readerId: string, characterId: string): { ok: boolean; reason?: string } {
    const store = this.loadStore();
    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const todayMessages = store.sessions
      .filter((s) => s.readerId === readerId && s.characterId === characterId)
      .flatMap((s) => s.messages)
      .filter((m) => m.role === 'reader' && m.createdAt >= todayStart);
    if (todayMessages.length >= MAX_MESSAGES_PER_CHARACTER_DAILY) {
      return {
        ok: false,
        reason: `今日已发送 ${MAX_MESSAGES_PER_CHARACTER_DAILY} 条消息，明日再来吧`,
      };
    }
    return { ok: true };
  }

  /** 获取作者侧统计 */
  getStats(novelId: string): {
    totalSessions: number;
    totalMessages: number;
    characterStats: { characterId: string; sessionCount: number; messageCount: number }[];
  } {
    const store = this.loadStore();
    const novelSessions = store.sessions.filter((s) => s.novelId === novelId);
    const characterMap = new Map<string, { sessionCount: number; messageCount: number }>();
    for (const s of novelSessions) {
      const entry = characterMap.get(s.characterId) ?? { sessionCount: 0, messageCount: 0 };
      entry.sessionCount += 1;
      entry.messageCount += s.messages.length;
      characterMap.set(s.characterId, entry);
    }
    return {
      totalSessions: novelSessions.length,
      totalMessages: novelSessions.reduce((sum, s) => sum + s.messages.length, 0),
      characterStats: Array.from(characterMap.entries()).map(([characterId, v]) => ({
        characterId,
        ...v,
      })),
    };
  }
}
