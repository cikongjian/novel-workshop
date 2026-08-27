import type { NovelAgent } from '../agents/types.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import { parseArcSummary } from '../memory/arc-types.js';
import type { ModelClient } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BatchArcSummary');

export type BatchArcSummaryResult = {
  arcNumber: number;
  ok: boolean;
  error?: string;
};

export type BatchArcSummarySummary = {
  ok: true;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchArcSummaryResult[];
  message?: string;
};

export type BatchArcSummaryFrame =
  | {
    type: 'batch-arc-summary:progress';
    novelId: string;
    arcNumber: number;
    total: number;
    done: number;
  }
  | {
    type: 'batch-arc-summary:complete';
    novelId: string;
    results: BatchArcSummaryResult[];
  };

export async function executeBatchArcSummary(params: {
  novelId: string;
  novelManager: NovelManager;
  novelMemory: NovelMemory;
  modelClient: ModelClient;
  arcAgent: NovelAgent;
  onFrame?: (frame: BatchArcSummaryFrame) => void;
}): Promise<BatchArcSummarySummary> {
  const { novelId, novelManager, novelMemory, modelClient, arcAgent, onFrame } = params;

  const novel = await novelManager.getNovel(novelId);
  if (!novel) {
    throw new Error('小说不存在');
  }

  const allChapters = await novelManager.listChapters(novelId);
  if (allChapters.length < 10) {
    return {
      ok: true,
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      message: '章节数不足10，无需生成弧线摘要',
    };
  }

  const maxChapter = Math.max(...allChapters.map(chapter => chapter.chapterNumber));
  const arcGroups: Array<{ arcNumber: number; start: number; end: number }> = [];
  for (let arcNumber = 1; arcNumber * 10 <= maxChapter; arcNumber += 1) {
    arcGroups.push({
      arcNumber,
      start: (arcNumber - 1) * 10 + 1,
      end: arcNumber * 10,
    });
  }

  const results: BatchArcSummaryResult[] = [];

  for (const group of arcGroups) {
    try {
      const digestParts: string[] = [];
      for (let chapterNumber = group.start; chapterNumber <= group.end; chapterNumber += 1) {
        const chapter = await novelManager.getChapter(novelId, chapterNumber);
        if (chapter?.summary) {
          digestParts.push(`### 第${chapterNumber}章\n${chapter.summary}`);
          continue;
        }
        if (chapter?.content) {
          digestParts.push(`### 第${chapterNumber}章\n${chapter.content.slice(0, 500)}...`);
        }
      }

      if (digestParts.length < 3) {
        results.push({ arcNumber: group.arcNumber, ok: false, error: '可用摘要不足' });
        continue;
      }

      onFrame?.({
        type: 'batch-arc-summary:progress',
        novelId,
        arcNumber: group.arcNumber,
        total: arcGroups.length,
        done: results.length,
      });

      const arcResult = await arcAgent.execute(
        {
          novelId,
          novelTitle: novel.title,
          novelSynopsis: novel.synopsis,
          genre: novel.genre,
          userDirection: `弧线编号：${group.arcNumber}，章节范围：第${group.start}-${group.end}章`,
          inputText: digestParts.join('\n\n'),
        },
        modelClient,
      );

      const arc = parseArcSummary(arcResult.content);
      if (!arc) {
        results.push({ arcNumber: group.arcNumber, ok: false, error: '弧线摘要解析失败' });
        continue;
      }

      arc.arcNumber = group.arcNumber;
      arc.chapterRange = { start: group.start, end: group.end };
      await novelMemory.indexArcSummary(novelId, arc);
      results.push({ arcNumber: group.arcNumber, ok: true });
      logger.debug('弧线摘要已生成并索引', { arcNumber: group.arcNumber, start: group.start, end: group.end });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ arcNumber: group.arcNumber, ok: false, error: message });
      logger.warn('弧线摘要生成失败', { arcNumber: group.arcNumber, error: message });
    }
  }

  onFrame?.({
    type: 'batch-arc-summary:complete',
    novelId,
    results,
  });

  const succeeded = results.filter(result => result.ok).length;
  return {
    ok: true,
    total: arcGroups.length,
    succeeded,
    failed: arcGroups.length - succeeded,
    results,
  };
}
