/**
 * 跨章节一致性审计。
 *
 * 当前为轻量规则审计，重点用于发现明显的状态矛盾：
 * - 角色已经死亡或离场，后续章节又大量出现
 * - 通过简单上下文过滤，尽量避开“回忆/曾经”这类闪回提及
 *
 * 结果只作为警告上下文，不阻断主流程。
 */

export type ConsistencyIssue = {
  type: 'name' | 'location' | 'timeline' | 'status';
  severity: 'error' | 'warning';
  description: string;
  chapters: number[];
};

export type AuditResult = {
  issues: ConsistencyIssue[];
  errorCount: number;
  warningCount: number;
};

type ChapterData = {
  chapterNumber: number;
  content: string;
  summary?: string;
};

/** Death/departure markers */
const DEATH_MARKERS = ['dead', 'died', 'death', 'killed', 'fallen'];
const DEPARTURE_MARKERS = ['left', 'departed', 'disappeared', 'missing', 'sealed'];

/** Cache regex patterns to avoid rebuilding them for every chapter scan. */
const statusPatternCache = new Map<string, RegExp>();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStatusPattern(name: string, marker: string): RegExp {
  const key = `${name}|${marker}`;
  let re = statusPatternCache.get(key);
  if (!re) {
    re = new RegExp(escapeRegex(name) + '.{0,10}' + marker);
    statusPatternCache.set(key, re);
  }
  return re;
}

/**
 * Detect characters who died/departed but reappear later
 */
function detectStatusContradictions(
  chapters: ChapterData[],
  knownNames: string[],
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const deadOrGone = new Map<string, number>(); // name -> chapter where they died/left

  for (const ch of chapters) {
    const text = ch.content || ch.summary || '';

    for (const name of knownNames) {
      if (name.length < 2) continue;
      if (!text.includes(name)) continue;

      // Check if this character died/departed in this chapter
      const isDead = DEATH_MARKERS.some(m => getStatusPattern(name, m).test(text));
      const isDeparted = DEPARTURE_MARKERS.some(m => getStatusPattern(name, m).test(text));

      if (isDead || isDeparted) {
        deadOrGone.set(name, ch.chapterNumber);
      }
    }
  }

  // Check if dead/gone characters reappear with significant presence
  for (const ch of chapters) {
    const text = ch.content || ch.summary || '';
    for (const [name, deathChapter] of deadOrGone) {
      if (ch.chapterNumber <= deathChapter) continue;
      const count = text.split(name).length - 1;
      // Significant presence (not just a memory/flashback mention)
      if (count >= 3) {
        // Check if it's a flashback context
        const isFlashback = text.includes('回忆') || text.includes('想起') || text.includes('曾经');
        if (!isFlashback) {
          issues.push({
            type: 'status',
            severity: 'error',
            description: `“${name}”在第 ${deathChapter} 章已死亡或离场，但在第 ${ch.chapterNumber} 章大量出现（${count} 次），可能存在状态矛盾`,
            chapters: [deathChapter, ch.chapterNumber],
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Run full cross-chapter audit
 */
export function auditCrossChapterConsistency(
  chapters: ChapterData[],
  knownCharacterNames: string[],
): AuditResult {
  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const issues: ConsistencyIssue[] = [];

  // 1. Status contradictions (dead characters reappearing)
  issues.push(...detectStatusContradictions(sorted, knownCharacterNames));

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return { issues, errorCount, warningCount };
}

