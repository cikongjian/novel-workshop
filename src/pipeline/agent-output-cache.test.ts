import { describe, expect, it } from 'vitest';
import { computeAgentFingerprint } from './agent-output-cache.js';

describe('computeAgentFingerprint', () => {
  it('changes chapter-scoped fingerprints when the outline changes', () => {
    const first = computeAgentFingerprint({
      outlineText: '第一章：城门冲突',
      worldContext: '城门日落后关闭',
      includeOutline: true,
      cacheVersion: 'world-builder-canon-v2',
    });
    const second = computeAgentFingerprint({
      outlineText: '第二章：进入王城',
      worldContext: '城门日落后关闭',
      includeOutline: true,
      cacheVersion: 'world-builder-canon-v2',
    });

    expect(first).not.toBe(second);
  });

  it('keeps stable-agent fingerprints unchanged when outline scoping is disabled', () => {
    const first = computeAgentFingerprint({
      outlineText: '第一章',
      characterContext: '主角谨慎',
    });
    const second = computeAgentFingerprint({
      outlineText: '第二章',
      characterContext: '主角谨慎',
    });

    expect(first).toBe(second);
  });

  it('changes fingerprints when the cache contract version changes', () => {
    const first = computeAgentFingerprint({
      worldContext: '相同设定',
      cacheVersion: 'v1',
    });
    const second = computeAgentFingerprint({
      worldContext: '相同设定',
      cacheVersion: 'v2',
    });

    expect(first).not.toBe(second);
  });
});
