import { describe, it, expect } from 'vitest';
import { DialoguePacingDetector } from './dialogue-pacing-detector.js';

describe('DialoguePacingDetector (进化版)', () => {
  const detector = new DialoguePacingDetector();

  it('空内容返回通过', () => {
    const report = detector.detect('', 1);
    expect(report.passed).toBe(true);
    expect(report.findings.length).toBe(0);
    expect(report.score).toBe(100);
  });

  it('检测对话占比过高', () => {
    const LQ = '\u201c';
    const RQ = '\u201d';
    const paras = [];
    for (let i = 0; i < 20; i++) {
      paras.push(`${LQ}你来了啊，好久不见，最近过得怎么样？${RQ}他说道。\n${LQ}还好吧，就是有点忙。${RQ}她回答。`);
    }
    const content = paras.join('\n\n');
    const report = detector.detect(content, 1);
    const highFinding = report.findings.find(f => f.code === 'dialogue-ratio-high');
    expect(highFinding).toBeDefined();
    expect(highFinding?.level).toBe('warn');
  });

  it('检测对话占比过低', () => {
    const content = Array(10).fill('天空中飘着白云，阳光洒在大地上，一切都显得格外美好。').join('\n\n');
    const report = detector.detect(content, 1);
    const lowFinding = report.findings.find(f => f.code === 'dialogue-ratio-low');
    expect(lowFinding).toBeDefined();
  });

  it('检测段落过短（碎片化）', () => {
    const paragraphs = Array(30).fill('他点了点头。');
    const content = paragraphs.join('\n\n');
    const report = detector.detect(content, 1);
    const shortFinding = report.findings.find(f => f.code === 'paragraph-too-short');
    expect(shortFinding).toBeDefined();
  });

  it('检测对话标签病', () => {
    const LQ = '\u201c';
    const RQ = '\u201d';
    const paras = [];
    for (let i = 0; i < 60; i++) {
      paras.push(`${LQ}第${i}句。${RQ}他缓缓说道，又轻声笑道。`);
    }
    const content = paras.join('\n\n');
    const report = detector.detect(content, 1);
    const saidFinding = report.findings.find(f => f.code === 'said-bookism');
    expect(saidFinding).toBeDefined();
  });

  it('支持切换进化策略', () => {
    detector.setStrategy('precision');
    expect(detector.getStrategy()).toBe('precision');
    detector.setStrategy('balanced');
    expect(detector.getStrategy()).toBe('balanced');
  });

  it('有评分和规则统计', () => {
    const content = '普通内容段落，用来测试基本功能。';
    const report = detector.detect(content, 1);
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(40);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.totalRules).toBeGreaterThan(0);
  });

  it('支持反馈学习', () => {
    const content = Array(30).fill('他点了点头。').join('\n\n');
    const report = detector.detect(content, 1);
    const firstFinding = report.findings[0];
    if (firstFinding) {
      detector.recordFalsePositive(firstFinding.ruleId);
      detector.recordTruePositive(firstFinding.ruleId);
    }
    const stats = detector.getStats();
    expect(stats.totalRules).toBeGreaterThan(0);
    expect(stats.enabledRules).toBeGreaterThan(0);
  });
});
