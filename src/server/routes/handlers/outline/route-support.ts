import { z } from 'zod';
import type { OutlineData, PlotThread } from '../../../../novel/types.js';

function isSimilarName(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (longer.includes(shorter)) return true;
  if (shorter.length >= 4 && longer.length <= shorter.length * 1.5) {
    let common = 0;
    for (let i = 0; i <= shorter.length - 2; i++) {
      if (longer.includes(shorter.slice(i, i + 2))) common++;
    }
    return common / (shorter.length - 1) >= 0.7;
  }
  return false;
}

export function deduplicatePlotThreads(threads: PlotThread[]): PlotThread[] {
  const result: PlotThread[] = [];
  const seen = new Map<string, number>();

  for (const thread of threads) {
    const norm = thread.name.replace(/\s+/g, '');
    if (seen.has(norm)) continue;

    let merged = false;
    for (const [existingNorm, idx] of seen) {
      if (isSimilarName(norm, existingNorm)) {
        const existing = result[idx];
        const keepExisting =
          (existing.plantedInChapter ?? Infinity) <= (thread.plantedInChapter ?? Infinity);
        if (!keepExisting) {
          result[idx] = {
            ...thread,
            relatedCharacters: [...new Set([...existing.relatedCharacters, ...thread.relatedCharacters])],
          };
          seen.delete(existingNorm);
          seen.set(norm, idx);
        } else {
          result[idx] = {
            ...existing,
            relatedCharacters: [...new Set([...existing.relatedCharacters, ...thread.relatedCharacters])],
          };
        }
        merged = true;
        break;
      }
    }

    if (!merged) {
      seen.set(norm, result.length);
      result.push(thread);
    }
  }
  return result;
}

export function extractTensionFromSummary(summary: string): number {
  if (!summary) return 5;

  const tensionPattern = /\*{0,2}紧张度\*{0,2}[：:]\s*(\d+(?:\.\d+)?)/g;
  const tensions: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = tensionPattern.exec(summary)) !== null) {
    const value = parseFloat(match[1]);
    if (value >= 0 && value <= 10) {
      tensions.push(value);
    }
  }

  if (tensions.length === 0) return 5;

  const avg = tensions.reduce((sum, value) => sum + value, 0) / tensions.length;
  return Math.round(avg * 10) / 10;
}

export function extractTitleFromSummary(summary: string): string {
  if (!summary) return '';

  const titleMatch = summary.match(/^#\s*(?:《[^》]+》)?第\d+章[：:\s]+(.+)$/m);
  if (titleMatch) {
    const title = titleMatch[1].trim().replace(/^大纲\s*/, '');
    if (title) return title;
  }

  const quoteMatch = summary.match(/\*{2}[""「]([^""」]+)[""」]\*{2}/);
  if (quoteMatch) return quoteMatch[1];

  const themeMatch = summary.match(/#{2,4}\s*章节主题\s*\n+(.+)/);
  if (themeMatch) {
    let theme = themeMatch[1].trim();
    theme = theme.replace(/\*{1,2}/g, '').replace(/[""「」]/g, '');
    const punct = theme.search(/[，。,\.——]/);
    if (punct > 0 && punct <= 20) {
      theme = theme.slice(0, punct);
    } else if (theme.length > 20) {
      theme = theme.slice(0, 20);
    }
    if (theme) return theme;
  }

  return '';
}

export function extractKeyEventsFromSummary(summary: string): string[] {
  if (!summary) return [];

  const scenePattern = /#{1,4}\s*场景\s*\d+[：:]\s*(.+)/g;
  const events: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = scenePattern.exec(summary)) !== null) {
    const title = match[1].trim();
    if (title) {
      events.push(title);
    }
  }

  return events;
}

export function backfillOutlineData(outline: OutlineData): boolean {
  let modified = false;

  for (const chapter of outline.chapters) {
    if (!chapter.summary) continue;

    if (chapter.tensionTarget === 5) {
      const extracted = extractTensionFromSummary(chapter.summary);
      if (extracted !== 5) {
        chapter.tensionTarget = extracted;
        modified = true;
      }
    }

    if (!chapter.title) {
      const title = extractTitleFromSummary(chapter.summary);
      if (title) {
        chapter.title = title;
        modified = true;
      }
    }

    if (chapter.keyEvents.length === 0) {
      const events = extractKeyEventsFromSummary(chapter.summary);
      if (events.length > 0) {
        chapter.keyEvents = events;
        modified = true;
      }
    }
  }

  return modified;
}

export const UpdateOutlineBody = z.object({
  chapters: z.array(z.object({
    chapterNumber: z.number().int().positive(),
    title: z.string().default(''),
    summary: z.string().default(''),
    beats: z.array(z.object({
      id: z.string().uuid(),
      summary: z.string(),
      characters: z.array(z.string().uuid()).default([]),
      location: z.string().default(''),
      tension: z.number().min(0).max(10).default(5),
      notes: z.string().default(''),
    })).default([]),
    tensionTarget: z.number().min(0).max(10).default(5),
    plotThreadsAdvanced: z.array(z.string().uuid()).default([]),
    keyEvents: z.array(z.string()).default([]),
    notes: z.string().default(''),
  })).optional(),
  plotThreads: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string(),
    status: z.enum(['planted', 'developing', 'climax', 'resolved', 'abandoned']),
    plantedInChapter: z.number().int().optional(),
    resolvedInChapter: z.number().int().optional(),
    relatedCharacters: z.array(z.string().uuid()).default([]),
    notes: z.string().default(''),
    prerequisites: z.array(z.string().uuid()).default([]),
    parallelThreads: z.array(z.string().uuid()).default([]),
    mergeTarget: z.string().uuid().optional(),
  })).optional(),
  foreshadowing: z.array(z.object({
    id: z.string().uuid(),
    hint: z.string(),
    plantedInChapter: z.number().int(),
    plantedInParagraph: z.number().int().optional(),
    resolution: z.string().default(''),
    resolvedInChapter: z.number().int().optional(),
    isResolved: z.boolean().default(false),
    relatedPlotThreads: z.array(z.string().uuid()).default([]),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
  })).optional(),
});

export const UpdateForeshadowingBody = z.object({
  isResolved: z.boolean().optional(),
  resolution: z.string().optional(),
  resolvedInChapter: z.number().int().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});
