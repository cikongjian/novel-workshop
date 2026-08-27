import type { OutlineData } from '../../../novel/types.js';
import { evaluateDigestQuality } from '../../../pipeline/digest-quality-gate.js';
import { createLogger } from '../../../utils/logger.js';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

const logger = createLogger('Digest');

type BatchDigestResult = {
  chapterNumber: number;
  ok: boolean;
  error?: string;
};

export function resolveDigestTargetNumbers(params: {
  requestedChapters?: number[];
  allChapters: Array<{ chapterNumber: number }>;
}): number[] {
  return params.requestedChapters && params.requestedChapters.length > 0
    ? params.requestedChapters
    : params.allChapters.map(item => item.chapterNumber);
}

export function buildDigestOutlineContext(params: {
  chapterNumber: number;
  outline?: OutlineData;
}): string {
  const chapterOutline = params.outline?.chapters?.find(c => c.chapterNumber === params.chapterNumber);
  return chapterOutline
    ? `第${params.chapterNumber}章大纲：${chapterOutline.title ?? ''} — ${chapterOutline.keyEvents?.join('；') ?? ''}`
    : '';
}

export function buildDigestSummary(params: {
  targetCount: number;
  results: BatchDigestResult[];
}): {
  ok: true;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchDigestResult[];
} {
  const succeeded = params.results.filter(item => item.ok).length;
  return {
    ok: true,
    total: params.targetCount,
    succeeded,
    failed: params.targetCount - succeeded,
    results: params.results,
  };
}

export async function runBatchDigestWorkflow(params: {
  deps: GenerateDeps;
  novelId: string;
  requestedChapters?: number[];
  force: boolean;
}): Promise<{
  ok: true;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchDigestResult[];
}> {
  const { deps, novelId, requestedChapters, force } = params;
  const {
    novelManager,
    novelMemory,
    modelClient,
    broadcastJson,
    agents,
  } = deps;
  const digestAgent = agents?.get('chapter-digest');
  if (!digestAgent || !novelMemory) {
    throw new Error('摘要服务未就绪（缺少 digest Agent 或记忆模块）');
  }

  const novel = await novelManager.getNovel(novelId);
  if (!novel) {
    throw new Error('小说不存在');
  }
  const allChapters = await novelManager.listChapters(novelId);
  const targetNumbers = resolveDigestTargetNumbers({
    requestedChapters,
    allChapters,
  });

  let outline: OutlineData | undefined;
  try {
    outline = await novelManager.getOutline(novelId);
  } catch {
    outline = undefined;
  }

  const results: BatchDigestResult[] = [];
  let outlineDirty = false;

  for (const chapterNumber of targetNumbers) {
    try {
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter || !chapter.content?.trim()) {
        results.push({ chapterNumber, ok: false, error: '章节内容为空' });
        continue;
      }

      broadcastJson?.({
        type: 'batch-digest:progress',
        novelId,
        chapterNumber,
        total: targetNumbers.length,
        done: results.length,
      });

      const digestResult = await digestAgent.execute(
        {
          novelId,
          novelTitle: novel.title,
          novelSynopsis: novel.synopsis,
          genre: novel.genre,
          chapterNumber,
          outlineContext: buildDigestOutlineContext({ chapterNumber, outline }),
          inputText: chapter.content,
        },
        modelClient,
      );

      const { parseChapterDigest } = await import('../../../memory/digest-types.js');
      const digest = parseChapterDigest(digestResult.content);

      if (!digest) {
        results.push({ chapterNumber, ok: false, error: '摘要解析失败' });
        continue;
      }

      try {
        const characters = await novelManager.getCharacters(novelId);
        const charNames = characters.map(item => item.name);
        const digestQuality = evaluateDigestQuality(
          chapter.content,
          digest.plotSummary || '',
          charNames,
        );
        if (!digestQuality.pass) {
          console.warn(`[摘要质量] 第 ${chapterNumber} 章摘要质量不足（${digestQuality.score}分）：${digestQuality.warnings.join('；')}`);
        }
      } catch {
        // 质量检测失败不影响主流程
      }

      await novelMemory.indexChapterDigest(novelId, chapterNumber, digest);
      if (digest.plotSummary && (force || !chapter.summary)) {
        chapter.summary = digest.plotSummary;
        chapter.updatedAt = new Date().toISOString();
        await novelManager.saveChapter(novelId, chapter);
      }
      if (digest.plotSummary && outline) {
        const entry = outline.chapters.find(item => item.chapterNumber === chapterNumber);
        if (entry) {
          entry.summary = digest.plotSummary;
          if (digest.keyEvents?.length) {
            entry.keyEvents = digest.keyEvents;
          }
          outlineDirty = true;
        }
      }
      results.push({ chapterNumber, ok: true });
      logger.debug('章节摘要已生成并索引', { chapterNumber });
    } catch (err) {
      results.push({
        chapterNumber,
        ok: false,
        error: safeErrorMessage(err, '内部错误'),
      });
      logger.warn('章节摘要生成失败', {
        chapterNumber,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  if (outlineDirty && outline) {
    try {
      await novelManager.saveOutline(novelId, outline);
    } catch {
      // 大纲保存失败不影响主流程
    }
  }

  broadcastJson?.({ type: 'batch-digest:complete', novelId, results });
  return buildDigestSummary({
    targetCount: targetNumbers.length,
    results,
  });
}

export async function syncOutlineSummaries(params: {
  deps: GenerateDeps;
  novelId: string;
}): Promise<{
  ok: true;
  synced: number;
  total: number;
}> {
  const { novelManager } = params.deps;
  const outline = await novelManager.getOutline(params.novelId);
  const allChapters = await novelManager.listChapters(params.novelId);
  const written = allChapters.filter(ch => ch.wordCount > 0);
  let synced = 0;

  for (const meta of written) {
    const chapter = await novelManager.getChapter(params.novelId, meta.chapterNumber);
    if (!chapter?.summary) {
      continue;
    }

    const entry = outline.chapters.find(item => item.chapterNumber === meta.chapterNumber);
    if (!entry) {
      continue;
    }

    entry.summary = chapter.summary;
    entry.title = chapter.title || entry.title;
    synced += 1;
  }

  if (synced > 0) {
    await novelManager.saveOutline(params.novelId, outline);
  }

  return { ok: true, synced, total: written.length };
}
