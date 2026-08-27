/**
 * 故事状态加载规整器
 *
 * 从磁盘读取 story-state.json 后，逐条用 Zod 校验快照并补全默认值，
 * 丢弃结构损坏的半成品快照（如批量生成失败时写入的残缺数据），
 * 防止下游 formatSnapshot 因字段缺失（如 relationshipChanges 为 undefined）而崩溃。
 *
 * 设计要点：
 * - 缺失的数组/对象字段由 schema 的 `.default()` 自动补全（最常见的损坏形态）；
 * - 仅丢弃无法解析的单条快照/弧线，保留其余有效数据，避免一处损坏连累整本书；
 * - 规整结果会在下一次 saveSnapshot 写回时自然落盘为干净数据，实现自愈。
 */
import { StoryStateSnapshot, CompressedArc } from './story-state-types.js';
import type { StoryState } from './story-state-types.js';

export interface NormalizedStoryState {
  state: StoryState;
  /** 因结构损坏被丢弃的快照条数（用于上层告警日志） */
  droppedSnapshots: number;
}

function emptyStoryState(novelId: string): StoryState {
  return {
    novelId,
    latestChapter: 0,
    snapshots: [],
    compressedArcs: [],
    megaArcs: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeArcs(raw: unknown): CompressedArc[] {
  if (!Array.isArray(raw)) return [];
  const arcs: CompressedArc[] = [];
  for (const item of raw) {
    const result = CompressedArc.safeParse(item);
    if (result.success) arcs.push(result.data);
  }
  return arcs;
}

/**
 * 规整磁盘上的故事状态 JSON。
 *
 * 入参 `raw` 为已 `JSON.parse` 的原始对象（可能字段缺失/类型错乱）。
 * 返回结构与 StoryState 一致的可安全消费对象。
 */
export function normalizeLoadedStoryState(raw: unknown, novelId: string): NormalizedStoryState {
  if (!raw || typeof raw !== 'object') {
    return { state: emptyStoryState(novelId), droppedSnapshots: 0 };
  }
  const obj = raw as Record<string, unknown>;

  const rawSnapshots = Array.isArray(obj.snapshots) ? obj.snapshots : [];
  const snapshots: StoryStateSnapshot[] = [];
  let droppedSnapshots = 0;
  for (const snap of rawSnapshots) {
    const result = StoryStateSnapshot.safeParse(snap);
    if (result.success) {
      snapshots.push(result.data);
    } else {
      // 结构损坏（字段类型错乱或必填项缺失）的单条快照直接丢弃；
      // 章节正文仍保存在 chapters/ 下，下次生成会基于正文重建状态。
      droppedSnapshots += 1;
    }
  }
  if (snapshots.length > 1) {
    snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  const latestFromSnapshots = snapshots.length > 0
    ? snapshots[snapshots.length - 1].chapterNumber
    : 0;
  const rawLatest = typeof obj.latestChapter === 'number' ? obj.latestChapter : 0;
  const updatedAt = typeof obj.updatedAt === 'string' && obj.updatedAt.length > 0
    ? obj.updatedAt
    : new Date().toISOString();

  const state: StoryState = {
    novelId,
    latestChapter: Math.max(rawLatest, latestFromSnapshots),
    snapshots,
    compressedArcs: normalizeArcs(obj.compressedArcs),
    megaArcs: normalizeArcs(obj.megaArcs),
    updatedAt,
  };

  return { state, droppedSnapshots };
}
