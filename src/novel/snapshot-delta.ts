/**
 * snapshot-delta.ts — 增量快照存储
 * 计算并存储相邻 StoryStateSnapshot 之间的差异，降低长篇连载存储体积。
 */
import type { StoryStateSnapshot } from './story-state-types.js';

// ==================== 类型 ====================

export interface FieldDelta {
  path: string;        // JSON 路径，如 "characters[张三].location"
  op: 'set' | 'add' | 'remove';
  oldValue?: unknown;
  newValue?: unknown;
}

export interface SnapshotDelta {
  fromChapter: number;
  toChapter: number;
  deltas: FieldDelta[];
  chapterSummary: string;           // 始终完整保留
  nextChapterConstraints: string[]; // 始终完整保留
  createdAt: string;
}

// ==================== 常量 ====================

/** 数组项按 key 匹配（而非下标），避免重排序产生虚假 diff */
const ARRAY_KEY_FIELDS: Record<string, string | ((item: Record<string, unknown>) => string)> = {
  characters: 'name',
  factions: 'factionName',
  causalChains: (item) => `${item.cause}@${item.causeChapter}`,
};

const BYTES_PER_CHAR = 3;               // UTF-8 中文约 3 字节
const FIELD_DELTA_OVERHEAD_BYTES = 64;   // path + op + JSON 包裹开销

// ==================== 内部工具 ====================

function getItemKey(field: string, item: Record<string, unknown>): string {
  const k = ARRAY_KEY_FIELDS[field];
  if (!k) return JSON.stringify(item);
  return typeof k === 'function' ? k(item) : String(item[k] ?? '');
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b || typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function diffObjects(prev: Record<string, unknown>, curr: Record<string, unknown>, prefix: string, out: FieldDelta[]): void {
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const pv = prev[key], cv = curr[key];
    if (!(key in prev)) { out.push({ path, op: 'add', newValue: cv }); }
    else if (!(key in curr)) { out.push({ path, op: 'remove', oldValue: pv }); }
    else if (!deepEqual(pv, cv)) {
      if (pv && cv && typeof pv === 'object' && typeof cv === 'object' && !Array.isArray(pv) && !Array.isArray(cv)) {
        diffObjects(pv as Record<string, unknown>, cv as Record<string, unknown>, path, out);
      } else {
        out.push({ path, op: 'set', oldValue: pv, newValue: cv });
      }
    }
  }
}

function diffKeyedArray(prev: Record<string, unknown>[], curr: Record<string, unknown>[], field: string, out: FieldDelta[]): void {
  const prevMap = new Map(prev.map((item, i) => [getItemKey(field, item), { item, index: i }]));
  const currMap = new Map(curr.map((item, i) => [getItemKey(field, item), { item, index: i }]));
  for (const [key, { item, index }] of prevMap) {
    if (!currMap.has(key)) out.push({ path: `${field}[${index}]`, op: 'remove', oldValue: item });
  }
  for (const [key, { item: ci, index: idx }] of currMap) {
    const pe = prevMap.get(key);
    if (!pe) { out.push({ path: `${field}[${idx}]`, op: 'add', newValue: ci }); }
    else if (!deepEqual(pe.item, ci)) { diffObjects(pe.item, ci, `${field}[${key}]`, out); }
  }
}

// ==================== 路径解析 ====================

interface PathSegment { key: string; index?: number | string; }

function parsePath(path: string): PathSegment[] {
  return path.split('.').map((part) => {
    const m = part.match(/^([^[]+)\[(.+)]$/);
    if (!m) return { key: part };
    const numIdx = Number(m[2]);
    return { key: m[1], index: Number.isNaN(numIdx) ? m[2] : numIdx };
  });
}

function hasIndex(seg: PathSegment): seg is PathSegment & { index: number | string } {
  return seg.index !== undefined;
}

function navigateSegment(obj: unknown, seg: PathSegment): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return undefined;
  const container = (obj as Record<string, unknown>)[seg.key];
  if (seg.index === undefined) return container;
  if (!Array.isArray(container)) return undefined;
  if (typeof seg.index === 'number') return container[seg.index];
  const kf = ARRAY_KEY_FIELDS[seg.key];
  return container.find((it) =>
    typeof kf === 'function'
      ? kf(it as Record<string, unknown>) === seg.index
      : (it as Record<string, unknown>)[kf as string] === seg.index,
  );
}

// ==================== applyFieldDelta ====================

