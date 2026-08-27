/**
 * 章节生成后处理任务
 *
 * 从 chapter-pipeline 中拆分出来的非关键路径处理逻辑：
 * - 跨章节一致性审计
 * - 大纲偏离自动修正
 * - 事实图谱增量更新
 *
 * 所有任务均为 fire-and-forget 降级模式，失败不阻塞主流程。
 */

import { createLogger } from '../utils/logger.js';
import { auditCrossChapterConsistency } from './cross-chapter-auditor.js';
import { analyzeOutlineCorrections, buildCorrectionReport } from './outline-auto-corrector.js';
import { extractFactsFromChapter, mergeFactsIntoGraph } from '../novel/fact-graph-builder.js';
import type { PipelineNovelManager } from './types.js';
import type { CharacterProfile } from '../novel/types.js';
import type { StoryStateManager } from '../novel/story-state-manager.js';
import {
  auditChapterNarrativeUsage,
  mergeNarrativeAuditIntoDiagnostics,
  summarizeNarrativeAudit,
} from './narrative-audit.js';
import {
  auditChapterReadability,
  mergeReadabilityAuditIntoDiagnostics,
} from './readability-audit.js';
import { auditGenreDrift } from './genre-drift-audit.js';
import { buildNovelPromiseContract } from './novel-promise-contract.js';
import { persistWorldUsageUpdates } from './world-usage-tracker.js';

const postLog = createLogger('chapter-post-processing');

export type PostProcessingParams = {
  novelId: string;
  chapterNumber: number;
  polishedText: string;
  characters: CharacterProfile[];
  novelManager: PipelineNovelManager;
  storyStateManager?: StoryStateManager;
};

/**
 * 跨章节一致性审计（轻量级，仅警告）。
 */
