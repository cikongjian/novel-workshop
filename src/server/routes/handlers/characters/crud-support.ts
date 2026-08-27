import { v4 as uuidv4 } from 'uuid';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { CharacterProfile } from '../../../../novel/types.js';

export type CharacterCrudInput = {
  name?: string;
  aliases?: string[];
  role?: CharacterProfile['role'];
  position?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  personality?: string;
  personalityTraits?: string[];
  speechStyle?: string;
  speechExamples?: string[];
  backstory?: string;
  motivation?: string;
  abilities?: string[];
  relationships?: CharacterProfile['relationships'];
  ttsVoice?: string;
  voiceInstruct?: string;
  voiceRefAudioPath?: string;
  voiceClonePromptId?: string;
  voiceClonePromptData?: string;
  voiceDesignStatus?: CharacterProfile['voiceDesignStatus'];
  drives?: {
    want?: string;
    need?: string;
    fear?: string;
    secret?: string;
    taboo?: string[];
  };
  personalityModel?: {
    traits?: string[];
    innerContradictions?: string[];
    moralBoundary?: string[];
  };
  speechDNA?: {
    lexicon?: string[];
    tempo?: 'slow' | 'mid' | 'fast';
    tone?: string[];
    tics?: string[];
  };
  ttsProfile?: {
    baseVoice?: string;
    prosodyRange?: {
      rate?: [number, number];
      pitch?: [number, number];
    };
    emotionMap?: Record<string, string>;
  };
  arc?: string;
  currentState?: string;
  firstAppearance?: number;
  tags?: string[];
  mailboxEnabled?: boolean;
};

type CharacterV2Fields = {
  drives: NonNullable<CharacterProfile['drives']>;
  personalityModel: NonNullable<CharacterProfile['personalityModel']>;
  speechDNA: NonNullable<CharacterProfile['speechDNA']>;
  ttsProfile: NonNullable<CharacterProfile['ttsProfile']>;
};

function inferTempoFromSpeechStyle(style?: string): 'slow' | 'mid' | 'fast' {
  const text = (style ?? '').toLowerCase();
  if (text.includes('急') || text.includes('快') || text.includes('激动')) return 'fast';
  if (text.includes('慢') || text.includes('缓') || text.includes('沉稳')) return 'slow';
  return 'mid';
}

export function buildCharacterV2Fields(data: CharacterCrudInput): CharacterV2Fields {
  return {
    drives: {
      want: data.drives?.want ?? data.motivation ?? '',
      need: data.drives?.need ?? '',
      fear: data.drives?.fear,
      secret: data.drives?.secret,
      taboo: data.drives?.taboo ?? [],
    },
    personalityModel: {
      traits: data.personalityModel?.traits ?? data.personalityTraits ?? [],
      innerContradictions: data.personalityModel?.innerContradictions ?? [],
      moralBoundary: data.personalityModel?.moralBoundary ?? [],
    },
    speechDNA: {
      lexicon: data.speechDNA?.lexicon ?? [],
      tempo: data.speechDNA?.tempo ?? inferTempoFromSpeechStyle(data.speechStyle),
      tone: data.speechDNA?.tone ?? (data.speechStyle ? [data.speechStyle] : []),
      tics: data.speechDNA?.tics ?? [],
    },
    ttsProfile: {
      baseVoice: data.ttsProfile?.baseVoice ?? data.ttsVoice ?? 'default',
      prosodyRange: {
        rate: data.ttsProfile?.prosodyRange?.rate ?? [0.9, 1.1],
        pitch: data.ttsProfile?.prosodyRange?.pitch ?? [-2, 2],
      },
      emotionMap: data.ttsProfile?.emotionMap ?? {},
    },
  };
}

export function buildCreatedCharacter(params: {
  data: CharacterCrudInput & { name: string; role: CharacterProfile['role'] };
  now?: string;
}): CharacterProfile {
  const timestamp = params.now ?? new Date().toISOString();
  return {
    id: uuidv4(),
    name: params.data.name,
    aliases: params.data.aliases ?? [],
    role: params.data.role,
    position: params.data.position ?? '',
    age: params.data.age,
    gender: params.data.gender,
    appearance: params.data.appearance ?? '',
    personality: params.data.personality ?? '',
    personalityTraits: params.data.personalityTraits ?? [],
    speechStyle: params.data.speechStyle ?? '',
    speechExamples: params.data.speechExamples ?? [],
    backstory: params.data.backstory ?? '',
    motivation: params.data.motivation ?? '',
    abilities: params.data.abilities ?? [],
    relationships: params.data.relationships ?? [],
    arc: params.data.arc ?? '',
    currentState: params.data.currentState ?? '',
    firstAppearance: params.data.firstAppearance,
    ...buildCharacterV2Fields(params.data),
    ttsVoice: params.data.ttsVoice,
    voiceInstruct: params.data.voiceInstruct,
    voiceRefAudioPath: params.data.voiceRefAudioPath,
    voiceClonePromptId: params.data.voiceClonePromptId,
    voiceClonePromptData: params.data.voiceClonePromptData,
    tags: params.data.tags ?? [],
    voiceDesignStatus: params.data.voiceDesignStatus ?? 'none',
    mailboxEnabled: params.data.mailboxEnabled ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildUpdatedCharacter(params: {
  existing: CharacterProfile;
  patch: CharacterCrudInput;
  now?: string;
}): CharacterProfile {
  const mergedForV2 = { ...params.existing, ...params.patch };
  return {
    ...params.existing,
    ...params.patch,
    ...buildCharacterV2Fields(mergedForV2),
    id: params.existing.id,
    createdAt: params.existing.createdAt,
    updatedAt: params.now ?? new Date().toISOString(),
  };
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

export function buildDeprecatedCharacterRouteMessage(
  kind: 'state-history' | 'consistency-report',
): { error: string } {
  return {
    error: kind === 'state-history'
      ? '角色状态历史接口已废弃，当前系统未使用该公开入口'
      : '角色一致性报告接口已废弃，当前系统未使用该公开入口',
  };
}

export function isNotFoundLikeError(message: string): boolean {
  return message.includes('不存在') || message.includes('not found');
}
