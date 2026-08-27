/**
 * 剧情投票服务 — 作者在章节末尾设置剧情分叉，读者投票决定走向。
 * 纯数据存储层，不涉及 AI 调用。
 */
import fs from 'fs';
import path from 'path';

/** 投票选项 */
export interface VoteOption {
  id: string;
  text: string;
}

/** 投票点 */
export interface VotePoint {
  id: string;
  novelId: string;
  chapterId: string;
  question: string;
  options: VoteOption[];
  /** 截止时间戳（ms） */
  deadline: number;
  /** open | closed */
  status: 'open' | 'closed';
  /** 截止时计算出的胜出选项 ID */
  winnerOptionId?: string;
  /** 作者是否采纳了投票结果 */
  adopted?: boolean;
  /**
   * AI 生成的富选项数据（来自 PlotExplorerAgent）。
   * 与 options[] 一一对应（按 optionId 索引），
   * 携带展示用的风险等级、影响预测、角色影响等。
   * 普通作者手写投票无此字段。
   */
  enrichedOptions?: Array<{
    optionId: string;
    title: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
    impactPrediction?: string;
    characterImpacts?: Array<{ name: string; impact: string }>;
  }>;
  createdAt: number;
  createdBy: string;
}

/** 单条投票记录 */
export interface VoteRecord {
  id: string;
  votePointId: string;
  optionId: string;
  readerId: string;
  createdAt: number;
}

/** 存储结构 */
interface VoteStore {
  votePoints: VotePoint[];
  votes: VoteRecord[];
}

