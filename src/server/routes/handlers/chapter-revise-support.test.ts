import { describe, expect, it } from 'vitest';
import {
  buildRevisionOriginalContext,
  buildRevisionQualityDeltaPayload,
} from './chapter-revise-support.js';

describe('chapter revise support', () => {
  it('builds revision original context with foreshadowing and scene plan', () => {
    const result = buildRevisionOriginalContext({
      novel: {
        id: 'novel-1',
        genre: '玄幻',
        title: '赤焰长歌',
        synopsis: '旧案复燃',
      },
      chapterNumber: 8,
      outlineData: {
        chapters: [{ chapterNumber: 8, title: '火线', summary: '围城反击', keyEvents: ['围城'] }],
        foreshadowing: [{ hint: '血色令牌', isResolved: false }],
      } as any,
      characters: [{
        name: '陆焰',
        role: '主角',
        personality: '冷静',
        personalityTraits: ['克制', '敏锐'],
        motivation: '查明旧案',
        abilities: [],
      }] as any,
      worldEntries: [{ name: '赤焰宗', category: 'faction', description: '火系宗门', tags: [] }] as any,
    });

    expect(result.originalContext.novelTitle).toBe('赤焰长歌');
    expect(result.originalContext.unresolvedForeshadowing).toContain('血色令牌');
    expect(result.originalContext.characterContext).toContain('陆焰');
  });

  it('builds revision quality delta payload', () => {
    const payload = buildRevisionQualityDeltaPayload({
      beforeQuality: {
        overallScore: 61,
        structureScore: 60,
        styleScore: 62,
        emotionScore: 61,
        findings: ['节奏偏平'],
        passed: false,
        summary: '需要补强',
      } as any,
      afterQuality: {
        overallScore: 68,
        structureScore: 66,
        styleScore: 69,
        emotionScore: 67,
        findings: [],
        passed: true,
        summary: '已改善',
      } as any,
      autoBoostAttempted: true,
      autoBoostApplied: true,
    });

    expect(payload.deltaOverall).toBe(7);
    expect(payload.autoBoostAttempted).toBe(true);
    expect(payload.autoBoostApplied).toBe(true);
  });
});
