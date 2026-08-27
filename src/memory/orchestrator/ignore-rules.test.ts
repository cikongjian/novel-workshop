/**
 * Tests for context ignore rules module.
 */

import { describe, it, expect } from 'vitest';
import {
  applyIgnoreRules,
  createIgnoreRule,
  pruneExpiredRules,
  type ContextIgnoreRule,
  type MemoryItem,
} from './ignore-rules.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeItem(id: string, source: MemoryItem['source'] = 'vector:chapter', content = ''): MemoryItem {
  return { id, source, content: content || `content for ${id}` };
}

function makeRule(
  entityId: string,
  opts: Partial<Omit<ContextIgnoreRule, 'entityId'>> = {},
): ContextIgnoreRule {
  return {
    id: opts.id ?? `rule-${entityId}`,
    entityId,
    reason: opts.reason ?? 'test reason',
    source: opts.source,
    expiresAtChapter: opts.expiresAtChapter,
    createdAt: opts.createdAt ?? '2025-01-01T00:00:00.000Z',
  };
}

// ── applyIgnoreRules ─────────────────────────────────────────────

describe('applyIgnoreRules', () => {
  const items: MemoryItem[] = [
    makeItem('char:alice', 'file:character'),
    makeItem('char:bob', 'file:character'),
    makeItem('world:magic-system', 'world_card'),
    makeItem('vector:ch3:summary', 'vector:chapter'),
    makeItem('story_state:arc:main', 'story_state:arc'),
  ];

  it('returns all items when rules array is empty', () => {
    const result = applyIgnoreRules(items, []);
    expect(result).toEqual(items);
    expect(result).toHaveLength(5);
  });

  it('filters out items matching a rule by exact entity ID', () => {
    const rules = [makeRule('char:alice')];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(4);
    expect(result.find(i => i.id === 'char:alice')).toBeUndefined();
  });

  it('filters out items matching by partial ID (includes)', () => {
    // Rule entityId "ch3" is included in item id "vector:ch3:summary"
    const rules = [makeRule('ch3')];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(4);
    expect(result.find(i => i.id === 'vector:ch3:summary')).toBeUndefined();
  });

  it('filters out multiple items when rule entityId is a common substring', () => {
    // "char:" appears in both "char:alice" and "char:bob"
    const rules = [makeRule('char:')];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(3);
    expect(result.every(i => !i.id.startsWith('char:'))).toBe(true);
  });

  it('respects source constraint — ignores only matching source', () => {
    // Rule targets "char:alice" but only from 'world_card' source
    // Since alice is 'file:character', she should NOT be filtered
    const rules = [makeRule('char:alice', { source: 'world_card' })];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(5);
    expect(result.find(i => i.id === 'char:alice')).toBeDefined();
  });

  it('filters item when both entityId and source match', () => {
    const rules = [makeRule('char:alice', { source: 'file:character' })];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(4);
    expect(result.find(i => i.id === 'char:alice')).toBeUndefined();
  });

  it('applies multiple rules simultaneously', () => {
    const rules = [
      makeRule('char:alice'),
      makeRule('world:magic-system'),
    ];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(3);
    expect(result.find(i => i.id === 'char:alice')).toBeUndefined();
    expect(result.find(i => i.id === 'world:magic-system')).toBeUndefined();
  });

  // ── Expiration logic ────

  it('skips expired rules (currentChapter > expiresAtChapter)', () => {
    const rules = [makeRule('char:alice', { expiresAtChapter: 5 })];
    // Chapter 6 is past expiry — rule should not apply
    const result = applyIgnoreRules(items, rules, 6);
    expect(result).toHaveLength(5);
  });

  it('applies rule when currentChapter equals expiresAtChapter (inclusive)', () => {
    const rules = [makeRule('char:alice', { expiresAtChapter: 5 })];
    const result = applyIgnoreRules(items, rules, 5);
    expect(result).toHaveLength(4);
    expect(result.find(i => i.id === 'char:alice')).toBeUndefined();
  });

  it('applies rule when currentChapter is before expiresAtChapter', () => {
    const rules = [makeRule('char:alice', { expiresAtChapter: 10 })];
    const result = applyIgnoreRules(items, rules, 3);
    expect(result).toHaveLength(4);
    expect(result.find(i => i.id === 'char:alice')).toBeUndefined();
  });

  it('treats rules without expiresAtChapter as permanent (always active)', () => {
    const rules = [makeRule('char:alice')]; // no expiresAtChapter
    const result = applyIgnoreRules(items, rules, 999);
    expect(result).toHaveLength(4);
  });

  it('treats rules as active when currentChapter is undefined', () => {
    // Even with expiresAtChapter set, if currentChapter is not provided,
    // the rule stays active
    const rules = [makeRule('char:alice', { expiresAtChapter: 1 })];
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(4);
  });

  it('returns all items when all rules are expired', () => {
    const rules = [
      makeRule('char:alice', { expiresAtChapter: 3 }),
      makeRule('char:bob', { expiresAtChapter: 2 }),
    ];
    const result = applyIgnoreRules(items, rules, 10);
    expect(result).toHaveLength(5);
  });

  it('mixes expired and active rules correctly', () => {
    const rules = [
      makeRule('char:alice', { expiresAtChapter: 3 }),  // expired at chapter 5
      makeRule('char:bob'),                              // permanent, active
    ];
    const result = applyIgnoreRules(items, rules, 5);
    expect(result).toHaveLength(4);
    // alice should remain (her rule expired)
    expect(result.find(i => i.id === 'char:alice')).toBeDefined();
    // bob should be filtered (permanent rule)
    expect(result.find(i => i.id === 'char:bob')).toBeUndefined();
  });

  it('returns empty array when all items are ignored', () => {
    const allIds = items.map(i => i.id);
    const rules = allIds.map(id => makeRule(id));
    const result = applyIgnoreRules(items, rules);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original items array', () => {
    const original = [...items];
    const rules = [makeRule('char:alice')];
    applyIgnoreRules(items, rules);
    expect(items).toEqual(original);
  });

  it('handles empty items array', () => {
    const rules = [makeRule('char:alice')];
    const result = applyIgnoreRules([], rules);
    expect(result).toHaveLength(0);
  });
});

