/**
 * 分叉（抱走）服务 — 管理分叉记录与作品级配置。
 * 纯数据存储层，不涉及 AI 调用。
 * 存储：data/forks.json（记录）+ data/fork-configs.json（配置）
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ForkRecord, ForkConfig, ForkPermission, ForkPublishRequest, ForkPublishStatus, ForkStats } from '../novel/fork-types.js';

interface ForkStore {
  records: ForkRecord[];
  publishRequests: ForkPublishRequest[];
}

interface ForkConfigStore {
  configs: Record<string, ForkConfig>;
}

const DEFAULT_PERMISSION: ForkPermission = 'all';

export class ForkService {
  private readonly recordsPath: string;
  private readonly configsPath: string;
  private cache: ForkStore | null = null;
  private configCache: ForkConfigStore | null = null;

  constructor(dataDir: string) {
    this.recordsPath = path.join(dataDir, 'forks.json');
    this.configsPath = path.join(dataDir, 'fork-configs.json');
  }

  // ── 记录 ──

  private loadRecords(): ForkStore {
    if (this.cache) return this.cache;
    try {
      if (!fs.existsSync(this.recordsPath)) {
        this.cache = { records: [], publishRequests: [] };
        return this.cache;
      }
      const raw = fs.readFileSync(this.recordsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ForkStore>;
      this.cache = {
        records: parsed.records ?? [],
        publishRequests: parsed.publishRequests ?? [],
      };
      return this.cache;
    } catch {
      this.cache = { records: [], publishRequests: [] };
      return this.cache;
    }
  }

  private saveRecords(): void {
    if (!this.cache) return;
    fs.writeFileSync(this.recordsPath, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  /** 创建分叉记录 */
  create(params: {
    originalNovelId: string;
    originalTitle: string;
    forkedNovelId: string;
    fromChapter: number;
    forkedBy: string;
    forkedByName?: string;
    isPublic?: boolean;
  }): ForkRecord {
    const store = this.loadRecords();
    const record: ForkRecord = {
      id: randomUUID(),
      originalNovelId: params.originalNovelId,
      originalTitle: params.originalTitle,
      forkedNovelId: params.forkedNovelId,
      fromChapter: params.fromChapter,
      forkedBy: params.forkedBy,
      forkedByName: params.forkedByName ?? '',
      isPublic: params.isPublic ?? true,
      createdAt: new Date().toISOString(),
    };
    store.records.unshift(record);
    this.saveRecords();
    return record;
  }

  /** 查询某作品的分叉记录（作为源作品） */
  listByNovel(novelId: string, includePrivate = false): ForkRecord[] {
    const store = this.loadRecords();
    return store.records.filter(
      (r) =>
        r.originalNovelId === novelId &&
        (includePrivate || r.isPublic),
    );
  }

  /** 查询某用户抱走过的作品（作为分叉者） */
  listByUser(userId: string): ForkRecord[] {
    const store = this.loadRecords();
    return store.records.filter((r) => r.forkedBy === userId);
  }

  /** 检查重复抱走：同一用户对同一作品同一章节 */
  hasForked(novelId: string, userId: string, fromChapter: number): boolean {
    const store = this.loadRecords();
    return store.records.some(
      (r) =>
        r.originalNovelId === novelId &&
        r.forkedBy === userId &&
        r.fromChapter === fromChapter,
    );
  }

  /** 统计某作品的分叉数 */
  countByNovel(novelId: string): number {
    const store = this.loadRecords();
    return store.records.filter(
      (r) => r.originalNovelId === novelId && r.isPublic,
    ).length;
  }

  /** 切换分叉的公开/私有 */
  setVisibility(recordId: string, isPublic: boolean): ForkRecord | null {
    const store = this.loadRecords();
    const record = store.records.find((r) => r.id === recordId);
    if (!record) return null;
    record.isPublic = isPublic;
    this.saveRecords();
    return record;
  }

  /** 获取作品分叉统计 */
  getStats(novelId: string): ForkStats {
    const store = this.loadRecords();
    const novelRecords = store.records.filter((r) => r.originalNovelId === novelId);
    const chapterMap = new Map<number, number>();
    for (const r of novelRecords) {
      chapterMap.set(r.fromChapter, (chapterMap.get(r.fromChapter) ?? 0) + 1);
    }
    const byChapter = [...chapterMap.entries()]
      .map(([chapter, count]) => ({ chapter, count }))
      .sort((a, b) => b.count - a.count);
    const latestForkAt = novelRecords.length > 0
      ? novelRecords.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), novelRecords[0].createdAt)
      : null;
    return {
      total: novelRecords.length,
      publicCount: novelRecords.filter((r) => r.isPublic).length,
      privateCount: novelRecords.filter((r) => !r.isPublic).length,
      byChapter,
      latestForkAt,
    };
  }

  /** 删除单条分叉记录 */
  deleteRecord(recordId: string): boolean {
    const store = this.loadRecords();
    const idx = store.records.findIndex((r) => r.id === recordId);
    if (idx === -1) return false;
    store.records.splice(idx, 1);
    this.saveRecords();
    // 清除缓存强制重读
    this.cache = null;
    return true;
  }

  /** 清空某作品的全部分叉记录 */
  clearByNovel(novelId: string): number {
    const store = this.loadRecords();
    const before = store.records.length;
    store.records = store.records.filter((r) => r.originalNovelId !== novelId);
    const removed = before - store.records.length;
    if (removed > 0) {
      this.saveRecords();
      this.cache = null;
    }
    return removed;
  }

  // ── 配置 ──

  private loadConfigs(): ForkConfigStore {
    if (this.configCache) return this.configCache;
    try {
      if (!fs.existsSync(this.configsPath)) {
        this.configCache = { configs: {} };
        return this.configCache;
      }
      const raw = fs.readFileSync(this.configsPath, 'utf-8');
      this.configCache = JSON.parse(raw) as ForkConfigStore;
      return this.configCache;
    } catch {
      this.configCache = { configs: {} };
      return this.configCache;
    }
  }

  private saveConfigs(): void {
    if (!this.configCache) return;
    fs.writeFileSync(this.configsPath, JSON.stringify(this.configCache, null, 2), 'utf-8');
  }

  /** 获取作品分叉配置（不存在时返回默认配置） */
  getConfig(novelId: string): ForkConfig {
    const store = this.loadConfigs();
    return (
      store.configs[novelId] ?? {
        novelId,
        allowFork: false,
        permission: DEFAULT_PERMISSION,
        chapterMode: 'all',
        allowedChapters: [],
        authorNote: '',
        updatedAt: new Date().toISOString(),
      }
    );
  }

  /** 更新作品分叉配置 */
  updateConfig(
    novelId: string,
    patch: Partial<Pick<ForkConfig, 'allowFork' | 'permission' | 'chapterMode' | 'allowedChapters' | 'authorNote'>>,
  ): ForkConfig {
    const store = this.loadConfigs();
    const existing = store.configs[novelId];
    const updated: ForkConfig = {
      novelId,
      allowFork: patch.allowFork ?? existing?.allowFork ?? true,
      permission: patch.permission ?? existing?.permission ?? DEFAULT_PERMISSION,
      chapterMode: patch.chapterMode ?? existing?.chapterMode ?? 'all',
      allowedChapters: patch.allowedChapters ?? existing?.allowedChapters ?? [],
      authorNote: patch.authorNote ?? existing?.authorNote ?? '',
      updatedAt: new Date().toISOString(),
    };
    store.configs[novelId] = updated;
    this.saveConfigs();
    return updated;
  }

  /** 检查是否允许抱走 */
  canFork(
    novelId: string,
    userId: string,
    isFollower: boolean,
    fromChapter?: number,
  ): { allowed: boolean; reason?: string } {
    const config = this.getConfig(novelId);
    if (!config.allowFork || config.permission === 'closed') {
      return { allowed: false, reason: '作者已关闭抱走功能' };
    }
    if (config.permission === 'followers' && !isFollower) {
      return { allowed: false, reason: '仅关注者可抱走，请先收藏该作品' };
    }
    // 章节白名单校验
    if (config.chapterMode === 'selected' && fromChapter !== undefined) {
      if (!config.allowedChapters.includes(fromChapter)) {
        return { allowed: false, reason: '作者仅开放了部分章节供抱走，请换一章试试' };
      }
    }
    return { allowed: true };
  }

  // ── 分叉发布审批 ──

  /** 创建发布审批申请 */
  createPublishRequest(params: {
    forkedNovelId: string;
    forkedTitle: string;
    originalNovelId: string;
    originalTitle: string;
    originalCover: string;
    forkedCover: string;
    requesterId: string;
    requesterName?: string;
    message?: string;
  }): ForkPublishRequest {
    const store = this.loadRecords();
    // 同一作品已有 pending 申请则不允许重复
    const existing = store.publishRequests.find(
      (r) => r.forkedNovelId === params.forkedNovelId && r.status === 'pending',
    );
    if (existing) {
      throw new Error('该作品已有一个待审批的发布申请，请等待原作者处理');
    }
    const request: ForkPublishRequest = {
      id: randomUUID(),
      forkedNovelId: params.forkedNovelId,
      forkedTitle: params.forkedTitle,
      originalNovelId: params.originalNovelId,
      originalTitle: params.originalTitle,
      originalCover: params.originalCover,
      forkedCover: params.forkedCover,
      requesterId: params.requesterId,
      requesterName: params.requesterName ?? '',
      message: params.message ?? '',
      status: 'pending',
      reviewerId: '',
      reviewComment: '',
      createdAt: new Date().toISOString(),
    };
    store.publishRequests.unshift(request);
    this.saveRecords();
    return request;
  }

  /** 获取某分叉作品的最新发布申请 */
  getPublishRequestByForked(forkedNovelId: string): ForkPublishRequest | null {
    const store = this.loadRecords();
    return store.publishRequests.find((r) => r.forkedNovelId === forkedNovelId) ?? null;
  }

  /** 获取某分叉作品的已通过申请（发布闸门用） */
  getApprovedPublishRequest(forkedNovelId: string): ForkPublishRequest | null {
    const store = this.loadRecords();
    return (
      store.publishRequests.find(
        (r) => r.forkedNovelId === forkedNovelId && r.status === 'approved',
      ) ?? null
    );
  }

  /** 原作者收到的发布申请列表 */
  listPublishRequestsByOriginal(originalNovelId: string, status?: ForkPublishStatus): ForkPublishRequest[] {
    const store = this.loadRecords();
    return store.publishRequests.filter(
      (r) => r.originalNovelId === originalNovelId && (!status || r.status === status),
    );
  }

  /** 当前用户发起的发布申请 */
  listPublishRequestsByRequester(requesterId: string): ForkPublishRequest[] {
    const store = this.loadRecords();
    return store.publishRequests.filter((r) => r.requesterId === requesterId);
  }

  /** 审批发布申请 */
  reviewPublishRequest(
    requestId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
  ): ForkPublishRequest | null {
    const store = this.loadRecords();
    const req = store.publishRequests.find((r) => r.id === requestId);
    if (!req) return null;
    if (req.status !== 'pending') return req;
    req.status = decision;
    req.reviewerId = reviewerId;
    req.reviewComment = comment ?? '';
    req.reviewedAt = new Date().toISOString();
    this.saveRecords();
    return req;
  }

  /** 按 ID 获取发布申请 */
  getPublishRequestById(id: string): ForkPublishRequest | null {
    const store = this.loadRecords();
    return store.publishRequests.find((r) => r.id === id) ?? null;
  }

  /** 列出所有发布申请（供路由层按 owner 过滤） */
  listAllPublishRequests(status?: ForkPublishStatus): ForkPublishRequest[] {
    const store = this.loadRecords();
    return store.publishRequests.filter((r) => !status || r.status === status);
  }
}
