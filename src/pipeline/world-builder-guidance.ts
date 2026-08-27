const UNSAFE_HEADING_RE = /(?:作者心中有数|新增设定建议|待确认(?:设定|提案)|非正史提案|备选方案|长期知识缺口)/;

type MarkdownHeading = {
  level: number;
  title: string;
};

function parseHeading(line: string): MarkdownHeading | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return {
    level: match[1].length,
    title: match[2].trim(),
  };
}

/**
 * Removes proposal/secret sections from the chapter-scoped world-builder output.
 * Canonical world cards remain the only hard world constraints passed to Writer.
 */
export function stripUnconfirmedWorldSections(content: string): string {
  const kept: string[] = [];
  let blockedLevel: number | null = null;

  for (const line of content.split(/\r?\n/)) {
    const heading = parseHeading(line);
    if (heading) {
      if (blockedLevel != null && heading.level <= blockedLevel) {
        blockedLevel = null;
      }
      if (UNSAFE_HEADING_RE.test(heading.title)) {
        blockedLevel = heading.level;
        continue;
      }
    }

    if (blockedLevel == null) {
      kept.push(line);
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildWriterWorldGuidance(content: string): string | undefined {
  const safeContent = stripUnconfirmedWorldSections(content);
  if (!safeContent) return undefined;

  return [
    '以下内容仅用于辅助本章落地，不是新的世界观正史。',
    '只采用与章节大纲、已有世界观约束或前文事实一致的部分；不得据此新增年代、势力、能力、幕后真相或精确数值。',
    safeContent,
  ].join('\n');
}
