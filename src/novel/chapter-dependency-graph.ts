/**
 * 章节依赖图谱构建器
 *
 * 聚合角色出场、情节线推进、伏笔关联等数据，
 * 构建章节间的依赖关系图。
 */

export type DependencyType = 'character' | 'plot' | 'foreshadowing' | 'location';

export type ChapterDependencyEdge = {
  from: number;
  to: number;
  type: DependencyType;
  label: string;
  strength: number; // 0-1
};

export type ChapterDependencyNode = {
  chapterNumber: number;
  title: string;
  characterCount: number;
  plotThreadCount: number;
  wordCount: number;
};

export type DependencyGraph = {
  nodes: ChapterDependencyNode[];
  edges: ChapterDependencyEdge[];
};

import type { PlotThread, Foreshadowing, CharacterProfile, ChapterFact } from './types.js';
import type { CharacterEvent } from './types.js';

type ChapterData = {
  meta: { chapterNumber: number; title: string; wordCount: number };
  content: string;
  fact?: ChapterFact;
  events: CharacterEvent[];
};

/**
 * 构建章节依赖图谱
 */
export function buildDependencyGraph(params: {
  chapters: ChapterData[];
  characters: CharacterProfile[];
  plotThreads: PlotThread[];
  foreshadowing: Foreshadowing[];
}): DependencyGraph {
  const { chapters, characters, plotThreads, foreshadowing } = params;
  const edgeMap = new Map<string, ChapterDependencyEdge>();

  const addEdge = (from: number, to: number, type: DependencyType, label: string, strength: number) => {
    if (from === to || from <= 0 || to <= 0) return;
    const key = `${Math.min(from, to)}-${Math.max(from, to)}-${type}-${label}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.strength = Math.min(1, existing.strength + strength);
    } else {
      edgeMap.set(key, { from: Math.min(from, to), to: Math.max(from, to), type, label, strength });
    }
  };

  // 1. 角色共现关联
  const charNameMap = new Map<string, string>();
  for (const c of characters) {
    charNameMap.set(c.id, c.name);
    for (const alias of c.aliases) charNameMap.set(alias, c.name);
  }

  const chapterCharacters = new Map<number, Set<string>>();
  for (const ch of chapters) {
    const names = new Set<string>();
    for (const c of characters) {
      const patterns = [c.name, ...c.aliases].filter(Boolean);
      if (patterns.some(p => ch.content.includes(p))) {
        names.add(c.name);
      }
    }
    chapterCharacters.set(ch.meta.chapterNumber, names);
  }

  const chapterNums = chapters.map(c => c.meta.chapterNumber).sort((a, b) => a - b);
  for (let i = 0; i < chapterNums.length; i++) {
    for (let j = i + 1; j < chapterNums.length && j <= i + 5; j++) {
      const a = chapterNums[i];
      const b = chapterNums[j];
      const charsA = chapterCharacters.get(a) ?? new Set();
      const charsB = chapterCharacters.get(b) ?? new Set();
      const shared = [...charsA].filter(n => charsB.has(n));
      if (shared.length > 0) {
        const strength = Math.min(1, shared.length * 0.2);
        addEdge(a, b, 'character', shared.slice(0, 3).join('、'), strength);
      }
    }
  }

  // 2. 情节线关联
  for (const thread of plotThreads) {
    const involvedChapters: number[] = [];
    for (const ch of chapters) {
      const patterns = [thread.name, ...(thread.description || '').split(/[，。、；]/)].filter(p => p.length >= 2);
      if (patterns.some(p => ch.content.includes(p))) {
        involvedChapters.push(ch.meta.chapterNumber);
      }
    }
    for (let i = 0; i < involvedChapters.length; i++) {
      for (let j = i + 1; j < involvedChapters.length && j <= i + 3; j++) {
        addEdge(involvedChapters[i], involvedChapters[j], 'plot', thread.name, 0.4);
      }
    }
  }

  // 3. 伏笔关联
  for (const fs of foreshadowing) {
    if (fs.plantedInChapter && fs.resolvedInChapter && fs.isResolved) {
      addEdge(fs.plantedInChapter, fs.resolvedInChapter, 'foreshadowing', fs.hint.slice(0, 20), 0.6);
    }
  }

  // 4. 地点共现关联
  for (let i = 0; i < chapters.length; i++) {
    const factA = chapters[i].fact;
    if (!factA?.locations?.length) continue;
    for (let j = i + 1; j < chapters.length && j <= i + 5; j++) {
      const factB = chapters[j].fact;
      if (!factB?.locations?.length) continue;
      const shared = factA.locations.filter(l => factB.locations.includes(l));
      if (shared.length > 0) {
        addEdge(
          chapters[i].meta.chapterNumber,
          chapters[j].meta.chapterNumber,
          'location',
          shared[0],
          Math.min(1, shared.length * 0.3),
        );
      }
    }
  }

  // 构建节点
  const nodes: ChapterDependencyNode[] = chapters.map(ch => ({
    chapterNumber: ch.meta.chapterNumber,
    title: ch.meta.title || `第${ch.meta.chapterNumber}章`,
    characterCount: chapterCharacters.get(ch.meta.chapterNumber)?.size ?? 0,
    plotThreadCount: plotThreads.filter(t => {
      const patterns = [t.name];
      return patterns.some(p => ch.content.includes(p));
    }).length,
    wordCount: ch.meta.wordCount || ch.content.length,
  }));

  return { nodes, edges: [...edgeMap.values()] };
}
