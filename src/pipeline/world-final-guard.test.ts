import { describe, expect, it, vi } from 'vitest';
import type { AgentContext, AgentOutput } from '../agents/types.js';
import type { WorldEntry } from '../novel/types.js';
import { buildWorldContract } from './world-contract.js';
import { enforceFinalWorldContract } from './world-final-guard.js';

const entry: WorldEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'rule',
  name: '宵禁规则',
  description: '城门在日落后关闭。',
  constraints: ['日落后城门必须关闭'],
  consequences: ['违规者会被巡夜司扣押'],
  storyRole: 'constraint',
  baseline: true,
  details: {},
  dependencies: [],
  conflicts: [],
  relatedEntries: [],
  tags: ['approved'],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

function runGuard(editorContent: string) {
  const runAgent = vi.fn(async (): Promise<AgentOutput> => ({
    agentRole: 'editor',
    content: editorContent,
    timestamp: '2026-07-12T00:00:00.000Z',
  }));
  return {
    runAgent,
    result: enforceFinalWorldContract({
      contract: buildWorldContract({ entries: [entry], query: entry.name, chapterNumber: 8 }),
      chapterContent: '宵禁规则形同虚设，城门彻夜敞开，所有人都能任意通行。',
      finalEditedContent: 'original editor output',
      gateMode: 'warn',
      knownWorldEntries: [entry],
      knownCharacterNames: [],
      skipStrictGate: false,
      editorContext: {} as AgentContext,
      runAgent,
    }),
  };
}

describe('final world contract guard', () => {
  it('accepts a final Editor candidate only when world violations decrease', async () => {
    const { runAgent, result } = runGuard(
      '宵禁规则生效后，城门在日落时关闭。他只能绕路，否则会被巡夜司扣押。',
    );
    const resolved = await result;

    expect(runAgent).toHaveBeenCalledOnce();
    expect(resolved.rewrite).toEqual(expect.objectContaining({ attempted: true, applied: true }));
    expect(resolved.fulfillment.findings).toEqual([]);
    expect(resolved.chapterContent).toContain('只能绕路');
  });

  it('keeps the original text when the Editor candidate does not improve canon compliance', async () => {
    const original = '宵禁规则形同虚设，城门彻夜敞开，所有人都能任意通行。';
    const { result } = runGuard('宵禁规则仍然形同虚设，城门保持开放，任何人都可以直接通过。');
    const resolved = await result;

    expect(resolved.rewrite).toEqual(expect.objectContaining({ attempted: true, applied: false }));
    expect(resolved.chapterContent).toBe(original);
    expect(resolved.fulfillment.findings).not.toEqual([]);
  });
});
