import type { Request } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type {
  CharacterProfile,
  NovelMetadata,
  OutlineData,
} from '../../../../novel/types.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  COVER_PROMPT_SYSTEM,
  DEFAULT_COVER_SIZE,
  buildDefaultNegativePrompt,
  type CoverPromptPayload,
} from './prompt-types.js';
import {
  buildCoverContextSummary,
  buildCoverPromptUserMessage,
  buildTemplateCoverPrompt,
} from './prompt-template.js';
import type { CoverStyleOverrides } from './cover-style-options.js';
import {
  buildCoverPromptErrorDiagnostic,
  type CoverPromptDiagnostics,
} from './prompt-diagnostics.js';

export function buildCoverPromptSystem(generateText?: boolean): string {
  if (!generateText) {
    return COVER_PROMPT_SYSTEM;
  }
  // 当 AI 生成文字时：不再要求中文描述（允许多语言），允许在画面中渲染标题
  return COVER_PROMPT_SYSTEM
    .replace('- 全部使用中文描述，不要混入任何英文单词\n', '- 中文或原语言描述（允许标题/作者文字渲染在画面中）\n')
    .replace(
      '上方三分之一留出标题安全区\n',
      '将准确的标题和作者名字以风格化排版渲染在画面构图中\n',
    )
    .replace('、logo', '');
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('封面提示词返回格式无效');
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

export async function generateCoverPromptWithAI(
  modelClient: ModelClient,
  novel: NovelMetadata,
  characters: CharacterProfile[],
  outline?: OutlineData,
  generateText?: boolean,
  authorName?: string,
  overrides?: CoverStyleOverrides,
): Promise<CoverPromptPayload> {
  const result = await modelClient.chat([
    { role: 'system', content: buildCoverPromptSystem(generateText) },
    { role: 'user', content: buildCoverPromptUserMessage(novel, characters, outline, generateText, authorName, overrides) },
  ], { temperature: 0.7, maxTokens: 1200 });

  const parsed = JSON.parse(extractJsonObject(result.content)) as {
    positivePrompt?: string;
    negativePrompt?: string;
  };
  const positivePrompt = parsed.positivePrompt?.trim();
  const negativePrompt = parsed.negativePrompt?.trim() || buildDefaultNegativePrompt(generateText).join(', ');
  if (!positivePrompt) {
    throw new Error('封面提示词为空');
  }

  return {
    positivePrompt,
    negativePrompt,
    promptSource: 'ai',
    contextSummary: buildCoverContextSummary(novel, characters, outline),
    recommendedSize: DEFAULT_COVER_SIZE,
  };
}

type ResolveCoverPromptParams = {
  authDb?: AuthDb;
  characters: CharacterProfile[];
  modelClient?: ModelClient;
  novel: NovelMetadata;
  outline?: OutlineData;
  req: Request;
  generateText?: boolean;
  authorName?: string;
  overrides?: CoverStyleOverrides;
};

export type CoverPromptResolution = {
  payload: CoverPromptPayload;
  diagnostics: CoverPromptDiagnostics;
};

export async function resolveCoverPromptPayloadWithDiagnostics(
  params: ResolveCoverPromptParams,
): Promise<CoverPromptResolution> {
  const modelAccess = await resolveUserModelAccess({
    authDb: params.authDb,
    userId: params.req.auth?.id,
    headers: params.req.headers,
    novel: params.novel,
  });
  if (modelAccess.error && params.novel.modelConfig?.source === 'user-profile') {
    const error = new Error(modelAccess.error) as Error & { code?: string; statusCode?: number };
    error.code = 'USER_API_UNAVAILABLE';
    error.statusCode = 400;
    throw error;
  }
  const activeModelClient = modelAccess.client ?? params.modelClient;
  const modelDiagnostic = {
    source: modelAccess.source,
    clientAvailable: Boolean(activeModelClient),
    provider: modelAccess.provider ?? activeModelClient?.provider,
    model: modelAccess.model ?? activeModelClient?.model,
    profileId: modelAccess.profileId,
    storageMode: modelAccess.profileStorageMode,
  };
  if (!activeModelClient) {
    return {
      payload: buildTemplateCoverPrompt(
        params.novel,
        params.characters,
        params.outline,
        params.generateText,
        params.authorName,
        params.overrides,
      ),
      diagnostics: {
        modelAccess: modelDiagnostic,
        aiAttempt: { outcome: 'template-no-client', elapsedMs: 0 },
      },
    };
  }

  const startedAt = Date.now();
  try {
    const payload = await generateCoverPromptWithAI(
      activeModelClient,
      params.novel,
      params.characters,
      params.outline,
      params.generateText,
      params.authorName,
      params.overrides,
    );
    return {
      payload,
      diagnostics: {
        modelAccess: modelDiagnostic,
        aiAttempt: { outcome: 'ai', elapsedMs: Date.now() - startedAt },
      },
    };
  } catch (error) {
    return {
      payload: buildTemplateCoverPrompt(
        params.novel,
        params.characters,
        params.outline,
        params.generateText,
        params.authorName,
        params.overrides,
      ),
      diagnostics: {
        modelAccess: modelDiagnostic,
        aiAttempt: {
          outcome: 'template-fallback',
          elapsedMs: Date.now() - startedAt,
          error: buildCoverPromptErrorDiagnostic(error),
        },
      },
    };
  }
}

export async function resolveCoverPromptPayload(
  params: ResolveCoverPromptParams,
): Promise<CoverPromptPayload> {
  return (await resolveCoverPromptPayloadWithDiagnostics(params)).payload;
}
