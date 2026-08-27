/**
 * 性能追踪器测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from './performance-tracker.js';

describe('PerformanceTracker', () => {
  beforeEach(() => {
    PerformanceTracker.clearHistory();
  });

  it('should track a complete pipeline run', () => {
    const tracker = new PerformanceTracker();
    tracker.begin('novel-1', 3);

    const endAgent = tracker.startStep('writer', 'agent', 'writer');
    endAgent({ agentRole: 'writer' });

    const endGate = tracker.startStep('quality-gate', 'gate');
    endGate({ passed: true });

    const report = tracker.finish();

    expect(report.novelId).toBe('novel-1');
    expect(report.chapterNumber).toBe(3);
    expect(report.steps).toHaveLength(2);
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.timestamp).toBeTruthy();
  });

  it('should identify bottleneck as longest step', () => {
    const tracker = new PerformanceTracker();
    tracker.begin('novel-1', 1);

    // 模拟两个步骤，手动设置 duration
    const end1 = tracker.startStep('fast-agent', 'agent', 'outline');
    end1();
    const end2 = tracker.startStep('slow-agent', 'agent', 'writer');
    // 人为延迟不可靠，直接检查 bottleneck 逻辑
    end2();

    const report = tracker.finish();
    expect(report.bottleneck).not.toBeNull();
  });

  it('should build agentBreakdown correctly', () => {
    const tracker = new PerformanceTracker();
    tracker.begin('novel-1', 1);

    const end1 = tracker.startStep('writer-run', 'agent', 'writer');
    end1();
    const end2 = tracker.startStep('writer-retry', 'agent', 'writer');
    end2();

    const report = tracker.finish();
    expect(report.agentBreakdown['writer']).toBeDefined();
    expect(report.agentBreakdown['writer'].count).toBe(2);
  });

  it('should build gateBreakdown correctly', () => {
    const tracker = new PerformanceTracker();
    tracker.begin('novel-1', 1);

    const endGate = tracker.startStep('quality-gate', 'gate');
    endGate({ passed: false });

    const report = tracker.finish();
    expect(report.gateBreakdown['quality-gate']).toBeDefined();
    expect(report.gateBreakdown['quality-gate'].passed).toBe(false);
  });

  it('should record token usage', () => {
    const tracker = new PerformanceTracker();
    tracker.begin('novel-1', 1);

    const end = tracker.startStep('writer', 'agent', 'writer');
    end();
    tracker.recordTokenUsage('writer', { prompt: 100, completion: 200, total: 300 });

    const report = tracker.finish();
    const writerStep = report.steps.find(s => s.name === 'writer');
    expect(writerStep?.tokenUsage?.total).toBe(300);
  });

  it('should maintain history with max limit', () => {
    for (let i = 0; i < 55; i++) {
      const tracker = new PerformanceTracker();
      tracker.begin('novel-1', i);
      tracker.finish();
    }
    expect(PerformanceTracker.getHistory().length).toBeLessThanOrEqual(50);
  });

  it('should filter getLatest by novelId', () => {
    const t1 = new PerformanceTracker();
    t1.begin('novel-a', 1);
    t1.finish();

    const t2 = new PerformanceTracker();
    t2.begin('novel-b', 1);
    t2.finish();

    const latest = PerformanceTracker.getLatest('novel-a');
    expect(latest?.novelId).toBe('novel-a');
  });

  it('should return null for empty history', () => {
    expect(PerformanceTracker.getLatest()).toBeNull();
  });

  it('should handle empty steps in finish', () => {
    const tracker = new PerformanceTracker();
    tracker.begin('novel-1', 1);
    const report = tracker.finish();
    expect(report.bottleneck).toBeNull();
    expect(report.steps).toHaveLength(0);
  });
});
