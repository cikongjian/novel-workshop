/**
 * 上下文忽略规则（Context Ignore Rules）
 *
 * 类似 .gitignore，允许用户或系统标记特定记忆条目为"忽略"，
 * 使其不被注入到 Agent 上下文中。支持按 ID、来源、过期章节过滤。
 */

import type { MemorySource } from './types.js';

// ── 类型 ──────────────────────────────────────────────────────────

export interface ContextIgnoreRule {
  id: string;
  /** Entity ID or pattern to ignore */
  entityId: string;
  /** Optional: only ignore from this specific memory source */
  source?: MemorySource;
  /** Human-readable reason for ignoring */
  reason: string;
  /** If set, rule expires at this chapter (inclusive) */
  expiresAtChapter?: number;
  /** When the rule was created */
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  source: MemorySource;
  content: string;
  [key: string]: unknown;
}

// ── 规则应用 ──────────────────────────────────────────────────────

/**
 * Filter out memory items that match any active ignore rule.
 * Rules with expired chapters are automatically skipped.
 */
export function applyIgnoreRules(
  items: MemoryItem[],
  rules: ContextIgnoreRule[],
  currentChapter?: number,
): MemoryItem[] {
  if (rules.length === 0) return items;

  // Pre-filter expired rules
  const activeRules = rules.filter(r => {
    if (r.expiresAtChapter !== undefined && currentChapter !== undefined) {
      return currentChapter <= r.expiresAtChapter;
    }
    return true;
  });

  if (activeRules.length === 0) return items;

  return items.filter(item => {
    return !activeRules.some(rule => {
      const idMatch = item.id === rule.entityId || item.id.includes(rule.entityId);
      const sourceMatch = !rule.source || item.source === rule.source;
      return idMatch && sourceMatch;
    });
  });
}

/**
 * Create a new ignore rule.
 */
export function createIgnoreRule(
  entityId: string,
  reason: string,
  opts: { source?: MemorySource; expiresAtChapter?: number } = {},
): ContextIgnoreRule {
  return {
    id: `ignore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId,
    source: opts.source,
    reason,
    expiresAtChapter: opts.expiresAtChapter,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Remove expired rules from a rule set.
 */
export function pruneExpiredRules(
  rules: ContextIgnoreRule[],
  currentChapter: number,
): ContextIgnoreRule[] {
  return rules.filter(r => {
    if (r.expiresAtChapter !== undefined) {
      return currentChapter <= r.expiresAtChapter;
    }
    return true;
  });
}
