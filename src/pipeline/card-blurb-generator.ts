/**
 * 卡牌标签生成器（独立轻量模块）
 *
 * 从 FinalizePipeline 中提取，可在章节生成完成后独立触发。
 * 不依赖定稿管线，token 消耗极小（maxTokens: 512）。
 */
import type { NovelAgent } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';

export interface CardBlurbDeps {
  novelManager: NovelManager;
  agents: Map<string, NovelAgent>;
  modelClient: ModelClient;
}

export interface CardBlurbOptions {
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  genre: string;
  novelTitle: string;
  novelSynopsis: string;
}

export async function touchCharacterCardProgress(
  novelManager: NovelManager,
  opts: Pick<CardBlurbOptions, 'novelId' | 'chapterNumber'>,
): Promise<any[]> {
  let allChars: any[];
  try {
    allChars = await novelManager.getCharacters(opts.novelId);
  } catch {
    return [];
  }
  if (!allChars?.length) return [];

  // 仅返回开启了 autoEvolve 的角色，供卡牌标签生成使用。
  // 本函数不再越权追写 currentState——"[第N章]剧情推进"是零信息占位符，
  // 会作为 latest 覆盖真实状态（含死亡/退场标记），导致角色状态记忆空洞（设定漂移诱因之一）。
  // 章节级状态应由 character-merger 在有真实剧情变化时写入。
  return allChars.filter((c: any) => c.autoEvolve !== false);
}

/**
 * 为小说中所有开启了 autoEvolve 的角色：
 * 1. 追写 currentState（章节标记）
 * 2. 生成/更新读者友好卡牌标签
 * 通常在章节生成完成后以 fire-and-forget 方式调用
 */
export async function generateCardBlurbs(
  deps: CardBlurbDeps,
  opts: CardBlurbOptions,
): Promise<void> {
  const { novelManager, agents, modelClient } = deps;
  const activeChars = await touchCharacterCardProgress(novelManager, opts);
  if (!activeChars.length) return;

  const timestamp = new Date().toISOString();
  const blurbAgent = agents.get('card-blurb-writer');
  if (!blurbAgent) return;

  // === 步骤 1.5：壳角色补全（personality + appearance 均为空的角色，AI 生成基础档案） ===
  const shellChars = activeChars.filter((c: any) =>
    (!c.personality || c.personality.trim() === '') &&
    (!c.appearance || c.appearance.trim() === ''),
  );
  if (shellChars.length > 0) {
    try {
      const shellInput = [
        '## 小说信息',
        `- 标题：${opts.novelTitle}`,
        `- 类型：${opts.genre}`,
        '',
        '## 本章正文（节选）',
        opts.chapterContent.slice(0, 2500),
        '',
        '## 需要补全档案的角色',
        '以下角色的性格和外貌描述缺失。请根据名字和本章内容推断，为每个角色生成简短的性格和外貌描述。',
        '格式：每个角色一行，`角色名 | 性格（30字内）| 外貌（30字内）`',
        JSON.stringify(shellChars.map((c: any) => ({
          name: c.name,
          role: c.role,
          firstAppearance: c.firstAppearance,
        }))),
      ].join('\n');

      const shellResult = await blurbAgent.execute(
        {
          novelId: opts.novelId,
          genre: opts.genre,
          novelTitle: opts.novelTitle,
          novelSynopsis: opts.novelSynopsis,
          chapterNumber: opts.chapterNumber,
          inputText: shellInput,
        },
        modelClient,
      );

      if (shellResult?.content) {
        const shellLines = shellResult.content
          .split('\n')
          .filter((l: string) => l.includes('|'));

        for (const line of shellLines) {
          const parts = line.split('|').map((p: string) => p.trim());
          const rawName = parts[0];
          const newPersonality = parts[1]?.slice(0, 80);
          const newAppearance = parts[2]?.slice(0, 80);
          if (!rawName) continue;

          const char = shellChars.find(
            (c: any) => c.name === rawName || c.aliases?.includes(rawName),
          );
          if (char) {
            if (newPersonality && newPersonality.length > 1) {
              char.personality = newPersonality;
            }
            if (newAppearance && newAppearance.length > 1) {
              char.appearance = newAppearance;
            }
            char.updatedAt = timestamp;
            try {
              await novelManager.saveCharacter(opts.novelId, char);
            } catch { /* 静默 */ }
          }
        }
      }
    } catch (err) {
      console.warn('[card-blurb] 壳角色补全失败:', err instanceof Error ? err.message : err);
    }
  }

  // === 步骤 2：生成卡牌标签 ===
  const blurbInput = [
    '## 本章正文',
    opts.chapterContent.slice(0, 3000) + (opts.chapterContent.length > 3000 ? '\n...（正文过长已截取前3000字）' : ''),
    '',
    '## 角色档案（含上一版卡牌标签）',
    '注意：上一版标签(oldCardBlurb)是参考，请根据本章内容生成新的标签。角色有新变化时标签应有相应的演化；若无明显变化可保留类似风格但换一种说法。',
    JSON.stringify(activeChars.map((c: any) => ({
      name: c.name,
      role: c.role,
      personality: c.personality?.slice(0, 80),
      currentState: c.currentState,
      arc: c.arc?.slice(0, 100),
      oldCardBlurb: c.cardBlurb || '（暂无）',
    })), null, 2),
  ].join('\n');

  let blurbResult;
  try {
    blurbResult = await blurbAgent.execute(
      {
        novelId: opts.novelId,
        genre: opts.genre,
        novelTitle: opts.novelTitle,
        novelSynopsis: opts.novelSynopsis,
        chapterNumber: opts.chapterNumber,
        inputText: blurbInput,
      },
      modelClient,
    );
  } catch (err) {
    console.warn('[card-blurb] 标签生成失败:', err instanceof Error ? err.message : err);
    return;
  }

  if (!blurbResult?.content) return;

  // 解析 "角色名：标签" 格式
  const lines = blurbResult.content
    .split('\n')
    .filter((l: string) => l.includes('：') || l.includes(':'));

  for (const line of lines) {
    const [namePart, ...blurbParts] = line.split(/[：:]/);
    const rawName = namePart.trim();
    const blurb = blurbParts.join('：').trim().slice(0, 30);
    if (!rawName || !blurb) continue;

    const char = activeChars.find(
      (c: any) => c.name === rawName || c.aliases?.includes(rawName),
    );
    if (char) {
      try {
        char.cardBlurb = blurb;
        char.updatedAt = timestamp;
        await novelManager.saveCharacter(opts.novelId, char);
      } catch (saveErr) {
        console.warn(`[card-blurb] 保存标签失败 (${char.name}):`, saveErr instanceof Error ? saveErr.message : saveErr);
      }
    }
  }
}
