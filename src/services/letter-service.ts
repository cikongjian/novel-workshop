/**
 * 角色信箱服务 — 读者给小说角色写信，AI 以角色身份回信。
 * 纯数据存储层，不直接调用 AI agent（AI 调用在路由层完成）。
 */
import fs from 'fs';
import path from 'path';

/** 单封信件记录 */
export interface LetterRecord {
  id: string;
  novelId: string;
  novelTitle: string;
  characterId: string;
  characterName: string;
  characterRole: string;
  readerId: string;
  readerName: string;
  readerMessage: string;
  replyContent: string;
  createdAt: number;
}

/** 存储结构 */
interface LetterStore {
  letters: LetterRecord[];
}

/** 每日频率限制 */
const MAX_PER_CHARACTER_DAILY = 3;
const MAX_TOTAL_DAILY = 10;

export class LetterService {
  private readonly storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'letters.json');
  }

  /** 读取存储 */
  private loadStore(): LetterStore {
    if (!fs.existsSync(this.storePath)) return { letters: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<LetterStore>;
      return { letters: raw.letters ?? [] };
    } catch {
      return { letters: [] };
    }
  }

  /** 保存存储 */
  private saveStore(store: LetterStore): void {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  /** 生成 UUID */
  private uuid(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /** 检查频率限制 */
  checkRateLimit(readerId: string, characterId: string): { ok: boolean; reason?: string } {
    const store = this.loadStore();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recent = store.letters.filter((l) => l.readerId === readerId && l.createdAt > oneDayAgo);
    const perChar = recent.filter((l) => l.characterId === characterId).length;
    if (perChar >= MAX_PER_CHARACTER_DAILY) {
      return { ok: false, reason: `每天最多给同一角色写 ${MAX_PER_CHARACTER_DAILY} 封信` };
    }
    if (recent.length >= MAX_TOTAL_DAILY) {
      return { ok: false, reason: `每天最多写 ${MAX_TOTAL_DAILY} 封信` };
    }
    return { ok: true };
  }

  /** 保存信件（含 AI 回信） */
  saveLetter(params: {
    novelId: string;
    novelTitle: string;
    characterId: string;
    characterName: string;
    characterRole: string;
    readerId: string;
    readerName: string;
    readerMessage: string;
    replyContent: string;
  }): LetterRecord {
    const store = this.loadStore();
    const record: LetterRecord = {
      id: this.uuid(),
      ...params,
      createdAt: Date.now(),
    };
    store.letters.unshift(record);
    // 保留最近 500 封，避免无限增长
    if (store.letters.length > 500) {
      store.letters = store.letters.slice(0, 500);
    }
    this.saveStore(store);
    return record;
  }

  /** 读者查看自己的信箱 */
  listByReader(readerId: string, novelId?: string): LetterRecord[] {
    const store = this.loadStore();
    return store.letters.filter(
      (l) => l.readerId === readerId && (!novelId || l.novelId === novelId),
    );
  }

  /** 作者查看某小说的所有信件 */
  listByNovel(novelId: string): LetterRecord[] {
    const store = this.loadStore();
    return store.letters.filter((l) => l.novelId === novelId);
  }

  /** 按角色统计信件数 */
  getCharacterStats(novelId: string): Array<{ characterId: string; characterName: string; characterRole: string; count: number }> {
    const store = this.loadStore();
    const novelLetters = store.letters.filter((l) => l.novelId === novelId);
    const map = new Map<string, { characterId: string; characterName: string; characterRole: string; count: number }>();
    for (const letter of novelLetters) {
      const existing = map.get(letter.characterId);
      if (existing) {
        existing.count++;
      } else {
        map.set(letter.characterId, {
          characterId: letter.characterId,
          characterName: letter.characterName,
          characterRole: letter.characterRole,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  /** 删除单封信件（仅信件主人可删） */
  deleteLetter(id: string, readerId?: string): boolean {
    const store = this.loadStore();
    const idx = store.letters.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    // 权限校验：只有信件的读者（发信人）可以删除，不传 readerId 则不做权限校验
    if (readerId && store.letters[idx].readerId !== readerId) return false;
    store.letters.splice(idx, 1);
    this.saveStore(store);
    return true;
  }
}
