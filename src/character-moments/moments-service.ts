/**
 * 角色朋友圈服务 — 存储与 CRUD，不直接调用 AI（生成在 moments-generator）。
 * 参考 letter-service.ts 的 JSON + Service 模式。
 */
import fs from 'fs';
import path from 'path';
import type { CharacterMoment, MomentComment, MomentStore, MomentType } from './types.js';

/** 每本书保留的最近动态数 */
const MAX_MOMENTS_PER_NOVEL = 200;
/** 每条动态评论上限 */
const MAX_COMMENTS_PER_MOMENT = 50;

export class MomentsService {
  private readonly storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'character-moments.json');
  }

  /** 读取存储 */
  private loadStore(): MomentStore {
    if (!fs.existsSync(this.storePath)) return { moments: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<MomentStore>;
      return { moments: raw.moments ?? [] };
    } catch {
      return { moments: [] };
    }
  }

  /** 保存存储 */
  private saveStore(store: MomentStore): void {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  /** 生成 UUID */
  private uuid(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /** 创建动态 */
  createMoment(params: {
    novelId: string;
    novelTitle: string;
    characterId: string;
    characterName: string;
    characterRole: string;
    type: MomentType;
    content: string;
    mood?: string;
    relatedChapterNum?: number;
    imageUrl?: string;
    isPrivate?: boolean;
  }): CharacterMoment {
    const store = this.loadStore();
    const moment: CharacterMoment = {
      id: this.uuid(),
      ...params,
      likes: 0,
      likedBy: [],
      comments: [],
      createdAt: Date.now(),
    };
    store.moments.unshift(moment);
    // 每本书保留最近 200 条，其他书的不动
    store.moments = this.sliceByNovel(store.moments, params.novelId);
    this.saveStore(store);
    return moment;
  }

  /** 按小说切片：指定小说保留最近 N 条，其他小说保持原样，整体按时间倒序 */
  private sliceByNovel(moments: CharacterMoment[], novelId: string): CharacterMoment[] {
    const others = moments.filter((m) => m.novelId !== novelId);
    const mine = moments.filter((m) => m.novelId === novelId).slice(0, MAX_MOMENTS_PER_NOVEL);
    return [...others, ...mine].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 获取某书的朋友圈流（分页）。私密动态仅对已收藏该角色的用户可见。 */
  listByNovel(
    novelId: string,
    limit = 20,
    before?: number,
    collectedCharacterIds?: string[],
  ): CharacterMoment[] {
    const store = this.loadStore();
    let list = store.moments.filter((m) => m.novelId === novelId);
    if (before) {
      list = list.filter((m) => m.createdAt < before);
    }
    // 私密动态过滤：未收藏该角色的用户看不到
    if (collectedCharacterIds) {
      const collectedSet = new Set(collectedCharacterIds);
      list = list.filter((m) => !m.isPrivate || collectedSet.has(m.characterId));
    } else {
      // 未登录用户只能看到公开动态
      list = list.filter((m) => !m.isPrivate);
    }
    return list.slice(0, limit);
  }

  /** 获取单条动态 */
  getById(id: string): CharacterMoment | undefined {
    const store = this.loadStore();
    return store.moments.find((m) => m.id === id);
  }

  /** 获取本周最热动态（最近 7 天点赞最多的公开动态，至少 2 个赞） */
  getHotMoment(novelId: string): CharacterMoment | undefined {
    const store = this.loadStore();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return store.moments
      .filter((m) => m.novelId === novelId && !m.isPrivate && m.createdAt > weekAgo)
      .sort((a, b) => b.likes - a.likes)
      .find((m) => m.likes >= 2);
  }

  /** 添加评论时检查是否已满 */
  isCommentFull(momentId: string): boolean {
    const store = this.loadStore();
    const moment = store.moments.find((m) => m.id === momentId);
    if (!moment) return true;
    return moment.comments.length >= MAX_COMMENTS_PER_MOMENT;
  }

  /** ---- 禁言管理 ---- */

  /** 获取某小说的禁言读者列表 */
  getMutedReaders(novelId: string): string[] {
    return this.loadMutedStore()[novelId] ?? [];
  }

  /** 禁言读者 */
  muteReader(novelId: string, userId: string): void {
    const store = this.loadMutedStore();
    if (!store[novelId]) store[novelId] = [];
    if (!store[novelId].includes(userId)) {
      store[novelId].push(userId);
      this.saveMutedStore(store);
    }
  }

  /** 解除禁言 */
  unmuteReader(novelId: string, userId: string): void {
    const store = this.loadMutedStore();
    if (store[novelId]) {
      store[novelId] = store[novelId].filter(id => id !== userId);
      if (store[novelId].length === 0) delete store[novelId];
      this.saveMutedStore(store);
    }
  }

  /** 检查读者是否被禁言 */
  isMuted(novelId: string, userId: string): boolean {
    return this.getMutedReaders(novelId).includes(userId);
  }

  /** 统计读者对某角色帖子的评论次数（防刷屏） */
  countReaderCommentsOnCharacter(novelId: string, userId: string, characterId: string): number {
    const store = this.loadStore();
    return store.moments
      .filter(m => m.novelId === novelId && m.characterId === characterId)
      .reduce((count, m) =>
        count + m.comments.filter(c => c.authorType === 'reader' && c.authorId === userId).length,
      0);
  }

  /** 检查读者最近评论是否重复内容 */
  isLastCommentDuplicate(userId: string, content: string): boolean {
    const store = this.loadStore();
    // 在所有动态中查找该用户最近的评论
    for (const m of store.moments) {
      for (let i = m.comments.length - 1; i >= 0; i--) {
        const c = m.comments[i];
        if (c.authorType === 'reader' && c.authorId === userId) {
          return c.content.trim() === content.trim();
        }
      }
    }
    return false;
  }

  /** 获取读者最近一次评论时间（防刷屏） */
  getLastCommentTime(userId: string): number | null {
    const store = this.loadStore();
    let latest = 0;
    for (const m of store.moments) {
      for (const c of m.comments) {
        if (c.authorType === 'reader' && c.authorId === userId && c.createdAt > latest) {
          latest = c.createdAt;
        }
      }
    }
    return latest || null;
  }

  /** 删除评论（作者/管理员） */
  deleteComment(momentId: string, commentId: string): boolean {
    const store = this.loadStore();
    const moment = store.moments.find((m) => m.id === momentId);
    if (!moment) return false;
    const idx = moment.comments.findIndex((c) => c.id === commentId);
    if (idx < 0) return false;
    moment.comments.splice(idx, 1);
    this.saveStore(store);
    return true;
  }

  /** 简单脏话词库（可扩展） */
  private static BAD_WORDS = [
    '傻逼', 'sb', 'sb', 'cnm', '操你', '操你妈', '草泥马', '草你妈',
    'tmd', '他妈的', '他妈', 'nmsl', 'nmsl', '日你', '日你妈',
    'fuck', 'shit', 'bitch', 'asshole',
    '脑残', '弱智', '废物', '人渣', '垃圾货',
    '婊子', '妓女', '贱人', '贱货', '骚货',
  ];

  /** 检查内容是否包含敏感词 */
  hasBadWords(content: string): string | null {
    const lower = content.toLowerCase();
    for (const w of MomentsService.BAD_WORDS) {
      if (lower.includes(w)) return w;
    }
    return null;
  }

  /** 检查读者名是否与角色名冲突 */
  isReaderNameImpersonating(displayName: string, characterNames: string[]): boolean {
    const trimmed = displayName.trim();
    if (trimmed.length < 2) return false;
    return characterNames.some(name => {
      // 完全匹配或去掉空格后匹配
      return name.trim() === trimmed ||
        name.trim().replace(/\s+/g, '') === trimmed.replace(/\s+/g, '');
    });
  }

  private mutedStorePath(): string {
    return path.join(this.dataDir, 'muted-readers.json');
  }

  private loadMutedStore(): Record<string, string[]> {
    try {
      if (fs.existsSync(this.mutedStorePath())) {
        return JSON.parse(fs.readFileSync(this.mutedStorePath(), 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  private saveMutedStore(store: Record<string, string[]>): void {
    fs.writeFileSync(this.mutedStorePath(), JSON.stringify(store, null, 2), 'utf-8');
  }

  /** ---- 举报管理 ---- */

  /** 举报评论 */
  reportComment(params: {
    novelId: string;
    momentId: string;
    commentId: string;
    reporterId: string;
    reason?: string;
  }): boolean {
    const store = this.loadReportStore();
    const key = `${params.momentId}:${params.commentId}`;
    if (!store[key]) store[key] = { reports: [] };
    // 同一个人对同一条评论只能举报一次
    if (store[key].reports.find((r: any) => r.reporterId === params.reporterId)) return false;
    store[key].reports.push({
      reporterId: params.reporterId,
      reason: params.reason || '',
      createdAt: Date.now(),
    });
    store[key].commentId = params.commentId;
    store[key].momentId = params.momentId;
    store[key].novelId = params.novelId;
    this.saveReportStore(store);
    return true;
  }

  private reportStorePath(): string {
    return path.join(this.dataDir, 'comment-reports.json');
  }

  private loadReportStore(): Record<string, any> {
    try {
      if (fs.existsSync(this.reportStorePath())) {
        return JSON.parse(fs.readFileSync(this.reportStorePath(), 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  private saveReportStore(store: Record<string, any>): void {
    fs.writeFileSync(this.reportStorePath(), JSON.stringify(store, null, 2), 'utf-8');
  }

  /** 该章节是否已存在指定角色的剧情动态（去重：每个角色每章最多一条自动触发的剧情朋友圈） */
  hasPlotMomentForChapter(novelId: string, chapterNumber: number, characterId?: string): boolean {
    const store = this.loadStore();
    return store.moments.some(
      (m) =>
        m.novelId === novelId &&
        m.type === 'plot' &&
        m.relatedChapterNum === chapterNumber &&
        (characterId ? m.characterId === characterId : true),
    );
  }

  /** 点赞 toggle */
  toggleLike(id: string, userId: string): { liked: boolean; likes: number } | null {
    const store = this.loadStore();
    const moment = store.moments.find((m) => m.id === id);
    if (!moment) return null;
    const idx = moment.likedBy.indexOf(userId);
    if (idx >= 0) {
      moment.likedBy.splice(idx, 1);
      moment.likes = Math.max(0, moment.likes - 1);
    } else {
      moment.likedBy.push(userId);
      moment.likes += 1;
    }
    this.saveStore(store);
    return { liked: idx < 0, likes: moment.likes };
  }

  /** 送花（每人每条动态限 1 次） */
  toggleFlower(id: string, userId: string): { flowered: boolean; flowers: number } | null {
    const store = this.loadStore();
    const moment = store.moments.find((m) => m.id === id);
    if (!moment) return null;
    if (!moment.floweredBy) moment.floweredBy = [];
    if (moment.flowers == null) moment.flowers = 0;
    const idx = moment.floweredBy.indexOf(userId);
    if (idx >= 0) {
      moment.floweredBy.splice(idx, 1);
      moment.flowers = Math.max(0, moment.flowers - 1);
    } else {
      moment.floweredBy.push(userId);
      moment.flowers += 1;
    }
    this.saveStore(store);
    return { flowered: idx < 0, flowers: moment.flowers };
  }

  /** 获取角色的连续发帖天数 */
  getCharacterStreak(novelId: string, characterId: string): number {
    const store = this.loadStore();
    const posts = store.moments
      .filter(m => m.novelId === novelId && m.characterId === characterId)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (posts.length === 0) return 0;
    
    let streak = 1;
    const now = new Date();
    const lastPostDay = new Date(posts[0].createdAt).toDateString();
    if (lastPostDay !== now.toDateString()) return 0; // 今天没发帖，断连
    
    for (let i = 1; i < posts.length; i++) {
      const curr = new Date(posts[i - 1].createdAt);
      const prev = new Date(posts[i].createdAt);
      const diffDays = Math.floor((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /** 添加评论（角色或读者） */
  addComment(momentId: string, params: {
    authorType: 'character' | 'reader';
    authorId: string;
    authorName: string;
    content: string;
  }): MomentComment | null {
    const store = this.loadStore();
    const moment = store.moments.find((m) => m.id === momentId);
    if (!moment) return null;
    if (moment.comments.length >= MAX_COMMENTS_PER_MOMENT) return null;
    const comment: MomentComment = {
      id: this.uuid(),
      ...params,
      likes: 0,
      createdAt: Date.now(),
    };
    moment.comments.push(comment);
    this.saveStore(store);
    return comment;
  }

  /** 按角色统计动态数（作者侧） */
  getCharacterStats(novelId: string): Array<{ characterId: string; characterName: string; characterRole: string; count: number }> {
    const store = this.loadStore();
    const novelMoments = store.moments.filter((m) => m.novelId === novelId);
    const map = new Map<string, { characterId: string; characterName: string; characterRole: string; count: number }>();
    for (const moment of novelMoments) {
      const existing = map.get(moment.characterId);
      if (existing) {
        existing.count++;
      } else {
        map.set(moment.characterId, {
          characterId: moment.characterId,
          characterName: moment.characterName,
          characterRole: moment.characterRole,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }
}
