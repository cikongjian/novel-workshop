import { CharacterDNAExtractorAgent } from '../agents/character-dna-extractor.js';
import type { ModelClient } from '../models/types.js';
import { CharacterDNAStore } from './comic-dna-store.js';
import type { CharacterDNA } from './comic-dna-types.js';

export interface GenerateDNAParams {
  char: {
    id: string;
    name: string;
    gender?: string;
    age?: string | number;
    role?: string;
    appearance?: string;
    personality?: string;
    portraitPrompt?: string;
  };
  model: ModelClient;
  novel: {
    id: string;
    genre?: string;
    title: string;
    synopsis?: string;
  };
}

/**
 * 从角色档案生成结构化视觉 DNA 并持久化。
 * 供立绘生成后自动触发，以及独立 DNA 生成 API 复用。
 */
export async function generateAndSaveDNA(params: GenerateDNAParams): Promise<CharacterDNA> {
  const dnaStore = new CharacterDNAStore();
  const dnaAgent = new CharacterDNAExtractorAgent();

  const characterContext = [
    `姓名：${params.char.name}`,
    `性别：${params.char.gender || '未指定'}`,
    `年龄：${params.char.age || '未指定'}`,
    `角色定位：${params.char.role || '未指定'}`,
    `外观描述：${params.char.appearance || '未指定'}`,
    `性格：${params.char.personality || '未指定'}`,
    `已有立绘 prompt（参考）：${params.char.portraitPrompt || '无'}`,
  ].join('\n');

  const agentContext = {
    novelId: params.novel.id,
    genre: params.novel.genre ?? '',
    novelTitle: params.novel.title,
    novelSynopsis: params.novel.synopsis ?? '',
    characterContext,
  };

  const output = await dnaAgent.execute(agentContext, params.model);

  const cleaned =
    output.content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ??
    output.content.slice(output.content.indexOf('{'), output.content.lastIndexOf('}') + 1).trim();

  const parsed = JSON.parse(cleaned) as Omit<CharacterDNA, 'characterId' | 'novelId' | 'name' | 'generatedAt' | 'version'>;
  const { id, name } = params.char;
  const { id: novelId } = params.novel;
  const existing = await dnaStore.get(novelId, id);

  const dna: CharacterDNA = {
    ...parsed,
    characterId: id,
    novelId,
    name,
    gender: parsed.gender || params.char.gender || '未指定',
    generatedAt: new Date().toISOString(),
    version: (existing?.version ?? 0) + 1,
  };

  await dnaStore.write(novelId, id, dna);
  return dna;
}
