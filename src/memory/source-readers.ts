import fs from 'node:fs';
import path from 'node:path';
import type { FactGraph } from '../novel/fact-graph-types.js';
import { collectFactGraphChapterNumbers } from '../novel/fact-graph-coverage.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';

export { collectFactGraphChapterNumbers as collectFactChapterNumbers } from '../novel/fact-graph-coverage.js';

export function resolveNovelContentDir(novelsDir: string, novelId: string): string {
  return resolveNovelStorageDir(novelsDir, novelId);
}

export function readJsonIds(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (item && typeof item === 'object' ? String((item as { id?: unknown }).id ?? '').trim() : ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function readChapterNumbers(contentDir: string): number[] {
  const chaptersDir = path.join(contentDir, 'chapters');
  if (!fs.existsSync(chaptersDir)) return [];
  try {
    const chapterNumbers = fs.readdirSync(chaptersDir)
      .filter(name => name.endsWith('.md'))
      .map(name => Number.parseInt(path.parse(name).name, 10))
      .filter(num => Number.isFinite(num) && num > 0)
      .sort((a, b) => a - b);
    return chapterNumbers;
  } catch {
    return [];
  }
}

export function readJsonArray(filePath: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  } catch {
    return [];
  }
}

export function readFactChapterNumbers(contentDir: string): number[] {
  const factGraphPath = path.join(contentDir, 'fact-graph.json');
  if (!fs.existsSync(factGraphPath)) return [];
  try {
    const raw = fs.readFileSync(factGraphPath, 'utf-8');
    const parsed = JSON.parse(raw) as FactGraph;
    if (!parsed || typeof parsed !== 'object') return [];
    return collectFactGraphChapterNumbers(parsed);
  } catch {
    return [];
  }
}

export function buildThreadEntityId(snapshot: { threadId: string; chapterNumber: number }): string {
  return `${snapshot.threadId}:${snapshot.chapterNumber}`;
}

export function readCharacterStateEntityIds(contentDir: string): string[] {
  const snapshots = readJsonArray(path.join(contentDir, 'character-states.json'));
  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    const characterId = String(snapshot.characterId ?? '').trim();
    const chapterNumber = Number(snapshot.chapterNumber ?? 0);
    if (!characterId || !Number.isFinite(chapterNumber) || chapterNumber <= 0) continue;
    ids.add(`${characterId}:ch${chapterNumber}`);
  }
  return [...ids];
}

export function readPlotThreadEntityIds(contentDir: string): string[] {
  const snapshots = readJsonArray(path.join(contentDir, 'plot-thread-snapshots.json'));
  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    const threadId = String(snapshot.threadId ?? '').trim();
    const chapterNumber = Number(snapshot.chapterNumber ?? 0);
    if (!threadId || !Number.isFinite(chapterNumber) || chapterNumber <= 0) continue;
    ids.add(buildThreadEntityId({ threadId, chapterNumber }));
  }
  return [...ids];
}
