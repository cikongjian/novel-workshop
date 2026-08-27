import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { CharacterRole, type CharacterProfile } from '../../../../novel/types.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import {
  buildCreatedCharacter,
  buildDeprecatedCharacterRouteMessage,
  buildUpdatedCharacter,
  isNotFoundLikeError,
  tryIndexCharacter,
} from './crud-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { checkNameViolation } from '../../../../novel/name-registry.js';
export { buildCharacterV2Fields } from './crud-support.js';

const CharacterDrivesBody = z.object({
  want: z.string().optional(),
  need: z.string().optional(),
  fear: z.string().optional(),
  secret: z.string().optional(),
  taboo: z.array(z.string()).optional(),
});

const CharacterPersonalityModelBody = z.object({
  traits: z.array(z.string()).optional(),
  innerContradictions: z.array(z.string()).optional(),
  moralBoundary: z.array(z.string()).optional(),
});

const CharacterSpeechDNABody = z.object({
  lexicon: z.array(z.string()).optional(),
  tempo: z.enum(['slow', 'mid', 'fast']).optional(),
  tone: z.array(z.string()).optional(),
  tics: z.array(z.string()).optional(),
});

const CharacterTTSProfileBody = z.object({
  baseVoice: z.string().optional(),
  prosodyRange: z.object({
    rate: z.tuple([z.number(), z.number()]).optional(),
    pitch: z.tuple([z.number(), z.number()]).optional(),
  }).optional(),
  emotionMap: z.record(z.string(), z.string()).optional(),
});

/** 创建/更新角色请求体 schema */
export const CharacterBody = z.object({
  name: z.string().min(1, '角色名不能为空'),
  aliases: z.array(z.string()).optional(),
  role: CharacterRole,
  position: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  personalityTraits: z.array(z.string()).optional(),
  speechStyle: z.string().optional(),
  speechExamples: z.array(z.string()).optional(),
  backstory: z.string().optional(),
  motivation: z.string().optional(),
  abilities: z.array(z.string()).optional(),
  relationships: z.array(z.object({
    targetId: z.string().uuid(),
    type: z.string(),
    description: z.string().default(''),
  })).optional(),
  ttsVoice: z.string().optional(),
  voiceInstruct: z.string().optional(),
  voiceRefAudioPath: z.string().optional(),
  voiceClonePromptId: z.string().optional(),
  voiceClonePromptData: z.string().optional(),
  voiceDesignStatus: z.enum(['none', 'designed', 'cloned']).optional(),
  drives: CharacterDrivesBody.optional(),
  personalityModel: CharacterPersonalityModelBody.optional(),
  speechDNA: CharacterSpeechDNABody.optional(),
  ttsProfile: CharacterTTSProfileBody.optional(),
  arc: z.string().optional(),
  currentState: z.string().optional(),
  firstAppearance: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  mailboxEnabled: z.boolean().optional(),
  momentsEnabled: z.boolean().optional(),
});

/**
 * Register character CRUD routes
 * GET    / - List all characters
 * POST   / - Create a character
 * GET    /:characterId/state-history - Deprecated
 * GET    /:characterId/consistency-report - Deprecated
 * PUT    /:characterId - Update a character
 * DELETE /:characterId - Delete a character
 */
export function registerCharacterCRUDHandlers(
  router: Router,
  novelManager: NovelManager,
  novelMemory?: NovelMemory,
): void {
  // Get all characters
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const characters = await novelManager.getCharacters(novelId);
      res.json(characters);
    } catch (err) {
      const message = safeErrorMessage(err, '获取角色列表失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // Create a character
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = CharacterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      // 智能取名系统：事前校验
      // 1. 检查是否命中 AI 模板黑名单（如"林默""苏辰"等 AI 训练数据高频名）
      const violation = checkNameViolation(parsed.data.name);
      if (violation.violated) {
        res.status(400).json({
          error: violation.reason ?? '角色名不符合命名规范',
          hint: '该名字是 AI 训练数据中的高频主角名，已在多本书中重复使用。请换一个更有辨识度的名字，建议使用中频姓氏（方、程、段、钟、韩等）并避免堆砌"墨/尘/逸/凌"等网文高频字。',
        });
        return;
      }

      // 2. 检查是否与同小说已有角色重名（含别名，大小写不敏感）
      const existingChars = await novelManager.getCharacters(novelId);
      const newName = parsed.data.name.trim().toLowerCase();
      const newAliases = (parsed.data.aliases ?? []).map((a) => a.trim().toLowerCase());
      const duplicate = existingChars.find((c) => {
        if (c.name.trim().toLowerCase() === newName) return true;
        if (newAliases.includes(c.name.trim().toLowerCase())) return true;
        const existingAliases = (c.aliases ?? []).map((a) => a.trim().toLowerCase());
        return existingAliases.includes(newName);
      });
      if (duplicate) {
        res.status(409).json({
          error: `角色名"${parsed.data.name}"与已有角色"${duplicate.name}"冲突`,
          hint: `如需更新已有角色，请使用 PUT /api/novels/${novelId}/characters/${duplicate.id}。如需创建同名新角色，请先重命名或删除已有角色。`,
          duplicateId: duplicate.id,
        });
        return;
      }

      const character: CharacterProfile = buildCreatedCharacter({
        data: parsed.data,
      });

      await novelManager.saveCharacter(novelId, character);
      await tryIndexCharacter(novelMemory, novelId, character);
      res.status(201).json(character);
    } catch (err) {
      const message = safeErrorMessage(err, '创建角色失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // Get character state history
  router.get('/:characterId/state-history', async (req: Request, res: Response): Promise<void> => {
    void req;
    res.status(410).json(buildDeprecatedCharacterRouteMessage('state-history'));
  });

  // Get character consistency report
  router.get('/:characterId/consistency-report', async (req: Request, res: Response): Promise<void> => {
    void req;
    res.status(410).json(buildDeprecatedCharacterRouteMessage('consistency-report'));
  });

  // Update a character
  router.put('/:characterId', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const { characterId } = req.params;
      if (typeof characterId !== 'string') {
        res.status(400).json({ error: 'Invalid characterId' });
        return;
      }
      const parsed = CharacterBody.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      // 获取已有角色
      const characters = await novelManager.getCharacters(novelId);
      const existing = characters.find((c: CharacterProfile) => c.id === characterId);
      if (!existing) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      const updated: CharacterProfile = buildUpdatedCharacter({
        existing,
        patch: parsed.data,
      });

      await novelManager.saveCharacter(novelId, updated);
      await tryIndexCharacter(novelMemory, novelId, updated);

      // 注意：不再自动清除 TTS 缓存
      // TTS 服务会在播放时自动检测角色声音变化，只重新合成受影响的片段

      res.json(updated);
    } catch (err) {
      const message = safeErrorMessage(err, '更新角色失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // Delete a character
  router.delete('/:characterId', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const { characterId } = req.params;
      if (typeof characterId !== 'string') {
        res.status(400).json({ error: 'Invalid characterId' });
        return;
      }
      await novelManager.deleteCharacter(novelId, characterId);
      res.status(204).send();
    } catch (err) {
      const message = safeErrorMessage(err, '删除角色失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
