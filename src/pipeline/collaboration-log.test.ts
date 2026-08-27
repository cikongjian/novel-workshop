/**
 * 协作日志测试
 */
import { describe, it, expect } from 'vitest';
import { CollaborationLog } from './collaboration-log.js';

describe('CollaborationLog', () => {
  it('should add entries with auto timestamp', () => {
    const log = new CollaborationLog();
    log.add({
      round: 1,
      fromAgent: 'editor',
      toAgent: 'writer',
      feedbackType: 'quality-issue',
      summary: '段落过短',
    });

    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].round).toBe(1);
    expect(entries[0].fromAgent).toBe('editor');
    expect(entries[0].toAgent).toBe('writer');
    expect(entries[0].feedbackType).toBe('quality-issue');
    expect(entries[0].timestamp).toBeTruthy();
  });

  it('should return a copy of entries', () => {
    const log = new CollaborationLog();
    log.add({
      round: 1,
      fromAgent: 'reader',
      toAgent: 'editor',
      feedbackType: 'style-adjustment',
      summary: '风格不一致',
    });

    const entries1 = log.getEntries();
    const entries2 = log.getEntries();
    expect(entries1).not.toBe(entries2);
    expect(entries1).toEqual(entries2);
  });

  it('should generate summary for empty log', () => {
    const log = new CollaborationLog();
    expect(log.getSummary()).toBe('无协作记录');
  });

  it('should generate summary with grouped counts', () => {
    const log = new CollaborationLog();
    log.add({ round: 1, fromAgent: 'editor', toAgent: 'writer', feedbackType: 'quality-issue', summary: 'a' });
    log.add({ round: 2, fromAgent: 'editor', toAgent: 'writer', feedbackType: 'style-adjustment', summary: 'b' });
    log.add({ round: 1, fromAgent: 'reader', toAgent: 'editor', feedbackType: 'plot-correction', summary: 'c' });

    const summary = log.getSummary();
    expect(summary).toContain('共 3 条');
    expect(summary).toContain('editor -> writer(2次)');
    expect(summary).toContain('reader -> editor(1次)');
  });

  it('should clear all entries', () => {
    const log = new CollaborationLog();
    log.add({ round: 1, fromAgent: 'editor', toAgent: 'writer', feedbackType: 'quality-issue', summary: 'x' });
    log.clear();
    expect(log.getEntries()).toHaveLength(0);
    expect(log.getSummary()).toBe('无协作记录');
  });
});
