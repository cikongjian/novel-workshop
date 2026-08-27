import fs from 'node:fs/promises';
import path from 'node:path';
import { now } from '../utils/text.js';
import {
  CharacterProfile,
  CharacterStateSnapshot,
  CharacterEvent,
} from './types.js';
import type { NovelPaths } from './novel-paths.js';
import { readJson, writeJson } from './fs-helpers.js';
import type {
  CharacterQuote,
  CharacterScene,
  PerCharacterHighlights,
} from './character-highlight-extractor.js';
import type { RelationPair, RelationExchange } from './character-relation-extractor.js';
import { projectCharacterIdentityLabels } from './character-identity-labels.js';

// ==================== PendingCharacterCandidate 类型 ====================

export type PendingCharacterCandidate = {
  name: string;
  firstDetectedIn: number;
  lastDetectedIn: number;
  hitCount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

// ==================== 角色 CRUD ====================

/**
 * 获取小说的所有角色
 */
export async function getCharacters(
  paths: NovelPaths,
  novelId: string,
): Promise<CharacterProfile[]> {
  const raw = await readJson<unknown[]>(paths.charactersPath(novelId), []);
  return raw.map((char) => {
    const parsed = CharacterProfile.parse(char);
    return {
      ...parsed,
      identityLabels: projectCharacterIdentityLabels(parsed),
    };
  });
}

/**
 * 保存角色（新增或更新）
 */
export async function saveCharacter(
  paths: NovelPaths,
  novelId: string,
  character: CharacterProfile,
): Promise<void> {
  const characters = await getCharacters(paths, novelId);
  const index = characters.findIndex(c => c.id === character.id);

  const validated = CharacterProfile.parse({
    ...character,
    identityLabels: projectCharacterIdentityLabels(character),
    updatedAt: now(),
  });

  if (index >= 0) {
    characters[index] = validated;
  } else {
    characters.push(validated);
  }

  await writeJson(paths.charactersPath(novelId), characters);
}

/**
 * 删除角色
 */
export async function deleteCharacter(
  paths: NovelPaths,
  novelId: string,
  characterId: string,
): Promise<void> {
  const characters = await getCharacters(paths, novelId);
  const filtered = characters.filter(c => c.id !== characterId);

  if (filtered.length === characters.length) {
    throw new Error(`角色不存在: ${characterId}`);
  }

  await writeJson(paths.charactersPath(novelId), filtered);
}

// ==================== 待审角色候选 ====================

export async function getPendingCharacterCandidates(
  paths: NovelPaths,
  novelId: string,
): Promise<PendingCharacterCandidate[]> {
  const raw = await readJson<unknown[]>(paths.pendingCharactersPath(novelId), []);
  const timestamp = now();
  const candidates: PendingCharacterCandidate[] = raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const name = String(item.name ?? '').trim();
      const firstDetectedIn = Number(item.firstDetectedIn ?? 1);
      const lastDetectedIn = Number(item.lastDetectedIn ?? firstDetectedIn);
      const hitCount = Number(item.hitCount ?? 1);
      const statusValue: PendingCharacterCandidate['status'] =
        item.status === 'approved' || item.status === 'rejected' || item.status === 'pending'
          ? item.status
          : 'pending';
      return {
        name,
        firstDetectedIn: Number.isFinite(firstDetectedIn) && firstDetectedIn > 0 ? Math.floor(firstDetectedIn) : 1,
        lastDetectedIn: Number.isFinite(lastDetectedIn) && lastDetectedIn > 0 ? Math.floor(lastDetectedIn) : 1,
        hitCount: Number.isFinite(hitCount) && hitCount > 0 ? Math.floor(hitCount) : 1,
        status: statusValue,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : timestamp,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : timestamp,
      };
    })
    .filter(item => item.name.length > 0);

  candidates.sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    if (a.lastDetectedIn !== b.lastDetectedIn) return b.lastDetectedIn - a.lastDetectedIn;
    return a.name.localeCompare(b.name);
  });
  return candidates;
}

