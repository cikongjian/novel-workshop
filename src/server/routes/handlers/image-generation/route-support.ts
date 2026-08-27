import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import { getNovelsDir } from '../../../../config/index.js';
import type { ModelClient, ImageGenerationClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { resolveNovelStorageDir } from '../../../../novel/data-root.js';
import { AppError } from '../../../errors.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';
import {
  acceptsWebp,
  normalizeWidth,
  resolveOptimizedImageFile,
} from '../../../../utils/image-optimizer.js';
import { safeFetch, SAFE_FETCH_RESPONSE_LIMITS } from '../../../../utils/safe-fetch.js';
import {
  buildPortraitCharacterContext,
  buildPortraitNegativePrompt,
  buildPortraitPromptSystem,
  buildPortraitTemplatePrompt,
  composePortraitPromptBlock,
  enrichPortraitPromptWithCharacterConsistency,
  parsePortraitPromptBlock,
} from '../../portrait-prompt-template.js';
import {
  buildPortraitStyleIndex,
  getPortraitStyleOptions,
  type PortraitStyleOverrides,
} from '../../portrait-style-index.js';
import { VISUAL_STYLE_RULES } from '../../portrait-visual-style.js';
import { FORMAT_RULES } from '../../portrait-format.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';

export type ImageGenerationRouteDeps = {
  authDb?: AuthDb;
  imageClient?: ImageGenerationClient;
  modelClient?: ModelClient;
  novelManager: NovelManager;
  billingService?: import('../../../../billing/billing-service.js').BillingService;
};

const VALID_ERA_KEYS = new Set(getPortraitStyleOptions().eraOptions.map(option => option.key));
const VALID_VISUAL_STYLE_KEYS = new Set(VISUAL_STYLE_RULES.map(rule => rule.key));
const VALID_FORMAT_KEYS = new Set(FORMAT_RULES.map(rule => rule.key));

function resolvePortraitImagePath(novelDir: string, portraitImagePath: string): string {
  const resolved = path.resolve(novelDir, portraitImagePath);
  const relative = path.relative(novelDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError('立绘文件路径无效', 400, 'PORTRAIT_PATH_INVALID');
  }
  return resolved;
}

async function ensurePortraitImageFile(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new AppError('立绘文件不存在，请重新生成立绘', 404, 'PORTRAIT_FILE_MISSING');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as { code?: unknown })?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new AppError('立绘文件不存在，请重新生成立绘', 404, 'PORTRAIT_FILE_MISSING');
    }
    throw error;
  }
}

export async function ensureNovelAccess(
  req: Request,
  res: Response,
  novelManager: NovelManager,
  novelId: string,
): Promise<boolean> {
  const access = await checkNovelAccess(req, novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return false;
  }
  return true;
}

export function normalizePortraitStyleOverrides(raw?: PortraitStyleOverrides): PortraitStyleOverrides | undefined {
  if (!raw) return undefined;
  const normalized: PortraitStyleOverrides = {};
  if (raw.eraKey && VALID_ERA_KEYS.has(raw.eraKey)) {
    normalized.eraKey = raw.eraKey;
  }
  if (raw.roleAttireId?.trim()) {
    normalized.roleAttireId = raw.roleAttireId.trim();
  }
  if (raw.visualStyleKey && VALID_VISUAL_STYLE_KEYS.has(raw.visualStyleKey)) {
    normalized.visualStyleKey = raw.visualStyleKey;
  }
  if (raw.formatKey && VALID_FORMAT_KEYS.has(raw.formatKey)) {
    normalized.formatKey = raw.formatKey;
  }
  return normalized.eraKey || normalized.roleAttireId || normalized.visualStyleKey || normalized.formatKey
    ? normalized
    : undefined;
}

export async function generatePortraitPromptWithAI(
  modelClient: ModelClient,
  systemMsg: string,
  userMsg: string,
): Promise<string> {
  const result = await modelClient.chat([
    { role: 'system', content: systemMsg },
    { role: 'user', content: userMsg },
  ], { temperature: 0.75 });
  return result.content.trim();
}

