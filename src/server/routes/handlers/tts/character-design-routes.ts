import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  ensureQwen3DesignEngine,
  ensureVoiceDesignerReady,
  executeVoiceDesigner,
  requestDesignedVoicePreview,
  requestVoiceClonePrompt,
  requestVoiceDesignPreview,
  resolveSingleCharacterVoiceInstruct,
  type TTSDesignRouteDeps,
} from './design-route-support.js';
import {
  loadVoicePreview,
  logger,
  recordQwen3DirectTtsUsage,
  saveVoicePreview,
} from './route-support.js';

export function registerTTSCharacterDesignRoutes(
  router: Router,
  { ensureNovelAccess, modelClient, novelManager, requireAdminForServerTTS, voiceDesignerAgent }: TTSDesignRouteDeps,
): void {
  router.post('/design-voice/:novelId/:characterId', requireAdminForServerTTS, async (req, res) => {
    const readyDeps = { modelClient, voiceDesignerAgent };
    if (!ensureVoiceDesignerReady(res, readyDeps)) {
      return;
    }
    if (!ensureQwen3DesignEngine(res, '声音设计仅支持 Qwen3-TTS 引擎，请先在设置中切换')) {
      return;
    }

    const novelId = String(req.params.novelId);
    const characterId = String(req.params.characterId);
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    try {
      const [novel, characters] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getCharacters(novelId),
      ]);

      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const character = characters.find(item => item.id === characterId);
      if (!character) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      let voiceInstruct = character.voiceInstruct;
      if (!voiceInstruct) {
        logger.info('为角色设计声音描述', { character: character.name });
        const designResults = await executeVoiceDesigner({
          novelId,
          novel,
          targets: [character],
          modelClient: readyDeps.modelClient,
          voiceDesignerAgent: readyDeps.voiceDesignerAgent,
        });
        if (!designResults) {
          res.status(500).json({ error: 'AI 音效师返回的数据格式异常，请重试' });
          return;
        }

        const resolvedVoiceInstruct = resolveSingleCharacterVoiceInstruct(designResults, characterId);
        if (!resolvedVoiceInstruct) {
          res.status(500).json({ error: '未能生成声音描述' });
          return;
        }
        voiceInstruct = resolvedVoiceInstruct;
      }

      const designPreviewText = `我是${character.name}，很高兴认识你。`;
      const designData = await requestVoiceDesignPreview({
        characterId,
        voiceInstruct,
        characterName: character.name,
      });
      await recordQwen3DirectTtsUsage({
        model: 'voice-design',
        promptText: designPreviewText,
        metadata: {
          characterId,
          hasInstruct: Boolean(voiceInstruct),
        },
      });

      logger.debug('创建 voice clone prompt');
      const cloneData = await requestVoiceClonePrompt({
        characterId,
        previewAudio: designData.audio,
        previewText: designPreviewText,
      });
      await recordQwen3DirectTtsUsage({
        model: 'voice-clone-prompt',
        promptText: designPreviewText,
        outputChars: cloneData.prompt_data.length,
        metadata: {
          characterId,
          promptId: cloneData.prompt_id,
        },
      });

      character.voiceInstruct = voiceInstruct;
      character.voiceClonePromptId = cloneData.prompt_id;
      character.voiceClonePromptData = cloneData.prompt_data;
      character.voiceDesignStatus = 'cloned';
      character.updatedAt = new Date().toISOString();

      await Promise.all([
        novelManager.saveCharacter(novelId, character),
        saveVoicePreview(novelId, characterId, designData.audio),
      ]);
      logger.info('角色声音设计完成', { character: character.name });

      res.json({
        characterId: character.id,
        characterName: character.name,
        voiceInstruct,
        voiceDesignStatus: 'cloned',
        previewAudio: designData.audio,
        previewDuration: designData.duration,
      });
    } catch (err) {
      logger.error('声音设计失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({
        error: '声音设计失败',
        detail: safeErrorMessage(err, '声音设计失败'),
      });
    }
  });

  router.post('/preview-designed/:novelId/:characterId', requireAdminForServerTTS, async (req, res) => {
    if (!ensureQwen3DesignEngine(res, '声音预览仅支持 Qwen3-TTS 引擎')) {
      return;
    }

    const novelId = String(req.params.novelId);
    const characterId = String(req.params.characterId);
    const { text } = req.body as { text?: string };
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    try {
      const characters = await novelManager.getCharacters(novelId);
      const character = characters.find(item => item.id === characterId);

      if (!character) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      if (!character.voiceClonePromptData) {
        res.status(400).json({ error: '该角色尚未完成声音设计，请先设计声音' });
        return;
      }

      if (!text) {
        const cached = await loadVoicePreview(novelId, characterId);
        if (cached) {
          logger.debug('返回缓存的预览音频', { character: character.name });
          res.json({ audio: cached, duration: 0, cached: true });
          return;
        }
      }

      const previewText = text || `大家好，我是${character.name}。`;
      const synthData = await requestDesignedVoicePreview({
        text: previewText,
        promptData: character.voiceClonePromptData,
        promptId: character.voiceClonePromptId,
      });

      await recordQwen3DirectTtsUsage({
        model: 'voice-clone',
        promptText: previewText,
        metadata: {
          characterId,
          promptId: character.voiceClonePromptId ?? '',
        },
      });

      if (!text) {
        saveVoicePreview(novelId, characterId, synthData.audio).catch(() => {});
      }

      res.json({
        audio: synthData.audio,
        duration: synthData.duration,
      });
    } catch (err) {
      res.status(500).json({
        error: '声音预览失败',
        detail: safeErrorMessage(err, '声音预览失败'),
      });
    }
  });
}