export async function upsertPendingCharacterCandidates(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
  names: string[],
): Promise<PendingCharacterCandidate[]> {
  if (names.length === 0) {
    return getPendingCharacterCandidates(paths, novelId);
  }

  const existing = await getPendingCharacterCandidates(paths, novelId);
  const keyToCandidate = new Map<string, PendingCharacterCandidate>();
  for (const item of existing) {
    keyToCandidate.set(item.name.trim().toLowerCase(), item);
  }

  const timestamp = now();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const found = keyToCandidate.get(key);
    if (found) {
      found.lastDetectedIn = Math.max(found.lastDetectedIn, chapterNumber);
      found.hitCount += 1;
      found.updatedAt = timestamp;
      if (found.status === 'rejected') {
        found.status = 'pending';
      }
    } else {
      keyToCandidate.set(key, {
        name,
        firstDetectedIn: chapterNumber,
        lastDetectedIn: chapterNumber,
        hitCount: 1,
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  const next = [...keyToCandidate.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    if (a.lastDetectedIn !== b.lastDetectedIn) return b.lastDetectedIn - a.lastDetectedIn;
    return a.name.localeCompare(b.name);
  });
  await writeJson(paths.pendingCharactersPath(novelId), next);
  return next;
}

export async function markPendingCharacterCandidates(
  paths: NovelPaths,
  novelId: string,
  names: string[],
  status: PendingCharacterCandidate['status'],
): Promise<PendingCharacterCandidate[]> {
  const keySet = new Set(names.map(name => name.trim().toLowerCase()).filter(Boolean));
  if (keySet.size === 0) return getPendingCharacterCandidates(paths, novelId);

  const timestamp = now();
  const existing = await getPendingCharacterCandidates(paths, novelId);
  const updated = existing.map((item) => {
    const key = item.name.trim().toLowerCase();
    if (!keySet.has(key)) return item;
    return {
      ...item,
      status,
      updatedAt: timestamp,
    };
  });
  await writeJson(paths.pendingCharactersPath(novelId), updated);
  return updated;
}

export async function removePendingCharacterCandidates(
  paths: NovelPaths,
  novelId: string,
  names?: string[],
): Promise<PendingCharacterCandidate[]> {
  if (!names || names.length === 0) {
    await writeJson(paths.pendingCharactersPath(novelId), []);
    return [];
  }
  const keySet = new Set(names.map(name => name.trim().toLowerCase()).filter(Boolean));
  const existing = await getPendingCharacterCandidates(paths, novelId);
  const filtered = existing.filter(item => !keySet.has(item.name.trim().toLowerCase()));
  await writeJson(paths.pendingCharactersPath(novelId), filtered);
  return filtered;
}

// ==================== 角色状态快照 ====================

/**
 * 获取角色状态快照
 */
export async function getCharacterStateSnapshots(
  paths: NovelPaths,
  novelId: string,
  characterId?: string,
): Promise<CharacterStateSnapshot[]> {
  const raw = await readJson<unknown[]>(paths.characterStatesPath(novelId), []);
  const parsed = raw.map(item => CharacterStateSnapshot.parse(item));
  const filtered = characterId
    ? parsed.filter(item => item.characterId === characterId)
    : parsed;
  return filtered.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

/**
 * 保存角色状态快照（同角色同章节覆盖）
 */
export async function saveCharacterStateSnapshot(
  paths: NovelPaths,
  novelId: string,
  snapshot: CharacterStateSnapshot,
): Promise<void> {
  const snapshots = await getCharacterStateSnapshots(paths, novelId);
  const validated = CharacterStateSnapshot.parse({
    ...snapshot,
    novelId,
    updatedAt: now(),
  });

  const index = snapshots.findIndex(
    item => item.characterId === validated.characterId
      && item.chapterNumber === validated.chapterNumber,
  );
  if (index >= 0) {
    snapshots[index] = validated;
  } else {
    snapshots.push(validated);
  }

  snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
  await writeJson(paths.characterStatesPath(novelId), snapshots);
}

// ==================== 角色事件记忆链 ====================

/**
 * 获取角色事件列表（先读拆分目录，回退到旧版单文件）
 */
export async function getCharacterEvents(
  paths: NovelPaths,
  novelId: string,
  characterId?: string,
  fromChapter?: number,
  toChapter?: number,
): Promise<CharacterEvent[]> {
  let events: CharacterEvent[] = [];

  const dir = paths.characterEventsDir(novelId);
  let usedSplitDir = false;
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json'))
      .filter(f => {
        const num = parseInt(f, 10);
        if (isNaN(num)) return false;
        if (fromChapter != null && num < fromChapter) return false;
        if (toChapter != null && num > toChapter) return false;
        return true;
      });
    if (jsonFiles.length > 0) {
      usedSplitDir = true;
      const BATCH = 50;
      for (let i = 0; i < jsonFiles.length; i += BATCH) {
        const batch = jsonFiles.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async f => {
            try {
              const raw = await fs.readFile(path.join(dir, f), 'utf-8');
              return (JSON.parse(raw) as unknown[]).map(e => CharacterEvent.parse(e));
            } catch { return []; }
          }),
        );
        for (const arr of results) events.push(...arr);
      }
    }
  } catch { /* dir doesn't exist yet */ }

  if (!usedSplitDir) {
    // Fallback: legacy single file
    const raw = await readJson<unknown[]>(paths.characterEventsLegacyPath(novelId), []);
    events = raw.map(e => CharacterEvent.parse(e));
    if (fromChapter != null) events = events.filter(e => e.chapterNumber >= fromChapter);
    if (toChapter != null) events = events.filter(e => e.chapterNumber <= toChapter);
  }

  if (characterId) {
    events = events.filter(e => e.characterId === characterId);
  }

  return events.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

/**
 * 追加角色事件（按章分组写入，同角色同章节同摘要去重）
 */
export async function appendCharacterEvents(
  paths: NovelPaths,
  novelId: string,
  newEvents: CharacterEvent[],
): Promise<void> {
  if (newEvents.length === 0) return;

  const dir = paths.characterEventsDir(novelId);
  await fs.mkdir(dir, { recursive: true });

  // Group new events by chapter
  const byChapter = new Map<number, CharacterEvent[]>();
  for (const event of newEvents) {
    const list = byChapter.get(event.chapterNumber) ?? [];
    list.push(CharacterEvent.parse(event));
    byChapter.set(event.chapterNumber, list);
  }

  // For each chapter, read existing events, deduplicate, write back
  for (const [chapterNum, chapterEvents] of byChapter) {
    const filePath = paths.characterEventsFilePath(novelId, chapterNum);
    let existing: CharacterEvent[] = [];
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      existing = (JSON.parse(raw) as unknown[]).map(e => CharacterEvent.parse(e));
    } catch { /* file doesn't exist yet */ }

    const existingKeys = new Set(
      existing.map(e => `${e.characterId}:${e.chapterNumber}:${e.summary}`),
    );

    for (const event of chapterEvents) {
      const key = `${event.characterId}:${event.chapterNumber}:${event.summary}`;
      if (!existingKeys.has(key)) {
        existing.push(event);
        existingKeys.add(key);
      }
    }

    await writeJson(filePath, existing);
  }
}

