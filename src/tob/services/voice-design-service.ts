import type { Logger } from '../../utils/logger.js';
import type { CharacterProfile } from '../../novel/types.js';
import type { ModelClient } from '../../models/types.js';
import type { VoiceDesignerAgent } from '../../agents/voice-designer.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { recordAiUsage } from '../../ai/usage-recorder.js';

const VOICE_DESIGN_TIMEOUT_MS = 180_000;
const VOICE_CLONE_TIMEOUT_MS = 30_000;

async function recordQwen3DirectTtsUsage(params: {
  model: 'voice-design' | 'voice-clone-prompt';
  promptText: string;
  outputChars?: number;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    await recordAiUsage({
      usageKind: 'tts',
      provider: 'qwen3-tts',
      model: params.model,
      requestCount: 1,
      promptChars: params.promptText.length,
      outputChars: Math.max(0, params.outputChars ?? 0),
      metadata: params.metadata,
    });
  } catch (err) {
    console.warn('[ToB voice-design] usage recording failed:', err instanceof Error ? err.message : String(err));
  }
}

interface VoiceDesignOptions {
  novelId: string;
  novelTitle: string;
  novelGenre: string;
  novelSynopsis: string;
  characters: CharacterProfile[];
  modelClient: ModelClient;
  voiceDesignerAgent: VoiceDesignerAgent;
  novelManager: NovelManager;
  qwen3TtsUrl: string;
  logger: Logger;
  onProgress?: (current: number, total: number, characterName: string) => void;
}

interface VoiceDesignResult {
  designed: string[];
  skipped: string[];
  failed: Array<{ characterId: string; characterName: string; error: string }>;
}

export class VoiceDesignService {
  async ensureCharacterVoicesDesigned(options: VoiceDesignOptions): Promise<VoiceDesignResult> {
    const {
      novelId,
      novelTitle,
      novelGenre,
      novelSynopsis,
      characters,
      modelClient,
      voiceDesignerAgent,
      novelManager,
      qwen3TtsUrl,
      logger,
      onProgress,
    } = options;

    const designed: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ characterId: string; characterName: string; error: string }> = [];

    const needsDesign = characters.filter(c => c.voiceDesignStatus !== 'cloned');
    const alreadyDesigned = characters.filter(c => c.voiceDesignStatus === 'cloned');

    logger.info('Voice design check', {
      total: characters.length,
      needsDesign: needsDesign.length,
      alreadyDesigned: alreadyDesigned.length,
    });

    skipped.push(...alreadyDesigned.map(c => c.id));

    for (let i = 0; i < needsDesign.length; i++) {
      const character = needsDesign[i];
      onProgress?.(i + 1, needsDesign.length, character.name);

      try {
        await this.designCharacterVoice({
          novelId,
          novelTitle,
          novelGenre,
          novelSynopsis,
          character,
          modelClient,
          voiceDesignerAgent,
          novelManager,
          qwen3TtsUrl,
          logger,
        });

        designed.push(character.id);
        logger.info('Voice design succeeded', { characterId: character.id, characterName: character.name });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failed.push({
          characterId: character.id,
          characterName: character.name,
          error: errorMessage,
        });
        logger.error('Voice design failed', {
          characterId: character.id,
          characterName: character.name,
          error: errorMessage,
        });
      }
    }

    return { designed, skipped, failed };
  }

  private async designCharacterVoice(params: {
    novelId: string;
    novelTitle: string;
    novelGenre: string;
    novelSynopsis: string;
    character: CharacterProfile;
    modelClient: ModelClient;
    voiceDesignerAgent: VoiceDesignerAgent;
    novelManager: NovelManager;
    qwen3TtsUrl: string;
    logger: Logger;
  }): Promise<void> {
    const {
      novelId,
      novelTitle,
      novelGenre,
      novelSynopsis,
      character,
      modelClient,
      voiceDesignerAgent,
      novelManager,
      qwen3TtsUrl,
      logger,
    } = params;

    let voiceInstruct = character.voiceInstruct;

    if (!voiceInstruct) {
      logger.info('Generating voiceInstruct', { characterName: character.name });

      const designInput = {
        novelTitle,
        novelGenre,
        novelSynopsis,
        characters: [{
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
        }],
      };

      const agentOutput = await voiceDesignerAgent.execute(
        {
          novelId,
          genre: novelGenre,
          novelTitle,
          novelSynopsis,
          inputText: JSON.stringify(designInput, null, 2),
        },
        modelClient,
      );

      let designResults: Array<{ characterId: string; voiceInstruct: string }>;
      try {
        let jsonStr = agentOutput.content.trim();
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
        }
        designResults = JSON.parse(jsonStr);
      } catch {
        throw new Error('AI 音效师返回的数据格式异常');
      }

      const result = designResults.find(r => r.characterId === character.id);
      if (!result?.voiceInstruct) {
        throw new Error('未能生成声音描述');
      }

      voiceInstruct = result.voiceInstruct;
    }

    logger.info('Calling VoiceDesign API', {
      characterName: character.name,
      instructPreview: voiceInstruct.slice(0, 50),
    });
    const designPreviewText = `我是${character.name}，很高兴认识你。`;

    const designResp = await fetch(`${qwen3TtsUrl}/voice-design`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruct: voiceInstruct,
        text: designPreviewText,
      }),
      signal: AbortSignal.timeout(VOICE_DESIGN_TIMEOUT_MS),
    });

    if (!designResp.ok) {
      const errText = await designResp.text();
      throw new Error(`VoiceDesign 失败: ${errText}`);
    }

    const designData = await designResp.json() as {
      audio: string;
      duration: number;
    };
    await recordQwen3DirectTtsUsage({
      model: 'voice-design',
      promptText: designPreviewText,
      metadata: {
        characterId: character.id,
        hasInstruct: Boolean(voiceInstruct),
      },
    });

    logger.info('Creating voice clone prompt', { characterName: character.name });
    const cloneReferenceText = designPreviewText;

    const cloneResp = await fetch(`${qwen3TtsUrl}/voice-clone-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_audio: designData.audio,
        ref_text: cloneReferenceText,
        prompt_id: character.id,
      }),
      signal: AbortSignal.timeout(VOICE_CLONE_TIMEOUT_MS),
    });

    if (!cloneResp.ok) {
      const errText = await cloneResp.text();
      throw new Error(`创建 clone prompt 失败: ${errText}`);
    }

    const cloneData = await cloneResp.json() as {
      prompt_id: string;
      prompt_data: string;
    };
    await recordQwen3DirectTtsUsage({
      model: 'voice-clone-prompt',
      promptText: cloneReferenceText,
      outputChars: cloneData.prompt_data.length,
      metadata: {
        characterId: character.id,
        promptId: cloneData.prompt_id,
      },
    });

    character.voiceInstruct = voiceInstruct;
    character.voiceClonePromptId = cloneData.prompt_id;
    character.voiceClonePromptData = cloneData.prompt_data;
    character.voiceDesignStatus = 'cloned';
    character.updatedAt = new Date().toISOString();

    await novelManager.saveCharacter(novelId, character);

    logger.info('Voice design completed', { characterName: character.name });
  }
}
