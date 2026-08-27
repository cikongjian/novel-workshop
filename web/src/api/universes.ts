import { http } from './http';
import type { NovelGenre, NovelMetadata, UniverseMetadata, UniverseRelationType } from '../types';

export async function fetchUniverseList(): Promise<UniverseMetadata[]> {
  const { data } = await http.get<UniverseMetadata[]>('/universes');
  return data;
}

export async function fetchUniverse(universeId: string): Promise<UniverseMetadata> {
  const { data } = await http.get<UniverseMetadata>(`/universes/${universeId}`);
  return data;
}

export async function fetchUniverseByNovel(novelId: string): Promise<UniverseMetadata> {
  const { data } = await http.get<UniverseMetadata>(`/universes/novel/${novelId}`);
  return data;
}

export async function syncUniverseFromSeries(seriesId: string): Promise<{
  mode: 'created' | 'updated';
  universe: UniverseMetadata;
}> {
  const { data } = await http.post<{ mode: 'created' | 'updated'; universe: UniverseMetadata }>(
    `/universes/from-series/${seriesId}`,
  );
  return data;
}

export async function createUniverse(params: {
  title: string;
  description?: string;
  corePremise?: string;
  sharedWorldRules?: string;
  timelineBaseline?: string;
}): Promise<UniverseMetadata> {
  const { data } = await http.post<UniverseMetadata>('/universes', params);
  return data;
}

export async function updateUniverse(
  universeId: string,
  updates: {
    title?: string;
    description?: string;
    corePremise?: string;
    sharedWorldRules?: string;
    timelineBaseline?: string;
  },
): Promise<UniverseMetadata> {
  const { data } = await http.put<UniverseMetadata>(`/universes/${universeId}`, updates);
  return data;
}

export async function addNovelToUniverse(
  universeId: string,
  params: { novelId: string; notes?: string },
): Promise<UniverseMetadata> {
  const { data } = await http.post<UniverseMetadata>(`/universes/${universeId}/novels`, params);
  return data;
}

export async function removeNovelFromUniverse(universeId: string, novelId: string): Promise<UniverseMetadata> {
  const { data } = await http.delete<UniverseMetadata>(`/universes/${universeId}/novels/${novelId}`);
  return data;
}

export async function createUniverseRelation(
  universeId: string,
  params: {
    fromNovelId: string;
    toNovelId: string;
    type: UniverseRelationType;
    anchorChapterNumber?: number;
    timelineSpan?: string;
    spoilerCeiling?: string;
    inheritWorld?: boolean;
    inheritCharacters?: boolean;
    inheritForeshadowing?: boolean;
    notes?: string;
  },
): Promise<UniverseMetadata> {
  const { data } = await http.post<UniverseMetadata>(`/universes/${universeId}/relations`, params);
  return data;
}

export async function updateUniverseRelation(
  universeId: string,
  relationId: string,
  updates: {
    type?: UniverseRelationType;
    anchorChapterNumber?: number;
    timelineSpan?: string;
    spoilerCeiling?: string;
    inheritWorld?: boolean;
    inheritCharacters?: boolean;
    inheritForeshadowing?: boolean;
    notes?: string;
  },
): Promise<UniverseMetadata> {
  const { data } = await http.put<UniverseMetadata>(`/universes/${universeId}/relations/${relationId}`, updates);
  return data;
}

export async function deleteUniverseRelation(universeId: string, relationId: string): Promise<UniverseMetadata> {
  const { data } = await http.delete<UniverseMetadata>(`/universes/${universeId}/relations/${relationId}`);
  return data;
}

export async function createRelatedUniverseWork(
  universeId: string,
  params: {
    title: string;
    genre: NovelGenre;
    synopsis?: string;
    description?: string;
    constitutionTags?: string[];
    sourceNovelId: string;
    relationType: UniverseRelationType;
    anchorChapterNumber?: number;
    timelineSpan?: string;
    spoilerCeiling?: string;
    inheritWorld?: boolean;
    inheritCharacters?: boolean;
    inheritForeshadowing?: boolean;
    relationNotes?: string;
  },
): Promise<{ universe: UniverseMetadata; novel: NovelMetadata }> {
  const { data } = await http.post<{ universe: UniverseMetadata; novel: NovelMetadata }>(
    `/universes/${universeId}/works`,
    params,
  );
  return data;
}
