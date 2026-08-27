import { describe, expect, it } from 'vitest';
import type { WorldEntry } from '../novel/types.js';
import { buildWorldContract, evaluateWorldContractFulfillment } from './world-contract.js';

const entry: WorldEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'rule',
  name: '宵禁规则',
  description: '城门在日落后关闭，只有持令者可以通行。',
  storyRole: 'constraint',
  constraints: ['日落后城门必须关闭'],
  consequences: ['违规者会被巡夜司扣押'],
  baseline: true,
  source: 'merged',
  details: { narrativeFunction: '限制角色夜间行动' },
  dependencies: [],
  conflicts: [],
  relatedEntries: [],
  tags: ['world-bible', 'approved'],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

function evaluate(chapterContent: string) {
  return evaluateEntry(entry, chapterContent);
}

function evaluateEntry(worldEntry: WorldEntry, chapterContent: string) {
  const contract = buildWorldContract({
    entries: [worldEntry],
    query: worldEntry.name,
    chapterNumber: 3,
  });
  return evaluateWorldContractFulfillment({
    contract,
    chapterContent,
    gateMode: 'strict',
    knownWorldEntries: [worldEntry],
  });
}

describe('world contract semantic fulfillment', () => {
  it('rejects a required entry that is only named without functional evidence', () => {
    const result = evaluate('他抬头看见墙上写着宵禁规则四个字，随后继续向前。');

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'shallow-required', entryName: '宵禁规则' }),
    ]));
  });

  it('rejects text that explicitly reverses an approved rule', () => {
    const result = evaluate('夜色里，宵禁规则形同虚设，城门彻夜敞开，守卫任人通行。');

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'contradicted-rule', entryName: '宵禁规则' }),
    ]));
  });

  it('accepts visible constraints and consequences', () => {
    const result = evaluate('宵禁规则生效后，城门在日落时关闭。他只能冒险绕路，迟到便会被巡夜司扣押。');

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it.each([
    {
      category: 'power' as const,
      name: '灵脉施术法则',
      constraints: ['灵力只能通过灵脉修炼，越阶施术会损伤经脉'],
      consequences: ['强行越阶会引发经脉反噬'],
      chapter: '灵脉施术法则已经失效，他无需灵脉就获得灵力，越阶施术也毫无代价。',
    },
    {
      category: 'faction' as const,
      name: '黑潮议会',
      constraints: ['黑潮议会只服从三席共同决议'],
      consequences: ['绕过表决的命令会被各席拒绝执行'],
      chapter: '黑潮议会如今由会长一人即可下令，其余席位必须无条件服从。',
    },
    {
      category: 'geography' as const,
      name: '断桥关',
      constraints: ['断桥关是进入北城的唯一通道'],
      consequences: ['离开关道会陷入无法通行的沉泽'],
      chapter: '断桥关并不重要，旅人可以从任意方向进入北城。',
    },
  ])('rejects semantic reversals for $category knowledge', ({ category, name, constraints, consequences, chapter }) => {
    const result = evaluateEntry({
      ...entry,
      id: `${category}-1111-4111-8111-111111111111`,
      category,
      name,
      constraints,
      consequences,
    }, chapter);

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'contradicted-rule', entryName: name }),
    ]));
  });

  it('detects reversal of approved canon even when it is not required by this chapter', () => {
    const secondary: WorldEntry = {
      ...entry,
      id: '22222222-2222-4222-8222-222222222222',
      name: '断桥关',
      category: 'geography',
      constraints: ['断桥关是进入北城的唯一通道'],
      consequences: ['离开关道会陷入无法通行的沉泽'],
    };
    const contract = buildWorldContract({
      entries: [entry, secondary],
      query: '宵禁规则',
      chapterNumber: 3,
      selectedCards: [{
        id: entry.id,
        name: entry.name,
        category: entry.category,
        score: 8,
        summary: entry.description,
        constraints: entry.constraints ?? [],
        consequences: entry.consequences ?? [],
      }],
    });
    const result = evaluateWorldContractFulfillment({
      contract,
      chapterContent: '宵禁规则生效，日落后城门必须关闭。断桥关并非唯一通道，所有人都能从任意方向进入北城。',
      gateMode: 'warn',
      knownWorldEntries: [entry, secondary],
    });

    expect(contract.required.map(item => item.name)).toEqual(['宵禁规则']);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'contradicted-rule', entryName: '断桥关' }),
    ]));
  });
});
