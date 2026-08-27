import { describe, expect, it, vi } from 'vitest';
import type { AgentContext, AgentOutput } from '../agents/types.js';
import type { WorldEntry } from '../novel/types.js';
import { GateExecutor } from './gate-executor.js';
import { buildWorldContract } from './world-contract.js';

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
  details: {},
  dependencies: [],
  conflicts: [],
  relatedEntries: [],
  tags: ['world-bible', 'approved'],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

describe('GateExecutor world repair integration', () => {
  it('calls Editor and applies an approved-rule repair in warn mode', async () => {
    const repairedText = '宵禁规则生效后，城门在日落时关闭。他只能绕路，迟到便会被巡夜司扣押。';
    const runAgent = vi.fn(async (_role: string, context: AgentContext): Promise<AgentOutput> => ({
      agentRole: 'editor',
      content: repairedText,
      timestamp: '2026-07-12T00:00:00.000Z',
      metadata: { hints: context.worldGateFixHints },
    }));
    const traceStage = vi.fn();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const executor = new GateExecutor({
      novelId: 'novel-1',
      chapterNumber: 3,
      worldContract: buildWorldContract({ entries: [entry], query: '宵禁规则', chapterNumber: 3 }),
      outlineContract: { required: [], prompt: '' } as any,
      stylePreset: 'serious',
      genre: 'fantasy',
      knownCharacterNames: [],
      knownWorldEntries: [entry],
      domainStructureKeywords: [],
      enableGenreAdaptiveThresholds: false,
      enableAiTellClusterGate: false,
      antiAiStructure: {} as any,
      qualityFeatures: { gateMode: 'off' } as any,
      worldFeatures: {
        contractEnabled: true,
        gateMode: 'warn',
        strictFallbackToWarn: true,
        retrievalV2Enabled: true,
        retrievalTopK: 6,
      },
      outlineFeatures: { gateMode: 'off' } as any,
      editorContext: {} as AgentContext,
      runAgent: runAgent as any,
      traceStage,
      worldGateLog: logger,
      outlineGateLog: logger,
      qualityGateLog: logger,
    });

    const result = await executor.runCoreGates(
      '宵禁规则形同虚设，城门彻夜敞开，守卫任人通行。',
      'original editor output',
    );

    expect(runAgent).toHaveBeenCalledOnce();
    expect(runAgent).toHaveBeenCalledWith('editor', expect.objectContaining({
      worldGateFixHints: expect.stringContaining('日落后城门必须关闭'),
    }));
    expect(result.polishedText).toBe(repairedText);
    expect(result.worldGateRewrite).toEqual(expect.objectContaining({ attempted: true, applied: true }));
    expect(result.worldFulfillment?.findings).toEqual([]);
    expect(traceStage).toHaveBeenCalledWith('world-gate.rewrite', repairedText);
  });
});
