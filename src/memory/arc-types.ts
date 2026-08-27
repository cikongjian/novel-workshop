export type ArcSummary = {
  arcNumber: number;
  chapterRange: { start: number; end: number };
  plotProgression: string;
  characterArcs: Array<{
    name: string;
    progression: string;
  }>;
  worldChanges: string;
  unresolvedThreads: string[];
  keyTurningPoints: string[];
};

/**
 * 解析 Agent 原始输出为 ArcSummary。
 * 兼容 markdown 代码块包裹和前缀文本。
 */
export function parseArcSummary(raw: string): ArcSummary | null {
  let jsonStr = raw.trim();

  // 去除 markdown 代码块
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 尝试提取第一个 JSON 对象
  const braceStart = jsonStr.indexOf('{');
  if (braceStart > 0) {
    jsonStr = jsonStr.slice(braceStart);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      arcNumber: typeof parsed.arcNumber === 'number' ? parsed.arcNumber : 0,
      chapterRange: parsed.chapterRange && typeof parsed.chapterRange.start === 'number'
        ? { start: parsed.chapterRange.start, end: parsed.chapterRange.end }
        : { start: 0, end: 0 },
      plotProgression: typeof parsed.plotProgression === 'string' ? parsed.plotProgression : '',
      characterArcs: Array.isArray(parsed.characterArcs)
        ? parsed.characterArcs
            .filter((c: Record<string, unknown>) => c && typeof c.name === 'string')
            .slice(0, 5)
        : [],
      worldChanges: typeof parsed.worldChanges === 'string' ? parsed.worldChanges : '',
      unresolvedThreads: Array.isArray(parsed.unresolvedThreads)
        ? parsed.unresolvedThreads.filter((t: unknown) => typeof t === 'string')
        : [],
      keyTurningPoints: Array.isArray(parsed.keyTurningPoints)
        ? parsed.keyTurningPoints.filter((t: unknown) => typeof t === 'string').slice(0, 3)
        : [],
    };
  } catch {
    return null;
  }
}
