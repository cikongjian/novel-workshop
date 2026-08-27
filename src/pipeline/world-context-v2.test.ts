import { describe, expect, it } from 'vitest';
import type { WorldEntry } from '../novel/types.js';
import { selectWorldCardsV2 } from './world-context-v2.js';

function makeRule(overrides: Partial<WorldEntry> = {}): WorldEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    category: 'rule',
    name: '宵禁规则',
    description: '城门在日落后关闭，只有持令者可以通行。',
    storyRole: 'constraint',
    constraints: ['日落后城门必须关闭'],
    consequences: ['违规者会被巡夜司扣押'],
    baseline: true,
    source: 'merged',
    qualityScore: 0.9,
    details: { narrativeFunction: '限制角色夜间行动' },
    dependencies: [],
    conflicts: [],
    relatedEntries: [],
    tags: ['world-bible', 'approved'],
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('world context v2 retrieval', () => {
  it('keeps approved baseline entries even when the query omits the exact name', () => {
    const cards = selectWorldCardsV2({
      entries: [makeRule()],
      query: '夜间潜入王城',
      chapterNumber: 3,
      topK: 6,
    });

    expect(cards.map(card => card.name)).toContain('宵禁规则');
  });

  it('uses constraints and consequences for Chinese query matching', () => {
    const cards = selectWorldCardsV2({
      entries: [makeRule({ baseline: false, tags: [] })],
      query: '主角违反规则后会被巡夜司扣押',
      chapterNumber: 3,
      topK: 6,
    });

    expect(cards.map(card => card.name)).toContain('宵禁规则');
  });

  it('does not flood a chapter with unrelated approved baseline entries', () => {
    const unrelated = Array.from({ length: 12 }, (_, index) => makeRule({
      id: `${String(index + 2).padStart(8, '0')}-1111-4111-8111-111111111111`,
      name: `远海贸易条例${index + 1}`,
      description: '规定远海货物的税率、仓储与结算方式。',
      constraints: ['货物必须在港口完成税务登记'],
      consequences: ['逃税商队会被取消贸易资格'],
      details: { narrativeFunction: '制造商队与港口税吏之间的利益冲突' },
    }));

    const cards = selectWorldCardsV2({
      entries: [makeRule(), ...unrelated],
      query: '夜间潜入王城',
      chapterNumber: 3,
      topK: 6,
    });

    expect(cards.map(card => card.name)).toEqual(['宵禁规则']);
  });
});
