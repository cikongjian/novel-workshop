/**
 * 大纲自动修正器
 *
 * 根据实际生成内容反向更新大纲：
 * - 角色死亡 → 标记后续大纲中该角色的出场为无效
 * - 势力覆灭 → 标记相关势力剧情为需修改
 * - 情节偏离 → 标记偏离的大纲条目
 */

import type { StoryStateSnapshot } from '../novel/story-state-types.js';

export type OutlineCorrection = {
  chapterNumber: number;
  type: 'character-unavailable' | 'faction-changed' | 'plot-deviation' | 'timeline-shift';
  description: string;
  /** The original outline text that needs correction */
  originalText?: string;
  /** Suggested replacement or note */
  suggestion: string;
};

export type OutlineCorrectionResult = {
  corrections: OutlineCorrection[];
  /** Chapters that need outline revision */
  affectedChapters: number[];
};

type ChapterOutlineEntry = {
  chapterNumber: number;
  summary: string;
  keyEvents?: string[];
};

/**
 * Analyze story state snapshots and compare against future outline entries
 * to detect needed corrections.
 */
export function analyzeOutlineCorrections(
  latestSnapshot: StoryStateSnapshot,
  currentChapter: number,
  futureOutlines: ChapterOutlineEntry[],
): OutlineCorrectionResult {
  const corrections: OutlineCorrection[] = [];
  const affectedChapters = new Set<number>();

  // 1. Dead/unavailable characters
  const unavailableChars: string[] = [];
  if (latestSnapshot.characters) {
    for (const char of latestSnapshot.characters) {
      if (char.alive === false || char.present === false) {
        unavailableChars.push(char.name);
      }
    }
  }

  for (const outline of futureOutlines) {
    if (outline.chapterNumber <= currentChapter) continue;
    const text = [outline.summary, ...(outline.keyEvents ?? [])].join(' ');

    for (const charName of unavailableChars) {
      if (text.includes(charName)) {
        corrections.push({
          chapterNumber: outline.chapterNumber,
          type: 'character-unavailable',
          description: `「${charName}」已在第${currentChapter}章前死亡或离场，但第${outline.chapterNumber}章大纲仍包含该角色`,
          originalText: outline.summary,
          suggestion: `需要移除或替换「${charName}」的相关情节，或改为回忆/闪回形式`,
        });
        affectedChapters.add(outline.chapterNumber);
      }
    }
  }

  // 2. Collapsed factions
  if (latestSnapshot.factions) {
    const collapsedFactions = latestSnapshot.factions
      .filter(f => f.phase === 'collapsed')
      .map(f => f.factionName);

    for (const outline of futureOutlines) {
      if (outline.chapterNumber <= currentChapter) continue;
      const text = [outline.summary, ...(outline.keyEvents ?? [])].join(' ');

      for (const factionName of collapsedFactions) {
        if (text.includes(factionName)) {
          corrections.push({
            chapterNumber: outline.chapterNumber,
            type: 'faction-changed',
            description: `「${factionName}」已覆灭，但第${outline.chapterNumber}章大纲仍涉及该势力`,
            originalText: outline.summary,
            suggestion: `需要调整「${factionName}」相关情节，可改为残余势力、继承者或新势力`,
          });
          affectedChapters.add(outline.chapterNumber);
        }
      }
    }
  }

  return {
    corrections,
    affectedChapters: [...affectedChapters].sort((a, b) => a - b),
  };
}

/**
 * Build a human-readable correction report
 */
export function buildCorrectionReport(result: OutlineCorrectionResult): string {
  if (result.corrections.length === 0) return '';

  const lines: string[] = [`大纲自动修正检测到 ${result.corrections.length} 处需要更新：`];

  for (const c of result.corrections) {
    const typeLabel = {
      'character-unavailable': '角色不可用',
      'faction-changed': '势力变动',
      'plot-deviation': '情节偏离',
      'timeline-shift': '时间线偏移',
    }[c.type];
    lines.push(`\n第${c.chapterNumber}章 [${typeLabel}]`);
    lines.push(`  问题：${c.description}`);
    lines.push(`  建议：${c.suggestion}`);
  }

  return lines.join('\n');
}
