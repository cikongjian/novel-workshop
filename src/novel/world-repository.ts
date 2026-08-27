import { now } from '../utils/text.js';
import { WorldEntry } from './types.js';
import { normalizeWorldEntry } from './world-entry-quality.js';
import type { NovelPaths } from './novel-paths.js';
import { readJson, writeJson } from './fs-helpers.js';

/**
 * 获取小说的所有世界观条目
 */
export async function getWorldEntries(
  paths: NovelPaths,
  novelId: string,
): Promise<WorldEntry[]> {
  const raw = await readJson<unknown[]>(paths.worldPath(novelId), []);
  return raw.map(entry => WorldEntry.parse(entry));
}

/**
 * 保存世界观条目（新增或更新）
 */
export async function saveWorldEntry(
  paths: NovelPaths,
  novelId: string,
  entry: WorldEntry,
): Promise<void> {
  const entries = await getWorldEntries(paths, novelId);
  const index = entries.findIndex(e => e.id === entry.id);

  const parsed = WorldEntry.parse({
    ...entry,
    updatedAt: now(),
  });
  const validated = normalizeWorldEntry(parsed);

  if (index >= 0) {
    entries[index] = validated;
  } else {
    entries.push(validated);
  }

  await writeJson(paths.worldPath(novelId), entries);
}

/**
 * 删除世界观条目
 */
export async function deleteWorldEntry(
  paths: NovelPaths,
  novelId: string,
  entryId: string,
): Promise<void> {
  const entries = await getWorldEntries(paths, novelId);
  const filtered = entries.filter(e => e.id !== entryId);

  if (filtered.length === entries.length) {
    throw new Error(`世界观条目不存在: ${entryId}`);
  }

  await writeJson(paths.worldPath(novelId), filtered);
}
