import { http } from './http';

export type CharacterCardCollection = {
  userId: string;
  characterId: string;
  novelId: string;
  characterName: string;
  collectedAt: string;
};

export async function fetchMyCharacterCardCollections(): Promise<CharacterCardCollection[]> {
  const { data } = await http.get<{ collections?: CharacterCardCollection[] }>('/character-cards/my');
  return data.collections ?? [];
}

export async function fetchCharacterCardCollected(characterId: string): Promise<boolean> {
  const { data } = await http.get<{ collected?: boolean }>(`/character-cards/${characterId}/collected`);
  return Boolean(data.collected);
}

export type ToggleCharacterCardCollectResult = {
  collected: boolean;
};

export async function toggleCharacterCardCollect(params: {
  characterId: string;
  novelId: string;
  characterName: string;
}): Promise<ToggleCharacterCardCollectResult> {
  const { data } = await http.post<{ collected?: boolean }>(`/character-cards/${params.characterId}/collect`, {
    novelId: params.novelId,
    characterName: params.characterName,
  });
  return { collected: Boolean(data.collected) };
}
