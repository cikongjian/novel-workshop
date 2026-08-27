import type { FactGraph } from './fact-graph-types.js';

export function collectFactGraphChapterNumbers(graph: FactGraph): number[] {
  const chapterNumbers = new Set<number>();
  const collect = (entries: Array<{ chapterNumber: number }>) => {
    for (const entry of entries) chapterNumbers.add(entry.chapterNumber);
  };
  collect(graph.characterAppearances);
  collect(graph.itemTimeline);
  collect(graph.locationVisits);
  collect(graph.timelineEvents);
  collect(graph.relationshipChanges);
  collect(graph.characterStateChanges);
  collect(graph.factEvents ?? []);
  return [...chapterNumbers].sort((left, right) => left - right);
}
