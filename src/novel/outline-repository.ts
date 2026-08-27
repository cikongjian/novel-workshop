import { OutlineData } from './types.js';
import type { NovelPaths } from './novel-paths.js';
import { readJson, writeJson, quarantineCorruptFile } from './fs-helpers.js';
import { listChapters, getChapter } from './chapter-repository.js';

// ==================== 紧张度估算（内部工具） ====================

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateTensionFromText(text: string): number {
  const t = (text ?? '').trim();
  if (!t) return 5;

  const count = (re: RegExp) => (t.match(re)?.length ?? 0);

  let score = 5;

  // 冲突/危险/动作信号（上限防止爆表）
  const dangerHits = Math.min(12, count(/危机|威胁|生死|刺杀|刺客|毒|追杀|追击|埋伏|围杀|暗杀|战|开战|厮杀|血|火|爆|崩|塌|急报|紧急|惊变|反转|叛|造反|政变/g));
  score += dangerHits * 0.25;

  // 情绪强度信号
  const emotionHits = Math.min(10, count(/震惊|惊骇|惊恐|恐惧|慌|颤|绝望|崩溃|疯狂|大怒|暴怒|杀意/g));
  score += emotionHits * 0.2;

  // 节奏推进/转折信号
  const turnHits = Math.min(10, count(/然而|但是|却|忽然|突然|就在这时|没想到|转眼|顷刻|一瞬间/g));
  score += turnHits * 0.15;

  // 标点信号
  score += Math.min(6, count(/[！!]/g)) * 0.15;
  score += Math.min(6, count(/[？?]/g)) * 0.1;

  // 轻松/日常信号（略微下调）
  const calmHits = Math.min(10, count(/平静|安稳|闲聊|吃饭|喝茶|散步|家常|玩笑|轻松|无事/g));
  score -= calmHits * 0.2;

  score = clampNumber(score, 0, 10);
  return Math.round(score * 2) / 2;
}

// ==================== 重建大纲 ====================

export async function rebuildOutlineFromChapters(
  paths: NovelPaths,
  novelId: string,
): Promise<OutlineData> {
  const metas = await listChapters(paths, novelId);

  // 并行加载所有章节
  const chapterResults = await Promise.all(
    metas.map(async (meta) => {
      try {
        const chapter = await getChapter(paths, novelId, meta.chapterNumber);
        const estimatedTension = estimateTensionFromText([
          chapter?.outline?.summary ?? '',
          chapter?.summary ?? '',
          chapter?.content?.slice(0, 1200) ?? '',
        ].filter(Boolean).join('\n'));

        const base = {
          chapterNumber: meta.chapterNumber,
          title: meta.title ?? '',
          summary: chapter?.summary ?? '',
          beats: [],
          tensionTarget: estimatedTension,
          plotThreadsAdvanced: [],
          keyEvents: [],
          notes: '',
        };

        if (chapter?.outline) {
          return {
            ...base,
            ...chapter.outline,
            chapterNumber: meta.chapterNumber,
            title: chapter.outline.title || base.title,
            summary: chapter.outline.summary || base.summary,
          };
        } else {
          return base;
        }
      } catch {
        // 跳过损坏章节
        return null;
      }
    }),
  );

  const chapters = chapterResults.filter((ch): ch is NonNullable<typeof ch> => ch !== null);

  return OutlineData.parse({
    chapters,
    plotThreads: [],
    foreshadowing: [],
  });
}

// ==================== 大纲 CRUD ====================

/**
 * 获取大纲数据
 */
export async function getOutline(
  paths: NovelPaths,
  novelId: string,
): Promise<OutlineData> {
  const filePath = paths.outlinePath(novelId);
  try {
    const raw = await readJson(filePath, {
      chapters: [],
      plotThreads: [],
      foreshadowing: [],
    });
    const parsed = OutlineData.parse(raw);

    // 兼容历史/异常数据：outline.json 可解析但 chapters 为空时，尝试从章节元数据重建章节大纲壳，避免前端"大纲页空白"。
    // 不覆盖 plotThreads/foreshadowing，仅补齐 chapters。
    if ((parsed.chapters?.length ?? 0) === 0) {
      const metas = await listChapters(paths, novelId);
      if (metas.length > 0) {
        const rebuilt = await rebuildOutlineFromChapters(paths, novelId);
        if (rebuilt.chapters.length > 0) {
          const merged = OutlineData.parse({
            ...parsed,
            chapters: rebuilt.chapters,
          });
          await writeJson(filePath, merged).catch(() => {});
          return merged;
        }
      }
    }

    // 兼容：章节大纲壳存在但紧张度均为默认值（常见于从章节元数据回填的 outline.chapters）。
    // 仅在"看起来是自动回填壳"的章节上做轻量估算，避免覆盖用户手动设置。
    let tensionModified = false;
    const nextChapters = parsed.chapters.map((ch) => {
      const looksLikeShell = (ch.beats?.length ?? 0) === 0
        && (ch.keyEvents?.length ?? 0) === 0
        && (ch.notes?.trim?.() ?? '') === ''
        && (ch.plotThreadsAdvanced?.length ?? 0) === 0;

      if (!looksLikeShell) return ch;
      if (typeof ch.tensionTarget !== 'number' || ch.tensionTarget !== 5) return ch;
      if (!ch.summary?.trim()) return ch;

      const estimated = estimateTensionFromText(ch.summary);
      if (estimated === 5) return ch;
      tensionModified = true;
      return { ...ch, tensionTarget: estimated };
    });

    if (tensionModified) {
      const merged = OutlineData.parse({ ...parsed, chapters: nextChapters });
      await writeJson(filePath, merged).catch(() => {});
      return merged;
    }

    return OutlineData.parse({ ...parsed, chapters: nextChapters });
  } catch (err: unknown) {
    // 若 outline.json 损坏（非法 JSON），则隔离文件并用章节元数据重建一个可用的最小大纲，避免前端"大纲页空白"。
    if (err instanceof SyntaxError) {
      await quarantineCorruptFile(filePath);
      const rebuilt = await rebuildOutlineFromChapters(paths, novelId);
      await writeJson(filePath, rebuilt);
      return rebuilt;
    }
    throw err;
  }
}

/**
 * 保存大纲数据
 */
export async function saveOutline(
  paths: NovelPaths,
  novelId: string,
  outline: OutlineData,
): Promise<void> {
  const validated = OutlineData.parse(outline);
  await writeJson(paths.outlinePath(novelId), validated);
}
