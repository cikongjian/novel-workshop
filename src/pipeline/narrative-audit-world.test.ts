import { describe, expect, it } from 'vitest';
import type { WorldEntry } from '../novel/types.js';
import { auditChapterNarrativeUsage } from './narrative-audit.js';

const entry: WorldEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'rule',
  name: '宵禁规则',
  description: '城门在日落后关闭，只有持令者可以通行。',
  storyRole: 'constraint',
  constraints: ['日落后城门必须关闭'],
  consequences: ['违规者会被巡夜司扣押'],
  details: {},
  dependencies: [],
  conflicts: [],
  relatedEntries: [],
  tags: ['world-bible', 'approved'],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

describe('narrative world rule audit', () => {
  it('distinguishes rule fulfillment from contradictory name dropping', () => {
    const contradictory = auditChapterNarrativeUsage({
      chapterContent: '宵禁规则形同虚设，城门彻夜敞开，守卫任人通行。',
      worldEntries: [entry],
      characters: [],
    });
    const compliant = auditChapterNarrativeUsage({
      chapterContent: '宵禁规则生效后，城门在日落时关闭。他只能绕路，迟到便会被巡夜司扣押。',
      worldEntries: [entry],
      characters: [],
    });

    expect(contradictory.worldMentions[0]?.usageLevel).toBe('mention');
    expect(compliant.worldMentions[0]?.usageLevel).toBe('cost');
    expect(compliant.worldPressureScore).toBeGreaterThan(contradictory.worldPressureScore);
  });
});
