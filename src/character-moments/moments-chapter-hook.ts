/**
 * 章节生成 / 定稿完成后自动触发角色朋友圈剧情动态的钩子。
 * 独立模块，避免污染 generate / finalize handler 的单一职责。
 */
import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelAgent } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import type { MomentsGenerator } from './moments-generator.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('moments-chapter-hook');

/**
 * 章节完成（生成或定稿）后触发：让所有开了朋友圈的活跃角色各发一条 plot 动态 + 互评，
 * 形成"群聊"效果。异步执行，不阻塞主流程。
 */
export async function triggerPlotMomentForChapter(params: {
  novelManager: NovelManager;
  momentsGenerator: MomentsGenerator;
  agents: Map<string, NovelAgent>;
  modelClient: ModelClient;
  novelId: string;
  chapterNumber: number;
}): Promise<void> {
  const { novelManager, momentsGenerator, agents, modelClient, novelId, chapterNumber } = params;

  const characters = await novelManager.getCharacters?.(novelId) ?? [];
  const candidates = (characters as any[]).filter((c) =>
    c.status !== 'dead' && c.status !== 'exited' && c.momentsEnabled !== false,
  );
  if (candidates.length === 0) {
    log.info('章节完成后朋友圈动态跳过（无符合条件的活跃角色）', {
      novelId, chapterNumber, totalCharacters: characters.length,
    });
    return;
  }

  let generated = 0;

  for (const character of candidates) {
    // 每个角色每章只发一条
    if (momentsGenerator.hasPlotMomentForChapter(novelId, chapterNumber, character.id)) {
      continue;
    }

    const result = await momentsGenerator.generateMoment({
      novelId,
      characterId: character.id,
      type: 'plot',
      relatedChapterNum: chapterNumber,
      agents,
      modelClient,
    });

    if ('error' in result) {
      log.warn('章节完成后角色朋友圈动态生成失败', {
        novelId, chapterNumber, characterName: character.name, error: result.error,
      });
      continue;
    }

    generated++;

    // 只在有至少 2 条动态时生成互评（第一条没有可互评的对象）
    if (generated >= 2) {
      await momentsGenerator.generateCommentsForMoment({
        momentId: result.momentId,
        agents,
        modelClient,
      });
    }
  }

  if (generated > 0) {
    log.info('章节完成后朋友圈动态已生成', {
      novelId, chapterNumber, generated, candidateCount: candidates.length,
    });
  }
}
