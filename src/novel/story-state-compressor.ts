/**
 * 故事状态压缩器
 *
 * 负责将旧快照压缩为弧线摘要（CompressedArc）和二级压缩（MegaArc）。
 * 从 story-state-manager.ts 拆分而来。
 */

import type { StoryState, CompressedArc } from './story-state-types.js';
import { isCriticalInfo } from '../pipeline/memory-decay.js';

/** 每隔多少章压缩一次弧线摘要 */
export const ARC_COMPRESS_INTERVAL = 10;

/** 注入 Writer 时最多携带多少章的详细快照 */
export const MAX_RECENT_SNAPSHOTS = 5;

/** 每多少个 arc 合并为 1 个 mega-arc（二级压缩） */
export const MEGA_ARC_COMPRESS_THRESHOLD = 3;

// ────────────────────────────────────────────────────────
// 优先级排序的状态变化（替代 slice(0, 10) 硬裁剪）
// ────────────────────────────────────────────────────────

/** 状态变化带来源章节和重要性评分 */
export interface PrioritizedStateChange {
  text: string;
  sourceChapter: number;
  importance: number; // 1-10
}

/** 最大保留的关键变化数量 */
const MAX_KEY_STATE_CHANGES = 15;

/** 根据内容推断重要性评分 */
function inferImportance(text: string): number {
  if (/死亡|殒命|牺牲|阵亡|身亡|陨落/.test(text)) return 9;
  if (/背叛|叛变|反水|谋反/.test(text)) return 8;
  if (isCriticalInfo(text)) return 7;
  if (/实力|突破|晋级|觉醒|进化/.test(text)) return 7;
  if (/关系|信任|敌意|联盟/.test(text)) return 5;
  if (/伏笔|因果|尚未兑现/.test(text)) return 6;
  if (/位置|到达|离开|前往/.test(text)) return 3;
  return 4;
}

/** 将字符串型 keyStateChanges 转换为带优先级的结构 */
function toPrioritized(texts: string[], sourceChapter: number): PrioritizedStateChange[] {
  return texts.map(text => ({
    text,
    sourceChapter,
    importance: inferImportance(text),
  }));
}

/** 从带优先级列表中选取 top N，按重要性排序、去重 */
function selectTopChanges(items: PrioritizedStateChange[], limit: number = MAX_KEY_STATE_CHANGES): string[] {
  const deduped = new Map<string, PrioritizedStateChange>();
  for (const item of items) {
    const existing = deduped.get(item.text);
    if (!existing || item.importance > existing.importance) {
      deduped.set(item.text, item);
    }
  }
  return [...deduped.values()]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit)
    .map(i => i.text);
}

// ────────────────────────────────────────────────────────
// 一级压缩：快照 → CompressedArc
// ────────────────────────────────────────────────────────

/**
 * 检测并执行一级压缩。
 * @returns 压缩后的新 state（不修改原对象）和是否发生了压缩
 */
export function compressSnapshots(state: StoryState): { state: StoryState; compressed: boolean } {
  const uncompressedCount = state.snapshots.length;
  if (uncompressedCount <= ARC_COMPRESS_INTERVAL + MAX_RECENT_SNAPSHOTS) {
    return { state, compressed: false };
  }

  const updated: StoryState = { ...state, compressedArcs: [...state.compressedArcs] };

  // 找出需要压缩的快照（排除最近 N 个）
  const toCompress = updated.snapshots.slice(0, -MAX_RECENT_SNAPSHOTS);
  const lastCompressedChapter = updated.compressedArcs.length > 0
    ? updated.compressedArcs[updated.compressedArcs.length - 1].chapterRange.end
    : 0;

  const newBatch = toCompress.filter(s => s.chapterNumber > lastCompressedChapter);
  if (newBatch.length < ARC_COMPRESS_INTERVAL) {
    return { state, compressed: false };
  }

  // 按 ARC_COMPRESS_INTERVAL 分组压缩
  for (let i = 0; i < newBatch.length; i += ARC_COMPRESS_INTERVAL) {
    const batch = newBatch.slice(i, i + ARC_COMPRESS_INTERVAL);
    if (batch.length === 0) break;

    const start = batch[0].chapterNumber;
    const end = batch[batch.length - 1].chapterNumber;
    const summaries = batch.map(s => s.chapterSummary).filter(Boolean);

    const allChanges: PrioritizedStateChange[] = [];
    for (const s of batch) {
      const chapterChanges: string[] = [];
      for (const c of s.characters) {
        if (c.powerChange) chapterChanges.push(`${c.name}：${c.powerChange}`);
        if (!c.alive) chapterChanges.push(`${c.name}死亡`);
      }
      for (const chain of s.causalChains) {
        if (chain.pendingEffects.length > 0) {
          chapterChanges.push(`「${chain.cause}」尚未兑现`);
        }
      }
      allChanges.push(...toPrioritized(chapterChanges, s.chapterNumber));
    }

    updated.compressedArcs.push({
      chapterRange: { start, end },
      summary: summaries.join('→'),
      keyStateChanges: selectTopChanges(allChanges),
    });
  }

  // 移除已压缩的快照
  updated.snapshots = updated.snapshots.slice(-MAX_RECENT_SNAPSHOTS);
  updated.updatedAt = new Date().toISOString();

  return { state: updated, compressed: true };
}

// ────────────────────────────────────────────────────────
// 二级压缩：CompressedArc → MegaArc
// ────────────────────────────────────────────────────────

/**
 * 检测并执行二级压缩（mega-arc）。
 * 直接修改 state 对象。
 */
export function compressMegaArcsIfNeeded(state: StoryState): void {
  if (!state.megaArcs) state.megaArcs = [];

  const lastMegaEnd = state.megaArcs.length > 0
    ? state.megaArcs[state.megaArcs.length - 1].chapterRange.end
    : 0;

  const uncovered = state.compressedArcs.filter(a => a.chapterRange.end > lastMegaEnd);
  if (uncovered.length < MEGA_ARC_COMPRESS_THRESHOLD) return;

  for (let i = 0; i + MEGA_ARC_COMPRESS_THRESHOLD <= uncovered.length; i += MEGA_ARC_COMPRESS_THRESHOLD) {
    const group = uncovered.slice(i, i + MEGA_ARC_COMPRESS_THRESHOLD);
    const start = group[0].chapterRange.start;
    const end = group[group.length - 1].chapterRange.end;

    // 合并摘要
    const summary = group.map(a => a.summary).join(' → ');

    // 合并关键变化——使用优先级排序
    const allChanges: PrioritizedStateChange[] = [];
    for (const arc of group) {
      allChanges.push(...toPrioritized(arc.keyStateChanges, arc.chapterRange.start));
    }

    state.megaArcs.push({
      chapterRange: { start, end },
      summary,
      keyStateChanges: selectTopChanges(allChanges),
    });
  }
}
