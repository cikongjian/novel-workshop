import type { CharacterProfile, NovelMetadata, WorldEntry } from '../../novel/types.js';
import { buildSettingBaseline } from './baseline-snapshot.js';
import { loadSettingBaseline, saveSettingBaseline } from './baseline-store.js';
import type { SettingBaseline } from './types.js';

export function buildWorldBibleSettingBaseline(params: {
  existing: SettingBaseline | null;
  novel: Pick<NovelMetadata, 'id' | 'genre' | 'title' | 'synopsis' | 'tags'>;
  worldEntries: WorldEntry[];
  characters: CharacterProfile[];
  summary: string;
  timestamp?: string;
}): SettingBaseline {
  const approvedEntries = params.worldEntries.filter(
    entry => entry.baseline === true || entry.tags.includes('approved'),
  );
  const fresh = buildSettingBaseline({
    novel: params.novel,
    worldEntries: approvedEntries,
    characters: params.characters,
    fromChapters: '世界圣经确认结果',
  });
  const timestamp = params.timestamp ?? new Date().toISOString();
  const existing = params.existing;

  return {
    ...fresh,
    createdAt: existing?.createdAt ?? fresh.createdAt,
    confirmedAt: existing?.confirmedAt ?? timestamp,
    frozenAtChapter: existing?.frozenAtChapter,
    status: 'confirmed',
    powerSystems: fresh.powerSystems,
    worldFrame: {
      summary: params.summary.trim() || existing?.worldFrame.summary || fresh.worldFrame.summary,
      factions: fresh.worldFrame.factions,
    },
    characterCores: existing?.characterCores.length
      ? existing.characterCores
      : fresh.characterCores,
    canonicalWorldEntries: fresh.canonicalWorldEntries,
    promises: existing?.promises.length ? existing.promises : fresh.promises,
    antiDriftClause: existing?.antiDriftClause || fresh.antiDriftClause,
    forbiddenDirections: existing?.forbiddenDirections.length
      ? existing.forbiddenDirections
      : fresh.forbiddenDirections,
    sourceSummary: '由作者确认的世界圣经同步生成；保留既有角色核心与剧情承诺',
  };
}

export async function syncWorldBibleSettingBaseline(params: {
  novelsDir: string;
  novel: Pick<NovelMetadata, 'id' | 'genre' | 'title' | 'synopsis' | 'tags'>;
  worldEntries: WorldEntry[];
  characters: CharacterProfile[];
  summary: string;
}): Promise<SettingBaseline> {
  const existing = await loadSettingBaseline(params.novelsDir, params.novel.id);
  const baseline = buildWorldBibleSettingBaseline({ ...params, existing });
  await saveSettingBaseline(params.novelsDir, baseline);
  return baseline;
}
