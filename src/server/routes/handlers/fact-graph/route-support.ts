import type { NextFunction, Request, Response } from 'express';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { Contradiction, ContradictionEvidence, FactGraph } from '../../../../novel/fact-graph-types.js';
import { extractFactsFromChapter, mergeFactsIntoGraph } from '../../../../novel/fact-graph-builder.js';
import { detectContradictions } from '../../../../pipeline/fact-graph-auditor.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';

const severityRank: Record<Contradiction['severity'], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export function createEmptyFactGraph(novelId: string): FactGraph {
  return {
    novelId,
    lastUpdatedChapter: 0,
    characterAppearances: [],
    itemTimeline: [],
    locationVisits: [],
    timelineEvents: [],
    relationshipChanges: [],
    characterStateChanges: [],
    factEvents: [],
    updatedAt: new Date().toISOString(),
  };
}

export function sendDeprecated(res: Response, code: string, error: string): void {
  res.status(410).json({ error, code });
}

export function createFactGraphAccessMiddleware(novelManager: NovelManager) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const novelId = Array.isArray(req.params.novelId) ? req.params.novelId[0] : req.params.novelId;
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    next();
  };
}

function mergeEvidenceDetails(items: ContradictionEvidence[]): ContradictionEvidence[] {
  const seen = new Set<string>();
  const merged: ContradictionEvidence[] = [];
  for (const item of items) {
    const key = `${item.chapterNumber}:${item.label}:${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function aggregateContradictions(contradictions: Contradiction[]): Contradiction[] {
  const grouped = new Map<string, Contradiction[]>();

  for (const contradiction of contradictions) {
    const anchor = contradiction.anchorChapterNumber ?? contradiction.chapterNumbers[0] ?? 0;
    const shouldGroup = contradiction.type === 'character-resurrection' || contradiction.type === 'item-reuse-after-destroy';
    const key = shouldGroup
      ? `${contradiction.type}:${contradiction.entityName}:${anchor}`
      : contradiction.id;

    const bucket = grouped.get(key) ?? [];
    bucket.push(contradiction);
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((items) => {
    if (items.length === 1) return items[0];
    const base = items[0];
    const chapterNumbers = [...new Set(items.flatMap((item) => item.chapterNumbers))].sort((a, b) => a - b);
    const evidence = [...new Set(items.flatMap((item) => item.evidence))];
    const evidenceDetails = mergeEvidenceDetails(items.flatMap((item) => item.evidenceDetails ?? []));
    const highestSeverity = items.reduce(
      (winner, current) => (severityRank[current.severity] > severityRank[winner] ? current.severity : winner),
      base.severity,
    );
    const confidence = Math.max(...items.map((item) => item.confidence ?? 0.5));
    const reappearChapters = chapterNumbers.filter((chapter) => chapter !== base.anchorChapterNumber);

    let description = base.description;
    if (base.type === 'character-resurrection' && base.entityName && base.anchorChapterNumber) {
      description = `角色「${base.entityName}」在第${base.anchorChapterNumber}章已明确死亡，但在第${reappearChapters.join('、')}章再次以在场形态出现`;
    }
    if (base.type === 'item-reuse-after-destroy' && base.entityName && base.anchorChapterNumber) {
      description = `物品「${base.entityName}」在第${base.anchorChapterNumber}章损毁后，又在第${reappearChapters.join('、')}章再次出现`;
    }

    return {
      ...base,
      chapterNumbers,
      severity: highestSeverity,
      confidence,
      description,
      evidence,
      evidenceDetails,
    };
  }).sort((a, b) => {
    const severityGap = severityRank[b.severity] - severityRank[a.severity];
    if (severityGap !== 0) return severityGap;
    return (a.chapterNumbers[0] ?? 0) - (b.chapterNumbers[0] ?? 0);
  });
}

function extractSemanticSnippet(text: string, keyword: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const index = normalized.indexOf(keyword);
  if (index < 0) return normalized.slice(0, 120);
  const start = Math.max(0, index - 32);
  const end = Math.min(normalized.length, index + 88);
  return normalized.slice(start, end);
}

async function enrichContradictionsWithSemanticSignals(
  novelId: string,
  contradictions: Contradiction[],
  novelMemory?: NovelMemory,
): Promise<Contradiction[]> {
  if (!novelMemory || contradictions.length === 0) return contradictions;

  const enriched: Contradiction[] = [];
  for (const contradiction of contradictions) {
    const currentChapter = Math.max(...contradiction.chapterNumbers);
    const anchorChapter = contradiction.anchorChapterNumber ?? contradiction.chapterNumbers[0] ?? currentChapter;
    let query = '';
    let supportKeywords: string[] = [];
    let counterKeywords: string[] = [];

    if (contradiction.type === 'character-resurrection' && contradiction.entityName) {
      query = `${contradiction.entityName} 复活 假死 苏醒 救活 回忆 梦中 尸体`;
      supportKeywords = ['复活', '苏醒', '救活', '假死'];
      counterKeywords = ['回忆', '梦中', '尸体', '遗体'];
    } else if (contradiction.type === 'timeline-regression') {
      query = '回忆 闪回 当年 曾经';
      counterKeywords = ['回忆', '闪回', '当年', '曾经'];
    }

    if (!query) {
      enriched.push(contradiction);
      continue;
    }

    try {
      const [chapterResults, factResults] = await Promise.all([
        novelMemory.debugSearch(novelId, query, 'chapter', 6),
        novelMemory.debugSearch(novelId, query, 'fact', 6),
      ]);
      const relevant = [...factResults, ...chapterResults].filter((result) => (
        (result.chapterNumber ?? 0) >= anchorChapter
        && (result.chapterNumber ?? 0) <= currentChapter
      ));

      const evidenceDetails = [...(contradiction.evidenceDetails ?? [])];
      let adjusted = contradiction;

      for (const keyword of supportKeywords) {
        const hit = relevant.find((result) => result.text.includes(keyword) && (!contradiction.entityName || result.text.includes(contradiction.entityName)));
        if (!hit) continue;
        evidenceDetails.push({
          chapterNumber: hit.chapterNumber ?? currentChapter,
          label: '语义召回: 可能存在解释',
          text: extractSemanticSnippet(hit.text, keyword),
          sourceType: 'semantic-support',
        });
        adjusted = {
          ...adjusted,
          severity: adjusted.severity === 'critical' ? 'warning' : adjusted.severity,
          confidence: Math.max(0.25, adjusted.confidence - 0.18),
        };
        break;
      }

      for (const keyword of counterKeywords) {
        const hit = relevant.find((result) => result.text.includes(keyword));
        if (!hit) continue;
        evidenceDetails.push({
          chapterNumber: hit.chapterNumber ?? currentChapter,
          label: '语义召回: 可能是非在场提及',
          text: extractSemanticSnippet(hit.text, keyword),
          sourceType: 'semantic-counterevidence',
        });
        adjusted = {
          ...adjusted,
          confidence: Math.max(0.2, adjusted.confidence - 0.12),
        };
        break;
      }

      enriched.push({
        ...adjusted,
        evidenceDetails: mergeEvidenceDetails(evidenceDetails),
      });
    } catch {
      enriched.push(contradiction);
    }
  }

  return enriched;
}

export async function buildContradictions(
  novelId: string,
  novelManager: NovelManager,
  novelMemory?: NovelMemory,
): Promise<Contradiction[]> {
  const chapters = await novelManager.listChapters(novelId);
  const characters = await novelManager.getCharacters(novelId);
  const characterNames = characters.map((character) => character.name);
  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);

  let prefixGraph = createEmptyFactGraph(novelId);
  const contradictions: Contradiction[] = [];

  for (const chapterMeta of sorted) {
    const chapter = await novelManager.getChapter(novelId, chapterMeta.chapterNumber);
    if (!chapter) continue;

    const facts = extractFactsFromChapter({
      chapterContent: chapter.content,
      chapterNumber: chapterMeta.chapterNumber,
      characterNames,
    });
    contradictions.push(...detectContradictions(prefixGraph, facts, chapterMeta.chapterNumber));
    prefixGraph = mergeFactsIntoGraph(prefixGraph, facts, chapterMeta.chapterNumber);
  }

  const aggregated = aggregateContradictions(contradictions.filter((item) => !item.resolved));
  return enrichContradictionsWithSemanticSignals(novelId, aggregated, novelMemory);
}
