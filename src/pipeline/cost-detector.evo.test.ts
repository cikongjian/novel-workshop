import { describe, it, expect } from 'vitest';
import { CostDetector } from './cost-detector.js';

describe('CostDetector (进化版)', () => {
  const detector = new CostDetector();

  it('空内容返回通过', () => {
    const report = detector.detect('', 1);
    expect(report.passed).toBe(true);
    expect(report.findings.length).toBe(0);
  });

  it('检测无代价战斗', () => {
    const content = `
激烈的战斗开始了。
主角挥剑冲向敌人，一刀砍倒了对方。
他又一剑斩杀了第二个敌人。
轻松击败所有对手，获得了胜利。
`;
    const report = detector.detect(content, 1);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it('有代价的战斗不报警', () => {
    const content = `
战斗很激烈。
主角受伤了，肩膀流血不止，手中的剑也几乎握不住。
但他还是咬紧牙关，拼尽全力击败了敌人。
赢得很艰难。
`;
    const report = detector.detect(content, 1);
    const noCostFinding = report.findings.find(f => f.code === 'no-cost-combat');
    expect(noCostFinding).toBeUndefined();
  });

  it('支持切换进化策略', () => {
    detector.setStrategy('precision');
    expect(detector.getStrategy()).toBe('precision');
    detector.setStrategy('balanced');
    expect(detector.getStrategy()).toBe('balanced');
  });

  it('有评分和置信度', () => {
    const content = '普通内容';
    const report = detector.detect(content, 1);
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it('支持反馈学习', () => {
    const content = `
主角冲上去战斗，一刀击败了敌人。
又斩杀了第二个敌人，轻松获胜。
`;
    const report = detector.detect(content, 1);
    const firstFinding = report.findings[0];
    if (firstFinding) {
      detector.recordFalsePositive(firstFinding.ruleId);
      detector.recordTruePositive(firstFinding.ruleId);
    }
    const stats = detector.getStats();
    expect(stats.totalRules).toBeGreaterThan(0);
  });
});
