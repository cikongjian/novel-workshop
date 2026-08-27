import type { AgentContext } from '../../../../agents/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { evaluateQualityGate } from '../../../../pipeline/quality-gate.js';
import type {
  AgentSkillAbComparison,
  AgentSkillAbSample,
  AgentSkillAbScore,
} from './commercial-ab-test-types.js';

const DEFAULT_AB_SAMPLES: AgentSkillAbSample[] = [
  { label: '末世奇幻', novelId: '5c06ea3f-ee7e-49c6-b10d-0f8fc6bc5f2b', chapterNumber: 5 },
  { label: '历史', novelId: 'b10c5e6a-b48b-4bf2-9366-8104a35b65a4', chapterNumber: 11 },
  { label: '悬疑', novelId: 'f8c78400-9f37-4935-bea7-8fe5a30c80da', chapterNumber: 3 },
];

type AbScoreRow = {
  sample: AgentSkillAbSample;
  score: AgentSkillAbScore;
  skillCount: number;
};

export function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function toAbScore(report: ReturnType<typeof evaluateQualityGate>): AgentSkillAbScore {
  return {
    overall: Number(report.overallScore ?? 0),
    structure: Number(report.structureScore ?? 0),
    style: Number(report.styleScore ?? 0),
    emotion: Number(report.emotionScore ?? 0),
    summary: report.summary,
  };
}

export async function pickAbSamples(
  novelManager: NovelManager,
  sampleCount: number,
): Promise<AgentSkillAbSample[]> {
  const picked: AgentSkillAbSample[] = [];
  const seen = new Set<string>();

  for (const sample of DEFAULT_AB_SAMPLES) {
    if (picked.length >= sampleCount) break;
    const chapter = await novelManager.getChapter(sample.novelId, sample.chapterNumber);
    if (!chapter) continue;
    picked.push(sample);
    seen.add(sample.novelId);
  }

  if (picked.length >= sampleCount) return picked;

  const novels = await novelManager.listNovels();
  for (const novel of novels) {
    if (picked.length >= sampleCount) break;
    if (seen.has(novel.id)) continue;

    const chapters = await novelManager.listChapters(novel.id);
    if (chapters.length === 0) continue;
    const sorted = [...chapters].sort((a, b) => b.chapterNumber - a.chapterNumber);
    const candidate = sorted.find(item => item.status !== 'outlined') ?? sorted[0];
    const chapter = await novelManager.getChapter(novel.id, candidate.chapterNumber);
    if (!chapter) continue;

    picked.push({
      label: novel.title || novel.id,
      novelId: novel.id,
      chapterNumber: candidate.chapterNumber,
    });
  }

  return picked;
}

export function buildScenePlan(
  beats: Array<{ summary?: string }> | undefined,
): string {
  return (beats ?? [])
    .slice(0, 8)
    .map((beat, index) => `- 场景${index + 1}：${String(beat.summary ?? '').trim()}`)
    .filter(line => line.length > 8)
    .join('\n');
}

export async function buildWriterContext(
  novelManager: NovelManager,
  sample: AgentSkillAbSample,
): Promise<{ context: AgentContext; scenePlan: string; genre: string }> {
  const [novel, outline, characters, worldEntries, prevChapter] = await Promise.all([
    novelManager.getNovel(sample.novelId),
    novelManager.getOutline(sample.novelId),
    novelManager.getCharacters(sample.novelId),
    novelManager.getWorldEntries(sample.novelId),
    sample.chapterNumber > 1 ? novelManager.getChapter(sample.novelId, sample.chapterNumber - 1) : Promise.resolve(null),
  ]);

  const chapterOutline = outline.chapters.find(item => item.chapterNumber === sample.chapterNumber);
  const scenePlan = buildScenePlan(chapterOutline?.beats);

  const outlineContext = [
    `章节标题：${chapterOutline?.title?.trim() || `第${sample.chapterNumber}章`}`,
    `章节摘要：${chapterOutline?.summary?.trim() || '无'}`,
    scenePlan ? `场景节拍：\n${scenePlan}` : '',
  ].filter(Boolean).join('\n');

  const characterContext = characters
    .slice(0, 8)
    .map(character => {
      const detail = character.personality || character.currentState || character.motivation || '待补充';
      return `- ${character.name}：${String(detail).slice(0, 80)}`;
    })
    .join('\n');

  const worldContext = worldEntries
    .slice(0, 8)
    .map(entry => `- ${entry.name}：${String(entry.description ?? '').slice(0, 100)}`)
    .join('\n');

  return {
    context: {
      novelId: sample.novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber: sample.chapterNumber,
      userDirection: chapterOutline?.summary
        ? `严格围绕本章摘要推进：${chapterOutline.summary}`
        : `延续既有剧情，推进主冲突与人物选择，完成第 ${sample.chapterNumber} 章。`,
      outlineContext,
      scenePlan,
      worldContext,
      characterContext,
      previousChapterSummary: prevChapter?.summary ?? '',
      maxWordCount: 2200,
    },
    scenePlan,
    genre: novel.genre,
  };
}

export function buildAbComparisons(
  baselineRows: AbScoreRow[],
  enhancedRows: AbScoreRow[],
): AgentSkillAbComparison[] {
  return baselineRows.map((beforeRow, index) => {
    const afterRow = enhancedRows[index];
    return {
      label: beforeRow.sample.label,
      novelId: beforeRow.sample.novelId,
      chapterNumber: beforeRow.sample.chapterNumber,
      skillCountBefore: beforeRow.skillCount,
      skillCountAfter: afterRow.skillCount,
      before: beforeRow.score,
      after: afterRow.score,
      delta: {
        overall: round1(afterRow.score.overall - beforeRow.score.overall),
        structure: round1(afterRow.score.structure - beforeRow.score.structure),
        style: round1(afterRow.score.style - beforeRow.score.style),
        emotion: round1(afterRow.score.emotion - beforeRow.score.emotion),
      },
    };
  });
}

export function computeAverageDelta(comparisons: AgentSkillAbComparison[]): {
  overall: number;
  structure: number;
  style: number;
  emotion: number;
} {
  const aggregate = comparisons.reduce(
    (acc, item) => {
      acc.overall += item.delta.overall;
      acc.structure += item.delta.structure;
      acc.style += item.delta.style;
      acc.emotion += item.delta.emotion;
      return acc;
    },
    { overall: 0, structure: 0, style: 0, emotion: 0 },
  );

  return {
    overall: round1(aggregate.overall / comparisons.length),
    structure: round1(aggregate.structure / comparisons.length),
    style: round1(aggregate.style / comparisons.length),
    emotion: round1(aggregate.emotion / comparisons.length),
  };
}
