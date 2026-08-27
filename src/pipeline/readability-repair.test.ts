import { describe, expect, it } from 'vitest';
import { auditGenreDrift } from './genre-drift-audit.js';
import { buildReadabilityRepairDecision } from './readability-repair.js';

describe('buildReadabilityRepairDecision', () => {
  it('triggers repair when reader score drops even if quality gate is high', () => {
    const decision = buildReadabilityRepairDecision({
      readerScore: 7.2,
      scoreThreshold: 6,
      previousReaderScore: 7.9,
      qualityReport: {
        overallScore: 86,
        structureScore: 100,
        styleScore: 89,
        emotionScore: 60,
        passed: true,
        gateMode: 'warn',
        summary: '',
        findings: [],
      },
    });

    expect(decision.shouldRepair).toBe(true);
    expect(decision.reasons).toContain('readerScore dropped 0.7 from previous chapter');
    expect(decision.hints).toContain('不能只提高设定命中或抽象指标');
    expect(decision.hints).toContain('流程化读感补救硬约束');
  });

  it('triggers repair when non-suspense content drifts into investigation-led prose', () => {
    const genreDrift = auditGenreDrift({
      title: '协议婚后，偏执总裁天天护短',
      synopsis: '甜宠先婚后爱，核心回报是偏爱、护短和关系升温。',
      genre: 'romance',
      constitutionTags: ['sweet'],
      chapterContent: [
        '林栀开始调查匿名短信的来源，监控里的秘密和幕后线索不断浮出水面。',
        '她沿着证据查到旧仓库，新的真相又指向一个没露面的匿名人。',
      ].join('\n\n'),
    });

    const decision = buildReadabilityRepairDecision({
      readerScore: 7.6,
      scoreThreshold: 6,
      previousReaderScore: 7.6,
      qualityReport: {
        overallScore: 88,
        structureScore: 90,
        styleScore: 90,
        emotionScore: 72,
        passed: true,
        gateMode: 'warn',
        summary: '',
        findings: [],
      },
      genreDrift,
    });

    expect(decision.shouldRepair).toBe(true);
    expect(decision.reasons).toContain('genre drift detected');
    expect(decision.hints).toContain('题材漂移修复');
    expect(decision.hints).toContain('甜宠写关系回报');
  });
});
