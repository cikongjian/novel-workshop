/**
 * AI 番外生成服务 — 存储读者生成的番外短篇，管理审核状态。
 * 纯数据存储层，AI 调用在路由层完成。
 */
import fs from 'fs';
import path from 'path';

/** 番外场景类型 */
export type SideStorySceneType = 'childhood' | 'daily' | 'what-if' | 'prequel' | 'custom';

/** 番外状态 */
export type SideStoryStatus = 'pending' | 'approved' | 'rejected' | 'published';

/** 番外短篇 */
export interface SideStory {
  id: string;
  novelId: string;
  title: string;
  content: string;
  characterIds: string[];
  characterNames: string[];
  sceneType: SideStorySceneType;
  customScene?: string;
  wordCount: number;
  status: SideStoryStatus;
  generatedBy: string;
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  likes: string[]; // readerId 数组
}

/** 番外配置 */
export interface SideStoryConfig {
  novelId: string;
  enabledCharacterIds: string[];
  dailyLimitPerReader: number;
  autoPublish: boolean;
}

/** 存储结构 */
interface SideStoryStore {
  stories: SideStory[];
  configs: SideStoryConfig[];
}

const DEFAULT_DAILY_LIMIT = 3;

export class SideStoryService {
  private readonly storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'side-stories.json');
  }

  private loadStore(): SideStoryStore {
    if (!fs.existsSync(this.storePath)) return { stories: [], configs: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<SideStoryStore>;
      return {
        stories: raw.stories ?? [],
        configs: raw.configs ?? [],
      };
    } catch {
      return { stories: [], configs: [] };
    }
  }

  private saveStore(store: SideStoryStore): void {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private uuid(): string {
    return `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 创建番外（初始状态为 pending） */
  create(data: {
    novelId: string;
    title: string;
    content: string;
    characterIds: string[];
    characterNames: string[];
    sceneType: SideStorySceneType;
    customScene?: string;
    generatedBy: string;
  }): SideStory {
    const store = this.loadStore();
    const config = this.getConfig(data.novelId);
    const story: SideStory = {
      id: this.uuid(),
      novelId: data.novelId,
      title: data.title,
      content: data.content,
      characterIds: data.characterIds,
      characterNames: data.characterNames,
      sceneType: data.sceneType,
      customScene: data.customScene,
      wordCount: data.content.length,
      status: config?.autoPublish ? 'published' : 'pending',
      generatedBy: data.generatedBy,
      createdAt: Date.now(),
      likes: [],
    };
    store.stories.push(story);
    this.saveStore(store);
    return story;
  }

  /** 获取番外 */
  getById(id: string): SideStory | null {
    const store = this.loadStore();
    return store.stories.find((s) => s.id === id) ?? null;
  }

  /** 列表（读者只看 published，作者看全部） */
  listByNovel(novelId: string, includeAll: boolean): SideStory[] {
    const store = this.loadStore();
    return store.stories
      .filter((s) => s.novelId === novelId)
      .filter((s) => includeAll || s.status === 'published')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 审核 */
  review(id: string, status: 'approved' | 'rejected' | 'published', reviewerId: string): SideStory | null {
    const store = this.loadStore();
    const story = store.stories.find((s) => s.id === id);
    if (!story) return null;
    story.status = status;
    story.reviewedAt = Date.now();
    story.reviewedBy = reviewerId;
    this.saveStore(store);
    return story;
  }

  /** 点赞/取消点赞 */
  toggleLike(id: string, readerId: string): { liked: boolean; likeCount: number } | null {
    const store = this.loadStore();
    const story = store.stories.find((s) => s.id === id);
    if (!story) return null;
    const idx = story.likes.indexOf(readerId);
    if (idx >= 0) {
      story.likes.splice(idx, 1);
    } else {
      story.likes.push(readerId);
    }
    this.saveStore(store);
    return { liked: idx < 0, likeCount: story.likes.length };
  }

  /** 检查每日限制 */
  checkDailyLimit(novelId: string, readerId: string): { ok: boolean; reason?: string } {
    const store = this.loadStore();
    const config = this.getConfig(novelId);
    const limit = config?.dailyLimitPerReader ?? DEFAULT_DAILY_LIMIT;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayCount = store.stories.filter(
      (s) => s.novelId === novelId && s.generatedBy === readerId && s.createdAt >= todayStart,
    ).length;
    if (todayCount >= limit) {
      return { ok: false, reason: `今日已生成 ${limit} 篇番外，明日再来吧` };
    }
    return { ok: true };
  }

  /** 获取配置 */
  getConfig(novelId: string): SideStoryConfig | null {
    const store = this.loadStore();
    return store.configs.find((c) => c.novelId === novelId) ?? null;
  }

  /** 更新配置 */
  updateConfig(novelId: string, updates: Partial<SideStoryConfig>): SideStoryConfig {
    const store = this.loadStore();
    let config = store.configs.find((c) => c.novelId === novelId);
    if (!config) {
      config = {
        novelId,
        enabledCharacterIds: [],
        dailyLimitPerReader: DEFAULT_DAILY_LIMIT,
        autoPublish: false,
      };
      store.configs.push(config);
    }
    Object.assign(config, updates);
    this.saveStore(store);
    return config;
  }

  /** 删除番外 */
  delete(id: string): boolean {
    const store = this.loadStore();
    const idx = store.stories.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    store.stories.splice(idx, 1);
    this.saveStore(store);
    return true;
  }
}
