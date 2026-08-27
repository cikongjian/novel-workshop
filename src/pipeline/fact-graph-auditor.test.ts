import { describe, expect, it } from 'vitest';
import { extractFactsFromChapter, mergeFactsIntoGraph } from '../novel/fact-graph-builder.js';
import { detectContradictions } from './fact-graph-auditor.js';
import type { FactGraph } from '../novel/fact-graph-types.js';

function createGraph(): FactGraph {
  return {
    novelId: '00000000-0000-0000-0000-000000000000',
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

describe('fact-graph auditor', () => {
  it('does not flag appearances that happen before a later death event', () => {
    let graph = createGraph();

    const chapter1Facts = extractFactsFromChapter({
      chapterContent: '林城走进议事厅，抬头看向众人。',
      chapterNumber: 1,
      characterNames: ['林城'],
    });
    expect(detectContradictions(graph, chapter1Facts, 1)).toHaveLength(0);
    graph = mergeFactsIntoGraph(graph, chapter1Facts, 1);

    const chapter30Facts = extractFactsFromChapter({
      chapterContent: '林城当场身亡，尸体被众人抬走。',
      chapterNumber: 30,
      characterNames: ['林城'],
    });
    expect(detectContradictions(graph, chapter30Facts, 30)).toHaveLength(0);
    graph = mergeFactsIntoGraph(graph, chapter30Facts, 30);

    const chapter31Facts = extractFactsFromChapter({
      chapterContent: '林城再次走进大殿，开口发号施令。',
      chapterNumber: 31,
      characterNames: ['林城'],
    });
    const contradictions = detectContradictions(graph, chapter31Facts, 31);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]?.type).toBe('character-resurrection');
  });

  it('ignores memory mentions after a confirmed death', () => {
    let graph = createGraph();

    const deathFacts = extractFactsFromChapter({
      chapterContent: '林城断气倒地，所有人都确认他已经死亡。',
      chapterNumber: 30,
      characterNames: ['林城'],
    });
    graph = mergeFactsIntoGraph(graph, deathFacts, 30);

    const memoryFacts = extractFactsFromChapter({
      chapterContent: '众人回忆起林城当年守城的样子，无不沉默。',
      chapterNumber: 31,
      characterNames: ['林城'],
    });
    expect(detectContradictions(graph, memoryFacts, 31)).toHaveLength(0);
  });

  it('skips explicit earlier days when the event is marked as flashback', () => {
    let graph = createGraph();

    const dayFiveFacts = extractFactsFromChapter({
      chapterContent: '第5天，众人抵达山门。',
      chapterNumber: 10,
      characterNames: ['林城'],
    });
    graph = mergeFactsIntoGraph(graph, dayFiveFacts, 10);

    const flashbackFacts = extractFactsFromChapter({
      chapterContent: '林城回忆起第3天在山谷里发生的旧事。',
      chapterNumber: 11,
      characterNames: ['林城'],
    });
    const contradictions = detectContradictions(graph, flashbackFacts, 11);
    expect(contradictions.some(item => item.type === 'timeline-regression')).toBe(false);
  });
});