// ==================== 角色高光（金句 + 场面）====================

export type CharacterHighlightsEntry = {
  characterId: string;
  quotes: CharacterQuote[];
  scenes: CharacterScene[];
};

type CharacterHighlightsStore = Record<string, CharacterHighlightsEntry>;

const MAX_QUOTES_PER_CHAR = 30;
const MAX_SCENES_PER_CHAR = 10;

/** 读取角色高光；指定 characterId 时只返回该角色 */
export async function getCharacterHighlights(
  paths: NovelPaths,
  novelId: string,
  characterId?: string,
): Promise<CharacterHighlightsEntry[]> {
  const store = await readJson<CharacterHighlightsStore>(
    paths.characterHighlightsPath(novelId),
    {},
  );
  const all = Object.values(store);
  return characterId ? all.filter((e) => e.characterId === characterId) : all;
}

/** 合并一章内各角色的高光候选：金句按 chapter:text 去重保留高分，场面按 chapter:text 去重，各自限额 */
export async function appendCharacterHighlights(
  paths: NovelPaths,
  novelId: string,
  perChapter: PerCharacterHighlights[],
): Promise<void> {
  if (perChapter.length === 0) return;
  const filePath = paths.characterHighlightsPath(novelId);
  const store = await readJson<CharacterHighlightsStore>(filePath, {});

  for (const item of perChapter) {
    const existing: CharacterHighlightsEntry = store[item.characterId] ?? {
      characterId: item.characterId,
      quotes: [],
      scenes: [],
    };

    const quoteMap = new Map<string, CharacterQuote>();
    for (const q of existing.quotes) quoteMap.set(`${q.chapter}:${q.text}`, q);
    for (const q of item.quotes) {
      const key = `${q.chapter}:${q.text}`;
      const prev = quoteMap.get(key);
      if (!prev || q.score > prev.score) quoteMap.set(key, q);
    }
    const quotes = [...quoteMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_QUOTES_PER_CHAR);

    const sceneMap = new Map<string, CharacterScene>();
    for (const s of existing.scenes) sceneMap.set(`${s.chapter}:${s.text}`, s);
    for (const s of item.scenes) sceneMap.set(`${s.chapter}:${s.text}`, s);
    const scenes = [...sceneMap.values()]
      .sort((a, b) => b.chapter - a.chapter)
      .slice(0, MAX_SCENES_PER_CHAR);

    store[item.characterId] = { characterId: item.characterId, quotes, scenes };
  }

  await writeJson(filePath, store);
}