export async function resolveGeneratedImageBytes(result: {
  b64Data?: string;
  imageUrl?: string;
}): Promise<{ bytes: Buffer; ext: string }> {
  if (result.b64Data) {
    return { bytes: Buffer.from(result.b64Data, 'base64'), ext: '.png' };
  }

  if (!result.imageUrl) {
    throw new Error('图像生成失败：未返回图像内容');
  }

  const response = await safeFetch(result.imageUrl, {
    maxResponseBytes: SAFE_FETCH_RESPONSE_LIMITS.image,
  });
  if (!response.ok) {
    throw new Error(`下载生成图像失败: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const ext = contentType.includes('webp')
    ? '.webp'
    : contentType.includes('jpeg') || contentType.includes('jpg')
      ? '.jpg'
      : '.png';

  const arrayBuffer = await response.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    ext,
  };
}

export async function resolvePortraitPrompt(params: {
  authDb?: AuthDb;
  authHeaders: Request['headers'];
  char: any;
  modelClient?: ModelClient;
  novel: any;
  styleOverrides?: PortraitStyleOverrides;
  userId?: string;
}): Promise<{
  negativePrompt: string;
  positivePrompt: string;
  styleIndex: ReturnType<typeof buildPortraitStyleIndex>;
  usedPrompt: string;
}> {
  const userMsg = buildPortraitCharacterContext(params.char, params.styleOverrides);
  const modelAccess = await resolveUserModelAccess({
    authDb: params.authDb,
    userId: params.userId,
    headers: params.authHeaders,
    novel: params.novel,
  });
  if (modelAccess.error && params.novel.modelConfig?.source === 'user-profile') {
    throw Object.assign(new Error(modelAccess.error), { code: 'USER_API_UNAVAILABLE', statusCode: 400 });
  }
  const activeModelClient = modelAccess.client ?? params.modelClient;
  const systemMsg = buildPortraitPromptSystem(params.char, params.styleOverrides);
  const rawPositivePrompt = activeModelClient
    ? await generatePortraitPromptWithAI(activeModelClient, systemMsg, userMsg)
    : buildPortraitTemplatePrompt(params.char, params.styleOverrides);
  const positivePrompt = enrichPortraitPromptWithCharacterConsistency(
    rawPositivePrompt,
    params.char,
    params.styleOverrides,
  );
  const negativePrompt = buildPortraitNegativePrompt(params.char, params.styleOverrides);
  const styleIndex = buildPortraitStyleIndex(params.char, params.styleOverrides);
  return {
    positivePrompt,
    negativePrompt,
    styleIndex,
    usedPrompt: composePortraitPromptBlock(positivePrompt, negativePrompt),
  };
}

export async function buildPortraitFromRequest(params: {
  authDb?: AuthDb;
  authHeaders: Request['headers'];
  char: any;
  explicitPrompt?: string;
  modelClient?: ModelClient;
  novel: any;
  styleOverrides?: PortraitStyleOverrides;
  userId?: string;
}): Promise<{
  negativePrompt: string;
  positivePrompt: string;
}> {
  const rawPrompt = params.explicitPrompt?.trim() || '';

  if (!rawPrompt) {
    const generated = await resolvePortraitPrompt({
      authDb: params.authDb,
      authHeaders: params.authHeaders,
      char: params.char,
      modelClient: params.modelClient,
      novel: params.novel,
      styleOverrides: params.styleOverrides,
      userId: params.userId,
    });
    return {
      positivePrompt: generated.positivePrompt,
      negativePrompt: generated.negativePrompt,
    };
  }

  const parsed = parsePortraitPromptBlock(rawPrompt);
  return {
    positivePrompt: enrichPortraitPromptWithCharacterConsistency(
      parsed.positivePrompt.trim(),
      params.char,
      params.styleOverrides,
    ),
    negativePrompt: parsed.negativePrompt.trim(),
  };
}

export async function savePortraitFile(params: {
  bytes: Buffer;
  char: any;
  charId: string;
  ext: string;
  novelId: string;
  novelManager: NovelManager;
  prompt: string;
}): Promise<{
  imagePath: string;
  imageUrl: string;
}> {
  const novelDir = resolveNovelStorageDir(getNovelsDir(), params.novelId);
  const portraitsDir = path.join(novelDir, 'portraits');
  await fs.mkdir(portraitsDir, { recursive: true });
  const fileName = `${params.charId}${params.ext}`;
  const filePath = path.join(portraitsDir, fileName);
  await fs.writeFile(filePath, params.bytes);

  const portraitImagePath = `portraits/${fileName}`;
  if (params.char.portraitImagePath && params.char.portraitImagePath !== portraitImagePath) {
    const oldPath = resolvePortraitImagePath(novelDir, params.char.portraitImagePath);
    await fs.unlink(oldPath).catch(() => {});
  }
  const updatedChar = {
    ...params.char,
    portraitImagePath,
    portraitPrompt: params.prompt,
    updatedAt: new Date().toISOString(),
  };
  await params.novelManager.saveCharacter(params.novelId, updatedChar as any);

  return {
    imagePath: portraitImagePath,
    imageUrl: `/api/novels/${params.novelId}/characters/${params.charId}/portrait`,
  };
}

export async function streamPortraitImage(params: {
  char: any;
  novelId: string;
  req: Request;
  res: Response;
}): Promise<void> {
  const novelDir = resolveNovelStorageDir(getNovelsDir(), params.novelId);
  const filePath = resolvePortraitImagePath(novelDir, params.char.portraitImagePath);
  await ensurePortraitImageFile(filePath);

  const thumbWidth = normalizeWidth(params.req.query.w as string | undefined);
  const wantsWebp = acceptsWebp(params.req.headers.accept);
  params.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  params.res.setHeader('Pragma', 'no-cache');
  params.res.setHeader('Expires', '0');
  params.res.setHeader('Vary', 'Accept, Authorization');

  const result = await resolveOptimizedImageFile(filePath, {
    width: thumbWidth,
    acceptsWebp: wantsWebp,
  });
  const bytes = await fs.readFile(result.filePath);
  params.res.setHeader('Content-Type', result.contentType);
  params.res.setHeader('Content-Length', bytes.length);
  params.res.end(bytes);
}

export async function deletePortraitFile(params: {
  char: any;
  novelId: string;
  novelManager: NovelManager;
}): Promise<void> {
  if (params.char.portraitImagePath) {
    const filePath = resolvePortraitImagePath(
      resolveNovelStorageDir(getNovelsDir(), params.novelId),
      params.char.portraitImagePath,
    );
    await fs.unlink(filePath).catch(() => {});
  }
  const updatedChar = {
    ...params.char,
    portraitImagePath: undefined,
    portraitPrompt: undefined,
    updatedAt: new Date().toISOString(),
  };
  await params.novelManager.saveCharacter(params.novelId, updatedChar as any);
}

export {
  enrichPortraitPromptWithCharacterConsistency,
  buildPortraitNegativePrompt,
  buildPortraitStyleIndex,
  composePortraitPromptBlock,
  getPortraitStyleOptions,
};
