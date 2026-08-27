import type { Response } from 'express';
import type { NovelAgent } from '../../../../agents/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterProfile, NovelMetadata } from '../../../../novel/types.js';
import {
  getQwen3TTSUrl,
  getTTSEngineType,
} from '../../../../tts/engine-factory.js';
import type { EnsureNovelAccess, RequireAdminForServerTTS } from './route-support.js';

export type TTSDesignRouteDeps = {
  ensureNovelAccess: EnsureNovelAccess;
  modelClient?: ModelClient;
  novelManager: NovelManager;
  requireAdminForServerTTS: RequireAdminForServerTTS;
  voiceDesignerAgent?: NovelAgent;
};

type VoiceDesignAgentContext = {
  novelId: string;
  novel: NovelMetadata;
  targets: CharacterProfile[];
  modelClient: ModelClient;
  voiceDesignerAgent: NovelAgent;
};

type VoiceDesignResultItem = {
  characterId: string;
  characterName?: string;
  voiceInstruct: string;
};

export function parseDesignResult<T>(rawContent: string): T | null {
  try {
    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

export function ensureQwen3DesignEngine(res: Response, message: string): boolean {
  const engineType = getTTSEngineType();
  if (engineType === 'qwen3-tts') {
    return true;
  }
  res.status(400).json({ error: message });
  return false;
}

export function ensureVoiceDesignerReady(
  res: Response,
  deps: Pick<TTSDesignRouteDeps, 'modelClient' | 'voiceDesignerAgent'>,
): deps is { modelClient: ModelClient; voiceDesignerAgent: NovelAgent } {
  if (deps.modelClient && deps.voiceDesignerAgent) {
    return true;
  }
  res.status(503).json({ error: 'AI 模型或音效师 Agent 未就绪' });
  return false;
}

function buildVoiceDesignInput(targets: CharacterProfile[], novel: NovelMetadata) {
  return {
    novelTitle: novel.title,
    novelGenre: novel.genre,
    novelSynopsis: novel.synopsis,
    characters: targets.map(character => ({
      id: character.id,
      name: character.name,
      aliases: character.aliases,
      role: character.role,
      gender: character.gender,
      age: character.age,
      appearance: character.appearance,
      personality: character.personality,
      speechStyle: character.speechStyle,
      backstory: character.backstory,
    })),
  };
}

export async function executeVoiceDesigner(params: VoiceDesignAgentContext): Promise<VoiceDesignResultItem[] | null> {
  const { modelClient, novel, novelId, targets, voiceDesignerAgent } = params;
  const designInput = buildVoiceDesignInput(targets, novel);
  const agentOutput = await voiceDesignerAgent.execute(
    {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      inputText: JSON.stringify(designInput, null, 2),
    },
    modelClient,
  );

  return parseDesignResult<VoiceDesignResultItem[]>(agentOutput.content);
}

export function resolveSingleCharacterVoiceInstruct(
  results: VoiceDesignResultItem[],
  characterId: string,
): string | null {
  return results.find(item => item.characterId === characterId)?.voiceInstruct ?? null;
}

export async function requestVoiceDesignPreview(params: {
  characterId: string;
  voiceInstruct: string;
  characterName: string;
}): Promise<{ audio: string; duration: number }> {
  const qwen3Url = getQwen3TTSUrl();
  const designPreviewText = `我是${params.characterName}，很高兴认识你。`;
  const designResp = await fetch(`${qwen3Url}/voice-design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruct: params.voiceInstruct,
      text: designPreviewText,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!designResp.ok) {
    const errText = await designResp.text();
    throw new Error(`VoiceDesign 失败: ${errText}`);
  }

  const designData = await designResp.json() as { audio: string; duration: number };
  return designData;
}

export async function requestVoiceClonePrompt(params: {
  characterId: string;
  previewAudio: string;
  previewText: string;
}): Promise<{ prompt_id: string; prompt_data: string }> {
  const qwen3Url = getQwen3TTSUrl();
  const cloneResp = await fetch(`${qwen3Url}/voice-clone-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_audio: params.previewAudio,
      ref_text: params.previewText,
      prompt_id: params.characterId,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!cloneResp.ok) {
    const errText = await cloneResp.text();
    throw new Error(`创建 clone prompt 失败: ${errText}`);
  }

  return cloneResp.json() as Promise<{ prompt_id: string; prompt_data: string }>;
}

export async function requestDesignedVoicePreview(params: {
  text: string;
  promptData: string;
  promptId?: string;
}): Promise<{ audio: string; duration: number }> {
  const qwen3Url = getQwen3TTSUrl();
  const synthResp = await fetch(`${qwen3Url}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: params.text,
      prompt_data: params.promptData,
      prompt_id: params.promptId,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!synthResp.ok) {
    const errText = await synthResp.text();
    throw new Error(`合成失败: ${errText}`);
  }

  return synthResp.json() as Promise<{ audio: string; duration: number }>;
}
