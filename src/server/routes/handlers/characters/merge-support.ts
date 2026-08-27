import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterProfile } from '../../../../novel/types.js';

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = normalizeNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export async function tryIndexCharacter(
  novelMemory: NovelMemory | undefined,
  novelId: string,
  character: CharacterProfile,
): Promise<void> {
  if (!novelMemory) return;
  try {
    await novelMemory.indexCharacter(novelId, character);
  } catch {
    // 记忆索引失败不影响主流程
  }
}

export async function mergeCharacterPair(params: {
  novelId: string;
  novelManager: Pick<NovelManager, 'getCharacters' | 'saveCharacter' | 'deleteCharacter'>;
  novelMemory?: NovelMemory;
  sourceCharacterId: string;
  targetCharacterId: string;
}): Promise<{
  sourceCharacter: CharacterProfile;
  targetCharacter: CharacterProfile;
  updatedTarget: CharacterProfile;
  mergedAliases: string[];
}> {
  if (params.sourceCharacterId === params.targetCharacterId) {
    throw new Error('源角色和目标角色不能相同');
  }

  const characters = await params.novelManager.getCharacters(params.novelId);
  const sourceCharacter = characters.find((character) => character.id === params.sourceCharacterId);
  const targetCharacter = characters.find((character) => character.id === params.targetCharacterId);

  if (!sourceCharacter) {
    throw new Error('源角色不存在');
  }
  if (!targetCharacter) {
    throw new Error('目标角色不存在');
  }

  const mergedAliases = dedupeNames([
    ...targetCharacter.aliases,
    ...sourceCharacter.aliases,
    sourceCharacter.name,
  ]);
  const updatedTarget: CharacterProfile = {
    ...targetCharacter,
    aliases: mergedAliases,
    updatedAt: new Date().toISOString(),
  };
  await params.novelManager.saveCharacter(params.novelId, updatedTarget);

  for (const character of characters) {
    if (character.id === params.sourceCharacterId || character.id === params.targetCharacterId) continue;
    const updatedRelationships = character.relationships.map((relationship) => (
      relationship.targetId === params.sourceCharacterId
        ? { ...relationship, targetId: params.targetCharacterId }
        : relationship
    ));
    if (updatedRelationships.some((relationship, index) => relationship.targetId !== character.relationships[index]?.targetId)) {
      await params.novelManager.saveCharacter(params.novelId, {
        ...character,
        relationships: updatedRelationships,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await params.novelManager.deleteCharacter(params.novelId, params.sourceCharacterId);
  await tryIndexCharacter(params.novelMemory, params.novelId, updatedTarget);

  return {
    sourceCharacter,
    targetCharacter,
    updatedTarget,
    mergedAliases,
  };
}

export async function batchMergeCharacterGroups(params: {
  novelId: string;
  novelManager: Pick<NovelManager, 'getCharacters' | 'saveCharacter' | 'deleteCharacter'>;
  novelMemory?: NovelMemory;
  groups: Array<{ ids: string[]; names: string[] }>;
}): Promise<Array<{ targetName: string; mergedNames: string[] }>> {
  const characters = await params.novelManager.getCharacters(params.novelId);
  const results: Array<{ targetName: string; mergedNames: string[] }> = [];
  const deletedIds = new Set<string>();

  for (const group of params.groups) {
    if (group.ids.length < 2) continue;

    const [targetId, ...sourceIds] = group.ids;
    const validSourceIds = sourceIds.filter((id) => !deletedIds.has(id));
    if (!validSourceIds.length) continue;

    const targetCharacter = characters.find((character) => character.id === targetId);
    if (!targetCharacter || deletedIds.has(targetId)) continue;

    const mergedNames: string[] = [];
    for (const sourceId of validSourceIds) {
      const sourceCharacter = characters.find((character) => character.id === sourceId);
      if (!sourceCharacter) continue;

      targetCharacter.aliases = dedupeNames([
        ...targetCharacter.aliases,
        ...sourceCharacter.aliases,
        sourceCharacter.name,
      ]);

      for (const character of characters) {
        if (character.id === sourceId || character.id === targetId || deletedIds.has(character.id)) continue;
        let changed = false;
        for (const relationship of character.relationships) {
          if (relationship.targetId === sourceId) {
            relationship.targetId = targetId;
            changed = true;
          }
        }
        if (changed) {
          character.updatedAt = new Date().toISOString();
          await params.novelManager.saveCharacter(params.novelId, character);
        }
      }

      await params.novelManager.deleteCharacter(params.novelId, sourceId);
      deletedIds.add(sourceId);
      mergedNames.push(sourceCharacter.name);
    }

    targetCharacter.updatedAt = new Date().toISOString();
    await params.novelManager.saveCharacter(params.novelId, targetCharacter);
    await tryIndexCharacter(params.novelMemory, params.novelId, targetCharacter);
    results.push({
      targetName: targetCharacter.name,
      mergedNames,
    });
  }

  return results;
}

export function buildDuplicateCharacterPrompt(characters: CharacterProfile[]): string {
  const characterSummaries = characters.map((character) => ({
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    role: character.role,
    gender: character.gender || '',
    appearance: character.appearance?.slice(0, 100) || '',
    personality: character.personality?.slice(0, 100) || '',
  }));

  return [
    '你是一个小说角色分析专家。请分析以下角色列表，找出可能是同一个人的角色组。',
    '判断依据：名字相似（谐音、别名、简称）、外貌描述一致、性格描述一致、角色定位相同等。',
    '',
    '角色列表：',
    JSON.stringify(characterSummaries, null, 2),
    '',
    '请以 JSON 数组格式返回疑似相同的角色组，每组包含 ids（角色ID数组）、names（角色名数组）、reason（判断理由）。',
    '如果没有发现疑似相同的角色，返回空数组 []。',
    '只返回 JSON，不要其他内容。示例：',
    '[{"ids":["id1","id2"],"names":["张三","小三"],"reason":"名字为简称关系，外貌描述一致"}]',
  ].join('\n');
}

export async function detectDuplicateCharacterGroups(params: {
  modelClient: Pick<ModelClient, 'chat'>;
  characters: CharacterProfile[];
}): Promise<unknown[]> {
  if (params.characters.length < 2) {
    return [];
  }

  const response = await params.modelClient.chat([
    { role: 'user', content: buildDuplicateCharacterPrompt(params.characters) },
  ], { temperature: 0.3, maxTokens: 4096 });

  const text = response.content.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}
