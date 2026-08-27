import { ChapterOutline, OutlineData, type OutlineData as OutlineDataValue } from './types.js';
import type { PlotBranchNode } from './plot-branch-types.js';

function riskLevelLabel(level: PlotBranchNode['riskLevel']): string {
  switch (level) {
    case 'low':
      return '低';
    case 'high':
      return '高';
    default:
      return '中';
  }
}

export function buildPlotBranchOutlineNote(node: PlotBranchNode): string {
  const characterImpactLine = node.characterImpacts.length > 0
    ? `角色影响：${node.characterImpacts.map(item => `${item.name}：${item.impact}`).join('；')}`
    : '';

  return [
    `【剧情分支】${node.title}`,
    node.description ? `分支说明：${node.description}` : '',
    node.impactPrediction ? `影响预测：${node.impactPrediction}` : '',
    characterImpactLine,
    `风险等级：${riskLevelLabel(node.riskLevel)}`,
  ].filter(Boolean).join('\n');
}

function appendUniqueNote(existing: string, addition: string): string {
  const trimmedExisting = existing.trim();
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) return trimmedExisting;
  if (!trimmedExisting) return trimmedAddition;
  if (trimmedExisting.includes(trimmedAddition)) return trimmedExisting;
  return `${trimmedExisting}\n\n${trimmedAddition}`;
}

export function applyPlotBranchToOutline(
  outline: OutlineDataValue,
  node: PlotBranchNode,
): OutlineDataValue {
  const note = buildPlotBranchOutlineNote(node);
  const existingChapter = outline.chapters.find(chapter => chapter.chapterNumber === node.chapterNumber);

  if (existingChapter) {
    const chapters = outline.chapters.map((chapter) => {
      if (chapter.chapterNumber !== node.chapterNumber) return chapter;
      return ChapterOutline.parse({
        ...chapter,
        title: chapter.title || node.title,
        notes: appendUniqueNote(chapter.notes ?? '', note),
      });
    });
    return OutlineData.parse({ ...outline, chapters });
  }

  const chapters = [...outline.chapters, ChapterOutline.parse({
    chapterNumber: node.chapterNumber,
    title: node.title,
    summary: '',
    beats: [],
    tensionTarget: 5,
    plotThreadsAdvanced: [],
    keyEvents: [],
    notes: note,
  })].sort((left, right) => left.chapterNumber - right.chapterNumber);

  return OutlineData.parse({ ...outline, chapters });
}
