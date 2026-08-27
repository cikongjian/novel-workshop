import { describe, expect, it } from 'vitest';
import type { WorldContract, WorldContractFulfillment } from './world-contract.js';
import { buildWorldGateFixHints, shouldAttemptWorldGateFix } from './gate-orchestrator.js';

const contract: WorldContract = {
  chapterNumber: 3,
  query: '宵禁规则',
  source: 'retrieval-v2',
  required: [{
    id: '11111111-1111-4111-8111-111111111111',
    name: '宵禁规则',
    aliases: [],
    category: 'rule',
    score: 7.2,
    reason: '作者确认的长期规则',
    constraints: ['日落后城门必须关闭'],
    consequences: ['违规者会被巡夜司扣押'],
    baseline: true,
  }],
  supporting: [],
  prompt: 'test',
};

function fulfillment(code: 'shallow-required' | 'contradicted-rule'): WorldContractFulfillment {
  return {
    gateMode: 'warn',
    requiredTotal: 1,
    requiredHit: 1,
    missingRequired: [],
    unsourcedTerms: [],
    findings: [{
      code,
      level: 'warn',
      message: code === 'contradicted-rule' ? '规则被反向描述' : '规则只被点名',
      entryName: '宵禁规则',
    }],
    passed: true,
    summary: 'test',
  };
}

describe('world gate repair policy', () => {
  it('repairs approved semantic violations even in warn mode', () => {
    expect(shouldAttemptWorldGateFix({
      fulfillment: fulfillment('shallow-required'),
      contract,
      gateMode: 'warn',
      skipStrictGate: false,
    })).toBe(true);
  });

  it('renders the canonical constraints and consequences into repair guidance', () => {
    const hints = buildWorldGateFixHints(fulfillment('contradicted-rule'), contract);

    expect(hints).toContain('日落后城门必须关闭');
    expect(hints).toContain('违规者会被巡夜司扣押');
    expect(hints).toContain('删除反向描述');
  });

  it('repairs contradicted approved canon that is not required to appear', () => {
    const canonicalOnly: WorldContract = {
      ...contract,
      required: [],
      canonical: contract.required,
    };
    const report = fulfillment('contradicted-rule');

    expect(shouldAttemptWorldGateFix({
      fulfillment: report,
      contract: canonicalOnly,
      gateMode: 'warn',
      skipStrictGate: false,
    })).toBe(true);
    expect(buildWorldGateFixHints(report, canonicalOnly)).toContain('日落后城门必须关闭');
  });
});
