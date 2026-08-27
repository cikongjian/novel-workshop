import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { recordAiUsage } from '../../../../ai/usage-recorder.js';
import { getNovelsDir, readSettings } from '../../../../config/index.js';
import { resolveNovelStorageDir } from '../../../../novel/data-root.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { getNarrationEngine } from '../../../../tts/engine-factory.js';
import { createLogger } from '../../../../utils/logger.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';

export const logger = createLogger('TTS');

export const NarratorVoiceBody = z.object({
  voice: z.string().min(1),
});

export const NarratorPreviewBody = z.object({
  voice: z.string().min(1),
  text: z.string().max(2000).optional(),
  rate: z.string().optional(),
});

export const PreviewBody = z.object({
  voice: z.string().min(1),
  text: z.string().min(1).max(2000),
  rate: z.string().optional(),
});

export type EnsureNovelAccess = (
  req: Request,
  res: Response,
  novelId: string,
) => Promise<boolean>;

export type RequireAdminForServerTTS = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

export function createTTSAccessGuards(novelManager: NovelManager): {
  ensureNovelAccess: EnsureNovelAccess;
  requireAdminForServerTTS: RequireAdminForServerTTS;
} {
  const requireAdminForServerTTS = (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.auth?.role;
    let mode: 'off' | 'admin' | 'on' = 'admin';
    try {
      const settings = readSettings();
      mode = settings.audiobookAccessMode ?? 'admin';
    } catch {
      // 读不到配置时保守回退到 admin-only
      mode = 'admin';
    }

    if (mode === 'off') {
      res.status(403).json({
        error: 'AI 有声书功能已关闭',
        hint: '请联系管理员开启',
      });
      return;
    }

    if (mode === 'admin' && userRole !== 'admin') {
      res.status(403).json({
        error: '服务端 TTS 仅限管理员使用',
        hint: '普通用户请使用客户端 TTS 功能',
      });
      return;
    }

    if (mode === 'on' && !req.auth) {
      res.status(401).json({
        error: '请先登录后使用 AI 有声书功能',
      });
      return;
    }

    next();
  };

  async function ensureNovelAccess(req: Request, res: Response, novelId: string): Promise<boolean> {
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return false;
    }
    return true;
  }

  return {
    ensureNovelAccess,
    requireAdminForServerTTS,
  };
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function voicePreviewPath(novelId: string, characterId: string): string {
  if (!isValidId(novelId) || !isValidId(characterId)) {
    throw new Error('无效的 ID 参数');
  }
  return path.join(resolveNovelStorageDir(getNovelsDir(), novelId), 'voices', `${characterId}.preview.mp3`);
}

export async function saveVoicePreview(
  novelId: string,
  characterId: string,
  audioBase64: string,
): Promise<void> {
  const filePath = voicePreviewPath(novelId, characterId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(audioBase64, 'base64'));
}

export async function loadVoicePreview(
  novelId: string,
  characterId: string,
): Promise<string | null> {
  try {
    const buf = await fs.readFile(voicePreviewPath(novelId, characterId));
    return buf.toString('base64');
  } catch {
    return null;
  }
}

export async function recordQwen3DirectTtsUsage(params: {
  model: 'voice-design' | 'voice-clone-prompt' | 'voice-clone';
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
    logger.warn('usage recording failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getNarrationVoiceNames(): Promise<Set<string>> {
  const voices = await getNarrationEngine().getVoices();
  return new Set(voices.map(voice => voice.name));
}
