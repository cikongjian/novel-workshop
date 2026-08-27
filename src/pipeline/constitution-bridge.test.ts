import { describe, expect, it } from 'vitest';
import { constitutionToPromiseContract } from './constitution-bridge.js';
import { buildPromiseContract } from './promise-contract.js';
import type { NovelConstitution } from '../novel/constitution-types.js';

describe('constitutionToPromiseContract', () => {
  it('backfills weak constitutions with novel-card promise signals', () => {
    const weakConstitution: NovelConstitution = {
      version: 1,
      sourceDigest: 'test-digest',
      mainPromise: '被雪藏三年后，我靠塌房预警爆红了 — 题材核心卖点兑现',
      secondaryPromises: [],
      clauses: [],
      keywords: {
        payoffKeywords: [],
        sceneKeywords: [],
        suspenseDriftKeywords: ['真相', '秘密'],
        maxSuspenseShare: 0.5,
      },
      generatedAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    };

    const fallbackContract = buildPromiseContract({
      title: '被雪藏三年后，我靠塌房预警爆红了',
      synopsis: '过气艺人绑定塌房预警系统后，靠公开预警、避雷截胡和直播翻红起量。',
      tags: ['娱乐圈', '顶流', '直播'],
      constitutionTags: ['showbiz'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    const merged = constitutionToPromiseContract(weakConstitution, {
      genre: 'modern',
      fallbackContract,
    });

    expect(merged.constitutionSignals).toContain('collapse-warning');
    expect(merged.requiredPayoffKeywords).toContain('预警');
    expect(merged.requiredSceneKeywords).toContain('直播');
    expect(merged.maxSuspenseShare).toBeLessThanOrEqual(0.28);
  });
});
