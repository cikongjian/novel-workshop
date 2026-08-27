/**
 * 角色卡牌服务
 * 管理角色卡牌收藏、热度排行
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface CharacterCardCollection {
  userId: string;
  characterId: string;
  novelId: string;
  characterName: string;
  collectedAt: string;
}

interface CharacterCardStore {
  collections: CharacterCardCollection[];
}

export interface CharacterCardInfo {
  characterId: string;
  novelId: string;
  name: string;
  role: string;
  tags: string[];
  personality: string;
  appearance: string;
  collectCount: number;
  novelTitle: string;
}

/** 富化的收藏记录，包含角色详情和小说标题 */
export interface EnrichedCollection {
  characterId: string;
  novelId: string;
  characterName: string;
  novelTitle: string;
  role: string;
  roleLabel: string;
  personality: string;
  appearance: string;
  currentState: string;
  tags: string[];
  collectCount: number;
  hasPortrait: boolean;
  collectedAt: string;
  /** AI 每章生成的读者友好卡牌标签 */
  cardBlurb?: string;
  /** 稀有度定级 */
  rarity?: 'SSR' | 'SR' | 'R' | 'N';
}

const ROLE_LABEL_MAP: Record<string, string> = {
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

export class CharacterCardService {
  private storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'character-cards.json');
  }

  private loadStore(): CharacterCardStore {
    try {
      if (!fs.existsSync(this.storePath)) return { collections: [] };
      return JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as CharacterCardStore;
    } catch {
      return { collections: [] };
    }
  }

  private saveStore(store: CharacterCardStore) {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  /** 收藏/取消收藏（toggle） */
  toggleCollect(userId: string, characterId: string, novelId: string, characterName: string): boolean {
    const store = this.loadStore();
    const idx = store.collections.findIndex(
      (c) => c.userId === userId && c.characterId === characterId,
    );
    if (idx >= 0) {
      store.collections.splice(idx, 1);
      this.saveStore(store);
      return false; // 已取消
    }
    store.collections.push({
      userId,
      characterId,
      novelId,
      characterName,
      collectedAt: new Date().toISOString(),
    });
    this.saveStore(store);
    return true; // 已收藏
  }

  /** 检查用户是否已收藏 */
  isCollected(userId: string, characterId: string): boolean {
    const store = this.loadStore();
    return store.collections.some(
      (c) => c.userId === userId && c.characterId === characterId,
    );
  }

  /** 获取某个角色的收藏数 */
  getCollectCount(characterId: string): number {
    const store = this.loadStore();
    return store.collections.filter((c) => c.characterId === characterId).length;
  }

  /** 获取用户收藏列表 */
  getUserCollections(userId: string): CharacterCardCollection[] {
    const store = this.loadStore();
    return store.collections
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  }

  /** 获取用户在某本书中收藏的角色 ID 列表（用于朋友圈私密动态解锁） */
  getCollectedCharacterIds(userId: string, novelId?: string): string[] {
    const store = this.loadStore();
    return store.collections
      .filter((c) => c.userId === userId && (!novelId || c.novelId === novelId))
      .map((c) => c.characterId);
  }

  /** 获取热门角色排行（按收藏数） */
  getPopularRanking(limit = 20): Array<{ characterId: string; count: number }> {
    const store = this.loadStore();
    const map = new Map<string, number>();
    for (const c of store.collections) {
      map.set(c.characterId, (map.get(c.characterId) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([characterId, count]) => ({ characterId, count }));
  }

  /** 获取收藏某个角色的所有用户 ID 列表 */
  getUsersWhoCollectedCharacter(characterId: string): string[] {
    const store = this.loadStore();
    return store.collections
      .filter((c) => c.characterId === characterId)
      .map((c) => c.userId);
  }

  /** 获取用户收藏列表（富化版：附带角色详情和小说标题） */
  getUserCollectionsEnriched(userId: string): EnrichedCollection[] {
    const collections = this.getUserCollections(userId);
    return collections.map((c) => this.enrichCollection(c));
  }

  /** 将单条收藏记录富化为 EnrichedCollection */
  private enrichCollection(c: CharacterCardCollection): EnrichedCollection {
    const novelDir = path.join(this.dataDir, 'novels', c.novelId);
    let novelTitle = '';
    let profile: Record<string, unknown> | null = null;

    // 读取小说标题
    try {
      const novelRaw = JSON.parse(fs.readFileSync(path.join(novelDir, 'novel.json'), 'utf-8'));
      novelTitle = String(novelRaw.title ?? '');
    } catch { /* ignore */ }

    // 读取角色档案
    try {
      const chars = JSON.parse(fs.readFileSync(path.join(novelDir, 'characters.json'), 'utf-8'));
      if (Array.isArray(chars)) {
        profile = (chars as Record<string, unknown>[]).find(
          (ch) => String(ch.id) === c.characterId,
        ) ?? null;
      }
    } catch { /* ignore */ }

    const role = String(profile?.role ?? 'minor');
    const tags: string[] = Array.isArray(profile?.tags)
      ? (profile.tags as string[]).map(String)
      : [];
    const hasPortrait = typeof profile?.portraitImagePath === 'string'
      && (profile.portraitImagePath as string).length > 0;
    const collectCount = this.getCollectCount(c.characterId);
    const cardBlurb = typeof profile?.cardBlurb === 'string'
      ? (profile.cardBlurb as string)
      : undefined;

    // 稀有度定级
    let rarity: 'SSR' | 'SR' | 'R' | 'N' = 'N';
    if (role === 'protagonist' && collectCount >= 20) {
      rarity = 'SSR';
    } else if ((role === 'protagonist' || role === 'deuteragonist' || role === 'antagonist') && collectCount >= 5) {
      rarity = 'SR';
    } else if ((role === 'supporting' || role === 'rival' || role === 'love_interest' || role === 'mentor' || role === 'antagonist') && collectCount >= 3) {
      rarity = 'R';
    }

    return {
      characterId: c.characterId,
      novelId: c.novelId,
      characterName: c.characterName,
      novelTitle,
      role,
      roleLabel: ROLE_LABEL_MAP[role] ?? '角色',
      personality: String(profile?.personality ?? ''),
      appearance: String(profile?.appearance ?? ''),
      currentState: String(profile?.currentState ?? ''),
      tags,
      collectCount,
      hasPortrait,
      collectedAt: c.collectedAt,
      cardBlurb,
      rarity,
    };
  }
}