// ==================== 角色关系（对话交锋）====================

export type CharacterRelationEntry = {
  aId: string;
  bId: string;
  encounters: number;
  coAppearances: number;
  lastChapter: number;
  bestExchange?: RelationExchange;
};

type CharacterRelationsStore = Record<string, CharacterRelationEntry>;

/** 读取涉及指定角色的关系（aId 或 bId 命中）；不指定则返回全部 */
export async function getCharacterRelations(
  paths: NovelPaths,
  novelId: string,
  characterId?: string,
): Promise<CharacterRelationEntry[]> {
  const store = await readJson<CharacterRelationsStore>(
    paths.characterRelationsPath(novelId),
    {},
  );
  const all = Object.values(store);
  return characterId
    ? all.filter((e) => e.aId === characterId || e.bId === characterId)
    : all;
}

/** 合并一章内的关系对：累加交锋/同框，更新最近章，保留最长名交锋 */
export async function appendCharacterRelations(
  paths: NovelPaths,
  novelId: string,
  pairs: RelationPair[],
): Promise<void> {
  if (pairs.length === 0) return;
  const filePath = paths.characterRelationsPath(novelId);
  const store = await readJson<CharacterRelationsStore>(filePath, {});

  for (const pair of pairs) {
    const [lo, hi] = pair.aId < pair.bId ? [pair.aId, pair.bId] : [pair.bId, pair.aId];
    const key = `${lo}|${hi}`;
    const existing: CharacterRelationEntry = store[key] ?? {
      aId: lo,
      bId: hi,
      encounters: 0,
      coAppearances: 0,
      lastChapter: 0,
    };
    existing.encounters += pair.encounters;
    existing.coAppearances += pair.coAppearances;
    existing.lastChapter = Math.max(existing.lastChapter, pair.chapter);
    if (
      pair.bestExchange &&
      (!existing.bestExchange ||
        pair.bestExchange.lines.length > existing.bestExchange.lines.length)
    ) {
      existing.bestExchange = pair.bestExchange;
    }
    store[key] = existing;
  }

  await writeJson(filePath, store);
}
