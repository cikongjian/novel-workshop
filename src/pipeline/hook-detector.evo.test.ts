import { describe, it, expect } from 'vitest';
import { HookDetector } from './hook-detector.js';

describe('HookDetector (进化版)', () => {
  const detector = new HookDetector();

  it('空内容返回通过', () => {
    const report = detector.detect('', 1);
    expect(report.passed).toBe(true);
    expect(report.findings.length).toBe(0);
    expect(report.hookStrength).toBe('none');
    expect(report.tensionScore).toBe(0);
  });

  it('检测到强钩子', () => {
    const content = `
第一章 开端
主角走在路上。

突然，一道黑影闪过，他猛然回头——
那竟然是他以为早已死去的人？
`;
    const report = detector.detect(content, 1);
    expect(report.hasEndingHook).toBe(true);
    expect(report.hookStrength).not.toBe('none');
    expect(report.tensionScore).toBeGreaterThan(0);
  });

  it('检测到危机型钩子', () => {
    const content = `
战斗进入白热化。

就在他以为胜券在握时，
敌人突然掏出了一把致命的武器——
真正的危险，才刚刚开始！
`;
    const report = detector.detect(content, 1);
    expect(report.hasEndingHook).toBe(true);
    expect(report.tensionScore).toBeGreaterThan(0);
  });

  it('支持设置题材', () => {
    detector.setGenre('玄幻');
    const content = `
战斗。

危险！
`;
    const report = detector.detect(content, 1);
    expect(report).toBeDefined();
  });

  it('支持切换进化策略', () => {
    detector.setStrategy('precision');
    expect(detector.getStrategy()).toBe('precision');
    detector.setStrategy('balanced');
    expect(detector.getStrategy()).toBe('balanced');
  });

  it('支持反馈学习', () => {
    detector.setStrategy('balanced');
    const content = `
章节内容。

突然，危险降临！
这到底是怎么回事？
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

  it('有置信度评分', () => {
    const content = '短内容';
    const report = detector.detect(content, 1);
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });
});
