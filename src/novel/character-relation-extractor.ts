/**
 * 角色关系提取器
 *
 * 从章节正文提取角色两两之间的「对话交锋」，构建关系卡数据。
 * 纯本地提取，复用 collectSpeakerQuotes（已支持两种说话人标记格式）。
 * 仅保留有交锋的关系——纯同框无对话的配角关系价值低，不输出。
 */
import type { CharacterProfile, CharacterStateSnapshot } from './types.js';
import { collectSpeakerQuotes } from './character-highlight-extractor.js';

/** 名交锋回合中的一句台词 */
export interface ExchangeLine {
  speakerId: string;
  text: string;
}

/** 名交锋回合 */
export interface RelationExchange {
  lines: ExchangeLine[];
  chapter: number;
}

/** 一对角色的单章关系提取结果 */
export interface RelationPair {
  aId: string;
  bId: string;
  chapter: number;
  /** 本章交锋次数（相邻对话回合数） */
  encounters: number;
  /** 本章同框（能对话必同框，记 1） */
  coAppearances: number;
  /** 本章最长的交锋回合 */
  bestExchange?: RelationExchange;
}

/** 回合最大保留句数；相邻两句视为同回合的最大字符间距 */
const MAX_EXCHANGE_LINES = 6;
const EXCHANGE_GAP_LIMIT = 300;

interface IdLine {
  id: string;
  text: string;
  index: number;
}

/** 角色对无向 key */
export function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function buildNameToIdMap(characters: CharacterProfile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of characters) {
    const names = [c.name, ...(c.aliases || [])]
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    for (const n of names) {
      const key = n.trim().toLowerCase().replace(/[\s　·•]/g, '');
      if (key && !map.has(key)) map.set(key, c.id);
    }
  }
  return map;
}

/**
 * 从按正文顺序的台词序列中提取两两交锋回合。
 * 相邻两句不同角色且字符间距 < 300 → 同回合；连续 A↔B 交替取最长（≤6 句）。
 * 返回 pairKey → { 最长回合台词, 累计交锋次数 }。
 */
function extractExchanges(
  lines: IdLine[],
): Map<string, { bestLines: ExchangeLine[]; encounters: number }> {
  const result = new Map<string, { bestLines: ExchangeLine[]; encounters: number }>();

  let i = 0;
  while (i + 1 < lines.length) {
    const aId = lines[i].id;
    // 同角色连续独白不算交锋，跳过
    if (lines[i + 1].id === aId) {
      i++;
      continue;
    }
    const bId = lines[i + 1].id;

    // 收集连续的 A-B 交替回合
    const run: IdLine[] = [lines[i], lines[i + 1]];
    let k = i + 2;
    while (
      k < lines.length &&
      (lines[k].id === aId || lines[k].id === bId) &&
      lines[k].id !== lines[k - 1].id &&
      lines[k].index - lines[k - 1].index < EXCHANGE_GAP_LIMIT
    ) {
      run.push(lines[k]);
      k++;
    }

    const key = pairKey(aId, bId);
    const encounters = run.length - 1;
    const bestLines = run.slice(0, MAX_EXCHANGE_LINES).map((r) => ({
      speakerId: r.id,
      text: r.text,
    }));
    const prev = result.get(key);
    if (!prev) {
      result.set(key, { bestLines, encounters });
    } else {
      prev.encounters += encounters;
      if (bestLines.length > prev.bestLines.length) prev.bestLines = bestLines;
    }

    i = k; // 跳过已处理回合
  }

  return result;
}

/**
 * 提取一章内角色两两的对话交锋关系。
 * 仅输出有交锋（encounters>0）且至少一方本章 present 的关系。
 */
export function extractChapterRelations(params: {
  chapterContent: string;
  characters: CharacterProfile[];
  snapshots: CharacterStateSnapshot[];
  chapterNumber: number;
}): RelationPair[] {
  const { chapterContent, characters, snapshots, chapterNumber } = params;
  if (!chapterContent.trim() || snapshots.length === 0) return [];

  const nameToId = buildNameToIdMap(characters);
  const presentIds = new Set(snapshots.map((s) => s.characterId));

  // collectSpeakerQuotes → 映射为 IdLine（跳过未建档说话人）
  const matches = collectSpeakerQuotes(chapterContent);
  const lines: IdLine[] = [];
  for (const m of matches) {
    const key = (m.name || '').trim().toLowerCase().replace(/[\s　·•]/g, '');
    const id = nameToId.get(key);
    if (!id) continue;
    const text = (m.quote || '').trim();
    if (text.length === 0) continue;
    lines.push({ id, text, index: m.index });
  }

  const exchanges = extractExchanges(lines);
  const result: RelationPair[] = [];
  for (const [key, ex] of exchanges) {
    const [aId, bId] = key.split('|');
    // 至少一方本章 present（避免给未登场角色配关系）
    if (!presentIds.has(aId) && !presentIds.has(bId)) continue;
    result.push({
      aId,
      bId,
      chapter: chapterNumber,
      encounters: ex.encounters,
      coAppearances: 1,
      bestExchange:
        ex.bestLines.length >= 2
          ? { lines: ex.bestLines, chapter: chapterNumber }
          : undefined,
    });
  }
  return result;
}