async function runCrossChapterAudit(params: PostProcessingParams): Promise<void> {
  const { novelId, chapterNumber, polishedText, characters, novelManager } = params;
  try {
    const allChapters = await novelManager.listChapters(novelId);
    const recentChapters = allChapters
      .filter(ch => ch.chapterNumber >= Math.max(1, chapterNumber - 5) && ch.chapterNumber < chapterNumber);

    const loadedChapters = await Promise.all(
      recentChapters.map(ch => novelManager.getChapter(novelId, ch.chapterNumber).catch(() => null)),
    );
    const chapterData = loadedChapters
      .filter((full): full is NonNullable<typeof full> => !!full?.content)
      .map(full => ({ chapterNumber: full.chapterNumber, content: full.content, summary: full.summary }));
    chapterData.push({ chapterNumber, content: polishedText, summary: '' });

    const charNames = characters.flatMap(c => [c.name, ...(c.aliases ?? [])]);
    const auditResult = auditCrossChapterConsistency(chapterData, charNames);

    if (auditResult.errorCount > 0) {
      const auditLog = createLogger('cross-chapter-audit');
      auditLog.warn(`第${chapterNumber}章审计发现 ${auditResult.errorCount} 个一致性错误`);
      for (const issue of auditResult.issues) {
        auditLog.warn(`  [${issue.type}] ${issue.description}`);
      }
    }
  } catch (err) {
    postLog.debug('跨章节审计失败', { reason: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * 大纲自动修正：检测偏离并回写未来章节大纲。
 */
async function runOutlineAutoCorrection(params: PostProcessingParams): Promise<void> {
  const { novelId, chapterNumber, novelManager, storyStateManager } = params;
  if (!storyStateManager) return;
  try {
    const storyState = await storyStateManager.getState(novelId);
    const latestSnapshot = storyState.snapshots[storyState.snapshots.length - 1];
    if (!latestSnapshot) return;

    const outlineData = await novelManager.getOutline(novelId);
    const futureOutlines = outlineData.chapters
      .filter(ch => ch.chapterNumber > chapterNumber)
      .map(ch => ({ chapterNumber: ch.chapterNumber, summary: ch.summary || '', keyEvents: ch.keyEvents }));
    const corrections = analyzeOutlineCorrections(latestSnapshot, chapterNumber, futureOutlines);

    if (corrections.corrections.length > 0) {
      const corrLog = createLogger('outline-correction');
      corrLog.warn(buildCorrectionReport(corrections));
      for (const corr of corrections.corrections) {
        const entry = outlineData.chapters.find(ch => ch.chapterNumber === corr.chapterNumber);
        if (!entry) continue;
        const tag = `[自动修正·第${chapterNumber}章后] ${corr.suggestion}`;
        entry.notes = entry.notes ? `${entry.notes}\n${tag}` : tag;
      }
      await novelManager.saveOutline(novelId, outlineData);
    }
  } catch (err) {
    postLog.debug('大纲修正检测失败', { reason: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * 增量更新事实图谱。
 */
async function runFactGraphUpdate(params: PostProcessingParams): Promise<void> {
  const { novelId, chapterNumber, polishedText, characters, novelManager } = params;
  if (!novelManager.getFactGraph || !novelManager.saveFactGraph) return;
  try {
    const characterNames = characters.flatMap(c => [c.name, ...(c.aliases ?? [])]);
    const facts = extractFactsFromChapter({
      chapterContent: polishedText,
      chapterNumber,
      characterNames,
    });
    const graph = await novelManager.getFactGraph(novelId);
    const cleaned = {
      ...graph,
      characterAppearances: graph.characterAppearances.filter(a => a.chapterNumber !== chapterNumber),
      itemTimeline: graph.itemTimeline.filter(i => i.chapterNumber !== chapterNumber),
      locationVisits: graph.locationVisits.filter(v => v.chapterNumber !== chapterNumber),
      timelineEvents: graph.timelineEvents.filter(e => e.chapterNumber !== chapterNumber),
      characterStateChanges: graph.characterStateChanges.filter(s => s.chapterNumber !== chapterNumber),
      factEvents: (graph.factEvents ?? []).filter(event => event.chapterNumber !== chapterNumber),
    };
    const updated = mergeFactsIntoGraph(cleaned, facts, chapterNumber);
    await novelManager.saveFactGraph(novelId, updated);
  } catch (err) {
    postLog.debug('事实图谱更新失败', { reason: err instanceof Error ? err.message : String(err) });
  }
}

async function runChapterDiagnosticsAudit(params: PostProcessingParams): Promise<void> {
  const { novelId, chapterNumber, polishedText, characters, novelManager } = params;
  try {
    const [novel, chapter, previousChapter, worldEntries] = await Promise.all([
      novelManager.getNovel(novelId),
      novelManager.getChapter(novelId, chapterNumber),
      chapterNumber > 1 ? novelManager.getChapter(novelId, chapterNumber - 1).catch(() => null) : Promise.resolve(null),
      novelManager.getWorldEntries(novelId),
    ]);
    if (!chapter) return;
    const narrativeAudit = auditChapterNarrativeUsage({
      chapterContent: polishedText,
      worldEntries,
      characters,
    });
    if (novelManager.saveWorldEntry) {
      await persistWorldUsageUpdates({
        entries: worldEntries,
        audit: narrativeAudit,
        chapterNumber,
        saveEntry: entry => novelManager.saveWorldEntry!(novelId, entry),
      });
    }
    chapter.diagnostics = mergeNarrativeAuditIntoDiagnostics(chapter, narrativeAudit);
    const genreDrift = auditGenreDrift({
      chapterContent: polishedText,
      title: novel.title,
      synopsis: novel.synopsis,
      genre: novel.genre,
      tags: novel.tags,
      constitutionTags: novel.constitutionTags,
      promiseContract: buildNovelPromiseContract(novel),
    });
    const readabilityAudit = auditChapterReadability({
      chapterContent: polishedText,
      readerScore: chapter.readerScore,
      previousReaderScore: previousChapter?.readerScore,
      qualityGate: chapter.diagnostics?.qualityGate,
      genreDrift,
    });
    chapter.diagnostics = mergeReadabilityAuditIntoDiagnostics(chapter, readabilityAudit);
    await novelManager.saveChapter(novelId, chapter);
    postLog.debug('章节叙事与可读性审计已写入章节诊断', {
      chapterNumber,
      summary: summarizeNarrativeAudit(narrativeAudit),
      readabilityIssues: readabilityAudit.issues,
    });
  } catch (err) {
    postLog.debug('章节叙事与可读性审计失败', { reason: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * 执行所有后处理任务（审计 + 大纲修正 + 事实图谱，并行执行）。
 */
export async function runAllPostProcessing(params: PostProcessingParams): Promise<void> {
  await Promise.all([
    runCrossChapterAudit(params),
    runOutlineAutoCorrection(params),
    runFactGraphUpdate(params),
    runChapterDiagnosticsAudit(params),
  ]);
}
