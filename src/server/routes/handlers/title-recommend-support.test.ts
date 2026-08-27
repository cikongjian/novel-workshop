import { describe, expect, it } from 'vitest';
import {
  buildTitleRecommendationContext,
  buildTitleRecommendationRecord,
  normalizeRecommendationPlatform,
  parseTitleRecommendationPayload,
  removeTitleRecommendation,
} from './title-recommend-support.js';

describe('title recommend support', () => {
  it('builds recommendation context with head-tail chapter sampling', () => {
    const context = buildTitleRecommendationContext({
      novel: {
        id: 'novel-1',
        genre: '玄幻',
        title: '赤焰长歌',
        synopsis: '旧案再起',
      },
      platform: 'fanqie',
      userDirection: '要更抓眼',
      characters: Array.from({ length: 8 }, (_, index) => ({
        id: `char-${index}`,
        name: `角色${index}`,
        role: 'protagonist',
        personality: `性格描述${index}`.repeat(20),
        personalityTraits: [],
        aliases: [],
        position: '',
        appearance: '',
        speechStyle: '',
        speechExamples: [],
        backstory: '',
        motivation: '',
        abilities: [],
        relationships: [],
        arc: '',
        currentState: '',
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-23T00:00:00.000Z',
      })) as any,
      worldEntries: Array.from({ length: 10 }, (_, index) => ({
        id: `world-${index}`,
        category: 'faction',
        name: `势力${index}`,
        description: `描述${index}`.repeat(30),
        details: {},
        relatedEntries: [],
        tags: [],
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-23T00:00:00.000Z',
      })) as any,
      outline: {
        chapters: Array.from({ length: 18 }, (_, index) => ({
          chapterNumber: index + 1,
          title: `标题${index + 1}`,
          summary: `大纲摘要${index + 1}`.repeat(10),
          beats: [],
          tensionTarget: 5,
          plotThreadsAdvanced: [],
          keyEvents: [],
          notes: '',
        })),
        plotThreads: [],
        foreshadowing: [],
      },
      chapters: Array.from({ length: 12 }, (_, index) => ({
        novelId: 'novel-1',
        chapterNumber: index + 1,
        title: `章节${index + 1}`,
        content: '',
        wordCount: 0,
        status: 'outlined',
        agentComments: [],
        revisionCount: 0,
        summary: `概要${index + 1}`.repeat(20),
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-23T00:00:00.000Z',
      })) as any,
    });

    expect(context.userDirection).toContain('目标平台：fanqie');
    expect(context.userDirection).toContain('要更抓眼');
    expect(context.inputText).toContain('第1章');
    expect(context.inputText).toContain('第12章');
    expect(context.characterContext?.split('\n')).toHaveLength(6);
    expect(context.worldContext?.split('\n')).toHaveLength(8);
    expect(context.outlineContext?.split('\n')).toHaveLength(15);
  });

  it('parses fenced and embedded json payloads', () => {
    const fenced = parseTitleRecommendationPayload('```json\n{\"shortSynopsis\":\"一句话\"}\n```');
    const embedded = parseTitleRecommendationPayload('结果如下：\n{\"marketingInsight\":\"主打反差\"}\n请查收');

    expect(fenced.shortSynopsis).toBe('一句话');
    expect(embedded.marketingInsight).toBe('主打反差');
  });

  it('normalizes platform and builds sanitized recommendation record', () => {
    const platform = normalizeRecommendationPlatform('unknown-platform');
    const record = buildTitleRecommendationRecord({
      id: 'rec-1',
      platform,
      parsed: {
        titles: [{ title: '焚天令', reasoning: 123 }],
        shortSynopsis: '短简介',
        longSynopsis: '长简介',
        tags: ['热血', 9],
        marketingInsight: '高势能切题',
      },
      createdAt: '2026-03-23T00:00:00.000Z',
    });

    expect(platform).toBe('general');
    expect(record.titles[0]).toEqual({ title: '焚天令', reasoning: '123' });
    expect(record.tags).toEqual(['热血', '9']);
  });

  it('removes recommendation by id', () => {
    expect(removeTitleRecommendation([
      { id: 'a' },
      { id: 'b' },
    ] as any, 'a')).toEqual([{ id: 'b' }]);
  });
});