export class VoteService {
  private readonly storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'plot-votes.json');
  }

  private loadStore(): VoteStore {
    if (!fs.existsSync(this.storePath)) return { votePoints: [], votes: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<VoteStore>;
      return {
        votePoints: raw.votePoints ?? [],
        votes: raw.votes ?? [],
      };
    } catch {
      return { votePoints: [], votes: [] };
    }
  }

  private saveStore(store: VoteStore): void {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private uuid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 惰性检查：关闭已过截止时间的投票点 */
  private checkExpired(store: VoteStore): boolean {
    let changed = false;
    const now = Date.now();
    for (const vp of store.votePoints) {
      if (vp.status === 'open' && now >= vp.deadline) {
        vp.status = 'closed';
        vp.winnerOptionId = this.computeWinner(store, vp);
        changed = true;
      }
    }
    return changed;
  }

  private computeWinner(store: VoteStore, vp: VotePoint): string | undefined {
    const counts = new Map<string, number>();
    for (const v of store.votes) {
      if (v.votePointId === vp.id) {
        counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
      }
    }
    if (counts.size === 0) return undefined;
    let winnerId: string | undefined;
    let maxCount = 0;
    for (const [optId, cnt] of counts) {
      if (cnt > maxCount) {
        maxCount = cnt;
        winnerId = optId;
      }
    }
    return winnerId;
  }

  // ── 作者操作 ──

  createVotePoint(params: {
    novelId: string;
    chapterId: string;
    question: string;
    options: string[];
    deadlineHours: number;
    createdBy: string;
    /** 可选：富选项数据（与 options 文本数组等长，按顺序对应） */
    enrichedOptions?: Array<{
      title: string;
      description: string;
      riskLevel: 'low' | 'medium' | 'high';
      impactPrediction?: string;
      characterImpacts?: Array<{ name: string; impact: string }>;
    }>;
  }): VotePoint {
    const store = this.loadStore();
    const now = Date.now();
    const options = params.options.map((text) => ({ id: this.uuid(), text }));
    const vp: VotePoint = {
      id: this.uuid(),
      novelId: params.novelId,
      chapterId: params.chapterId,
      question: params.question,
      options,
      deadline: now + params.deadlineHours * 3600_000,
      status: 'open',
      createdAt: now,
      createdBy: params.createdBy,
    };
    // 若调用方提供了富选项数据，按顺序对齐到生成的 optionId
    if (params.enrichedOptions && params.enrichedOptions.length === options.length) {
      vp.enrichedOptions = params.enrichedOptions.map((e, i) => ({
        optionId: options[i].id,
        title: e.title,
        description: e.description,
        riskLevel: e.riskLevel,
        impactPrediction: e.impactPrediction,
        characterImpacts: e.characterImpacts,
      }));
    }
    store.votePoints.push(vp);
    this.saveStore(store);
    return vp;
  }

  updateVotePoint(id: string, updates: { question?: string; options?: string[]; deadlineHours?: number }): VotePoint | null {
    const store = this.loadStore();
    const vp = store.votePoints.find((v) => v.id === id);
    if (!vp) return null;
    if (vp.status === 'closed') return null; // 已关闭不可编辑
    if (updates.question !== undefined) vp.question = updates.question;
    if (updates.options !== undefined) {
      // 保留旧选项 ID 如果文字没变，否则重新生成
      vp.options = updates.options.map((text, i) => {
        const existing = vp.options[i];
        return existing ? { id: existing.id, text } : { id: this.uuid(), text };
      });
    }
    if (updates.deadlineHours !== undefined) {
      vp.deadline = vp.createdAt + updates.deadlineHours * 3600_000;
    }
    this.saveStore(store);
    return vp;
  }

  deleteVotePoint(id: string): boolean {
    const store = this.loadStore();
    const before = store.votePoints.length;
    store.votePoints = store.votePoints.filter((v) => v.id !== id);
    store.votes = store.votes.filter((v) => v.votePointId !== id);
    const deleted = store.votePoints.length < before;
    if (deleted) this.saveStore(store);
    return deleted;
  }

  /** 删除指定小说指定章节的所有投票点和投票记录 */
  deleteByChapter(novelId: string, chapterId: string): number {
    const store = this.loadStore();
    const removedIds = new Set(
      store.votePoints
        .filter((v) => v.novelId === novelId && v.chapterId === chapterId)
        .map((v) => v.id),
    );
    if (removedIds.size === 0) return 0;
    store.votePoints = store.votePoints.filter((v) => !removedIds.has(v.id));
    store.votes = store.votes.filter((v) => !removedIds.has(v.votePointId));
    this.saveStore(store);
    return removedIds.size;
  }

  closeVotePoint(id: string): VotePoint | null {
    const store = this.loadStore();
    const vp = store.votePoints.find((v) => v.id === id);
    if (!vp) return null;
    vp.status = 'closed';
    vp.winnerOptionId = this.computeWinner(store, vp);
    this.saveStore(store);
    return vp;
  }

  adoptVotePoint(id: string, adopted: boolean): VotePoint | null {
    const store = this.loadStore();
    const vp = store.votePoints.find((v) => v.id === id);
    if (!vp) return null;
    vp.adopted = adopted;
    this.saveStore(store);
    return vp;
  }

  // ── 查询 ──

  getVotePoint(id: string): VotePoint | null {
    const store = this.loadStore();
    if (this.checkExpired(store)) this.saveStore(store);
    return store.votePoints.find((v) => v.id === id) ?? null;
  }

  getVotePointByChapter(novelId: string, chapterId: string): VotePoint | null {
    const store = this.loadStore();
    if (this.checkExpired(store)) this.saveStore(store);
    return store.votePoints.find((v) => v.novelId === novelId && v.chapterId === chapterId) ?? null;
  }

  listVotePointsByNovel(novelId: string): VotePoint[] {
    const store = this.loadStore();
    if (this.checkExpired(store)) this.saveStore(store);
    return store.votePoints
      .filter((v) => v.novelId === novelId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 获取投票统计 */
  getVoteStats(votePointId: string): {
    totalVotes: number;
    optionStats: { optionId: string; count: number; percentage: number }[];
  } {
    const store = this.loadStore();
    const vp = store.votePoints.find((v) => v.id === votePointId);
    if (!vp) return { totalVotes: 0, optionStats: [] };
    const counts = new Map<string, number>();
    for (const v of store.votes) {
      if (v.votePointId === votePointId) {
        counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
      }
    }
    const total = store.votes.filter((v) => v.votePointId === votePointId).length;
    return {
      totalVotes: total,
      optionStats: vp.options.map((opt) => ({
        optionId: opt.id,
        count: counts.get(opt.id) ?? 0,
        percentage: total > 0 ? Math.round(((counts.get(opt.id) ?? 0) / total) * 100) : 0,
      })),
    };
  }

  /** 读者是否已投票 */
  getReaderVote(votePointId: string, readerId: string): string | null {
    const store = this.loadStore();
    const vote = store.votes.find((v) => v.votePointId === votePointId && v.readerId === readerId);
    return vote?.optionId ?? null;
  }

  // ── 读者操作 ──

  castVote(votePointId: string, optionId: string, readerId: string): { success: boolean; error?: string } {
    const store = this.loadStore();
    if (this.checkExpired(store)) this.saveStore(store);

    const vp = store.votePoints.find((v) => v.id === votePointId);
    if (!vp) return { success: false, error: '投票点不存在' };
    if (vp.status === 'closed') return { success: false, error: '投票已截止' };
    if (Date.now() >= vp.deadline) return { success: false, error: '投票已截止' };
    if (!vp.options.some((o) => o.id === optionId)) return { success: false, error: '选项不存在' };

    // 检查是否已投
    const existing = store.votes.find((v) => v.votePointId === votePointId && v.readerId === readerId);
    if (existing) return { success: false, error: '你已经投过票了' };

    store.votes.push({
      id: this.uuid(),
      votePointId,
      optionId,
      readerId,
      createdAt: Date.now(),
    });
    this.saveStore(store);
    return { success: true };
  }
}