function findByKey(arr: unknown[], arrayName: string, index: string): number {
  const kf = ARRAY_KEY_FIELDS[arrayName];
  return arr.findIndex((it) =>
    typeof kf === 'function'
      ? kf(it as Record<string, unknown>) === index
      : (it as Record<string, unknown>)[kf as string] === index,
  );
}

function applyFieldDelta(root: Record<string, unknown>, fd: FieldDelta): void {
  const segs = parsePath(fd.path);
  if (segs.length === 0) return;

  // 顶级数组的 add / remove 快捷路径
  if (segs.length === 1 && hasIndex(segs[0])) {
    const arr = root[segs[0].key];
    if (!Array.isArray(arr)) return;
    if (fd.op === 'add') { arr.push(structuredClone(fd.newValue)); return; }
    if (fd.op === 'remove') {
      const ri = typeof segs[0].index === 'number' ? segs[0].index : findByKey(arr, segs[0].key, segs[0].index as string);
      if (ri >= 0) arr.splice(ri, 1);
      return;
    }
  }

  // 导航到父节点
  let target: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    target = navigateSegment(target, segs[i]);
    if (target === undefined || target === null) return;
  }

  const last = segs[segs.length - 1];
  if (hasIndex(last)) {
    const arr = (target as Record<string, unknown>)[last.key];
    if (!Array.isArray(arr)) return;
    if (fd.op === 'add') arr.push(structuredClone(fd.newValue));
    else if (fd.op === 'remove' && typeof last.index === 'number') arr.splice(last.index, 1);
    else if (fd.op === 'set' && typeof last.index === 'number') arr[last.index] = structuredClone(fd.newValue);
  } else {
    const obj = target as Record<string, unknown>;
    if (fd.op === 'remove') delete obj[last.key];
    else obj[last.key] = structuredClone(fd.newValue);
  }
}

// ==================== 导出 API ====================

/** 计算两个相邻快照之间的增量 */
export function computeDelta(prev: StoryStateSnapshot, curr: StoryStateSnapshot): SnapshotDelta {
  const deltas: FieldDelta[] = [];

  // 带 key 的数组字段
  for (const field of Object.keys(ARRAY_KEY_FIELDS) as (keyof StoryStateSnapshot)[]) {
    diffKeyedArray(prev[field] as Record<string, unknown>[], curr[field] as Record<string, unknown>[], field, deltas);
  }
  // 对象字段
  diffObjects(prev.world as unknown as Record<string, unknown>, curr.world as unknown as Record<string, unknown>, 'world', deltas);
  diffObjects(prev.plot as unknown as Record<string, unknown>, curr.plot as unknown as Record<string, unknown>, 'plot', deltas);

  return {
    fromChapter: prev.chapterNumber,
    toChapter: curr.chapterNumber,
    deltas,
    chapterSummary: curr.chapterSummary,
    nextChapterConstraints: curr.nextChapterConstraints,
    createdAt: curr.createdAt,
  };
}

/** 将 delta 应用到基准快照，返回重建后的新快照（不修改原对象） */
export function applyDelta(base: StoryStateSnapshot, delta: SnapshotDelta): StoryStateSnapshot {
  const result = structuredClone(base);
  for (const fd of delta.deltas) applyFieldDelta(result as unknown as Record<string, unknown>, fd);
  result.chapterNumber = delta.toChapter;
  result.chapterSummary = delta.chapterSummary;
  result.nextChapterConstraints = [...delta.nextChapterConstraints];
  result.createdAt = delta.createdAt;
  return result;
}

/** 从基准快照 + 有序 delta 列表重建目标章节快照 */
export function reconstructAt(base: StoryStateSnapshot, deltas: SnapshotDelta[], targetChapter: number): StoryStateSnapshot {
  if (base.chapterNumber === targetChapter) return structuredClone(base);
  let current = base;
  for (const delta of deltas) {
    if (delta.toChapter > targetChapter) break;
    current = applyDelta(current, delta);
  }
  return current;
}

/** 粗略估算 delta 的 JSON 序列化字节大小，供上层做存储预算决策 */
export function estimateDeltaSize(delta: SnapshotDelta): number {
  let size = 0;
  for (const fd of delta.deltas) {
    size += FIELD_DELTA_OVERHEAD_BYTES;
    size += (fd.path.length + JSON.stringify(fd.newValue ?? '').length) * BYTES_PER_CHAR;
    if (fd.oldValue !== undefined) size += JSON.stringify(fd.oldValue).length * BYTES_PER_CHAR;
  }
  size += delta.chapterSummary.length * BYTES_PER_CHAR;
  for (const c of delta.nextChapterConstraints) size += c.length * BYTES_PER_CHAR;
  return size;
}