// ── createIgnoreRule ─────────────────────────────────────────────

describe('createIgnoreRule', () => {
  it('creates a rule with required fields', () => {
    const rule = createIgnoreRule('char:alice', 'character removed from story');
    expect(rule.entityId).toBe('char:alice');
    expect(rule.reason).toBe('character removed from story');
    expect(rule.id).toMatch(/^ignore-\d+-[a-z0-9]+$/);
    expect(rule.createdAt).toBeTruthy();
    expect(new Date(rule.createdAt).getTime()).not.toBeNaN();
  });

  it('leaves source undefined when not provided', () => {
    const rule = createIgnoreRule('x', 'reason');
    expect(rule.source).toBeUndefined();
  });

  it('sets source when provided', () => {
    const rule = createIgnoreRule('x', 'reason', { source: 'world_card' });
    expect(rule.source).toBe('world_card');
  });

  it('sets expiresAtChapter when provided', () => {
    const rule = createIgnoreRule('x', 'temp ignore', { expiresAtChapter: 10 });
    expect(rule.expiresAtChapter).toBe(10);
  });

  it('leaves expiresAtChapter undefined when not provided', () => {
    const rule = createIgnoreRule('x', 'reason');
    expect(rule.expiresAtChapter).toBeUndefined();
  });

  it('accepts both source and expiresAtChapter together', () => {
    const rule = createIgnoreRule('entity', 'reason', {
      source: 'file:character',
      expiresAtChapter: 5,
    });
    expect(rule.source).toBe('file:character');
    expect(rule.expiresAtChapter).toBe(5);
  });

  it('generates unique IDs for consecutive calls', () => {
    const rule1 = createIgnoreRule('a', 'r1');
    const rule2 = createIgnoreRule('b', 'r2');
    expect(rule1.id).not.toBe(rule2.id);
  });
});

// ── pruneExpiredRules ────────────────────────────────────────────

describe('pruneExpiredRules', () => {
  it('keeps rules without expiresAtChapter (permanent)', () => {
    const rules = [makeRule('a'), makeRule('b')];
    const result = pruneExpiredRules(rules, 100);
    expect(result).toHaveLength(2);
  });

  it('keeps rules where currentChapter <= expiresAtChapter', () => {
    const rules = [makeRule('a', { expiresAtChapter: 10 })];
    expect(pruneExpiredRules(rules, 10)).toHaveLength(1); // equal
    expect(pruneExpiredRules(rules, 5)).toHaveLength(1);  // before
  });

  it('removes rules where currentChapter > expiresAtChapter', () => {
    const rules = [makeRule('a', { expiresAtChapter: 5 })];
    const result = pruneExpiredRules(rules, 6);
    expect(result).toHaveLength(0);
  });

  it('handles a mix of permanent and expiring rules', () => {
    const rules = [
      makeRule('permanent'),
      makeRule('expired', { expiresAtChapter: 2 }),
      makeRule('still-active', { expiresAtChapter: 10 }),
    ];
    const result = pruneExpiredRules(rules, 5);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.entityId)).toContain('permanent');
    expect(result.map(r => r.entityId)).toContain('still-active');
    expect(result.map(r => r.entityId)).not.toContain('expired');
  });

  it('returns empty array when all rules are expired', () => {
    const rules = [
      makeRule('a', { expiresAtChapter: 1 }),
      makeRule('b', { expiresAtChapter: 2 }),
    ];
    const result = pruneExpiredRules(rules, 10);
    expect(result).toHaveLength(0);
  });

  it('returns all rules when none are expired', () => {
    const rules = [
      makeRule('a', { expiresAtChapter: 100 }),
      makeRule('b'),
    ];
    const result = pruneExpiredRules(rules, 1);
    expect(result).toHaveLength(2);
  });

  it('handles empty rules array', () => {
    const result = pruneExpiredRules([], 5);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original rules array', () => {
    const rules = [
      makeRule('a', { expiresAtChapter: 1 }),
      makeRule('b'),
    ];
    const original = [...rules];
    pruneExpiredRules(rules, 10);
    expect(rules).toEqual(original);
  });
});
