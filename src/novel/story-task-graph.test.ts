import { describe, expect, it } from 'vitest';
import { buildStoryTaskGraph } from './story-task-graph.js';
import { CharacterProfile, OutlineData } from './types.js';

const TIMESTAMP = '2026-07-12T00:00:00.000Z';
const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THREAD_A = '11111111-1111-4111-8111-111111111111';
const THREAD_B = '22222222-2222-4222-8222-222222222222';

function character() {
  return CharacterProfile.parse({
    id: LEAD_ID,
    name: '沈砚',
    aliases: [],
    role: 'protagonist',
    appearance: '',
    personality: '',
    personalityTraits: [],
    speechStyle: '',
    speechExamples: [],
    backstory: '',
    motivation: '',
    abilities: [],
    relationships: [],
    arc: '',
    currentState: '',
    tags: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

function outline() {
  return OutlineData.parse({
    plotThreads: [
      {
        id: THREAD_A,
        name: '追查旧案',
        description: '沈砚寻找失踪卷宗',
        status: 'developing',
        relatedCharacters: [],
        prerequisites: [],
        parallelThreads: [],
      },
      {
        id: THREAD_B,
        name: '揭开内鬼',
        description: '锁定幕后阻碍者',
        status: 'planted',
        relatedCharacters: [],
        prerequisites: [THREAD_A],
        parallelThreads: [],
      },
    ],
    chapters: [
      {
        chapterNumber: 1,
        title: '雨夜入城',
        summary: '沈砚收到旧案线索',
        beats: [],
        plotThreadsAdvanced: [THREAD_A],
        keyEvents: ['拿到卷宗'],
      },
      {
        chapterNumber: 2,
        title: '暗门之后',
        summary: '沈砚进入密室',
        beats: [],
        plotThreadsAdvanced: [THREAD_A, THREAD_B],
        keyEvents: ['发现内鬼痕迹'],
      },
    ],
  });
}

describe('buildStoryTaskGraph', () => {
  it('projects arc, chapter, character and dependency edges without user input', () => {
    const graph = buildStoryTaskGraph({
      outline: outline(),
      characters: [character()],
      chapterSummaries: [
        { chapterNumber: 1, title: '雨夜入城', status: 'finalized', wordCount: 2000 },
        { chapterNumber: 2, title: '暗门之后', status: 'reviewed', wordCount: 2100 },
      ],
    });

    expect(graph.tasks).toHaveLength(4);
    expect(graph.characters.map(item => item.name)).toEqual(['沈砚']);
    expect(graph.tasks.find(task => task.id.endsWith(THREAD_B))).toMatchObject({
      status: 'blocked',
      blockerTaskIds: [`task:arc:${THREAD_A}`],
    });
    expect(graph.edges.map(edge => edge.type)).toEqual(expect.arrayContaining([
      'requires',
      'parallel',
      'advances',
      'assigned',
    ]));
  });

  it('falls back to a recent chapter task chain when no plot threads exist', () => {
    const graph = buildStoryTaskGraph({
      outline: OutlineData.parse({
        chapters: [1, 2, 3].map(chapterNumber => ({
          chapterNumber,
          title: `第${chapterNumber}章`,
          summary: `沈砚推进第${chapterNumber}章目标`,
          beats: [],
          plotThreadsAdvanced: [],
          keyEvents: [],
        })),
      }),
      characters: [character()],
      chapterSummaries: [{ chapterNumber: 1, title: '第1章', status: 'finalized', wordCount: 1000 }],
    });

    expect(graph.tasks).toHaveLength(3);
    expect(graph.edges.filter(edge => edge.type === 'requires')).toHaveLength(2);
    expect(graph.summary.participantCount).toBe(1);
  });
});
