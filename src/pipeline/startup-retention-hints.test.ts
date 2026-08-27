import { afterEach, describe, expect, it } from 'vitest';
import {
  buildStartupRetentionHints,
  normalizeStartupPlatformProfile,
} from './startup-retention-hints.js';

const originalStartupRetentionEnabled = process.env.STARTUP_RETENTION_ENABLED;

afterEach(() => {
  if (originalStartupRetentionEnabled === undefined) {
    delete process.env.STARTUP_RETENTION_ENABLED;
    return;
  }
  process.env.STARTUP_RETENTION_ENABLED = originalStartupRetentionEnabled;
});

describe('normalizeStartupPlatformProfile', () => {
  it('normalizes supported aliases', () => {
    expect(normalizeStartupPlatformProfile('番茄')).toBe('fanqie');
    expect(normalizeStartupPlatformProfile('QIDIAN')).toBe('qidian');
    expect(normalizeStartupPlatformProfile('')).toBe('auto');
  });
});

describe('buildStartupRetentionHints', () => {
  it('adds fanqie hard constraints even when generic startup hints are disabled', () => {
    delete process.env.STARTUP_RETENTION_ENABLED;
    const hints = buildStartupRetentionHints({
      chapterNumber: 1,
      protagonistNames: ['林舟'],
      genre: 'modern',
      platformProfile: 'fanqie',
    });

    expect(hints.directionHint).toContain('番茄首章平台范式');
    expect(hints.openingHint).toContain('第一屏先上事');
    expect(hints.payoffHint).toContain('爽点');
  });

  it('adds qidian longform guidance for chapter three', () => {
    delete process.env.STARTUP_RETENTION_ENABLED;
    const hints = buildStartupRetentionHints({
      chapterNumber: 3,
      protagonistNames: ['顾临'],
      genre: 'scifi',
      platformProfile: 'qidian',
    });

    expect(hints.directionHint).toContain('为什么这书能写长');
    expect(hints.payoffHint).toContain('设定推动剧情');
  });

  it('merges generic hard hints with selected platform hints', () => {
    process.env.STARTUP_RETENTION_ENABLED = 'true';
    const hints = buildStartupRetentionHints({
      chapterNumber: 1,
      protagonistNames: ['沈砚'],
      genre: 'historical',
      platformProfile: 'fanqie',
    });

    expect(hints.directionHint).toContain('首章留存硬约束');
    expect(hints.directionHint).toContain('番茄首章平台范式');
  });

  it('adds food-startup guidance for survival cooking openings', () => {
    process.env.STARTUP_RETENTION_ENABLED = 'true';
    const hints = buildStartupRetentionHints({
      chapterNumber: 1,
      protagonistNames: ['苏晚'],
      genre: 'historical',
      novelTitle: '被逐农女，开局一碗面，馋哭满朝文武',
      novelSynopsis: '她被逐出家门后，靠一碗面活下来，并从路边摊开始翻身。',
      novelTags: ['种田', '美食', '逆袭'],
      platformProfile: 'fanqie',
    });

    expect(hints.directionHint).toContain('美食/种田求生');
    expect(hints.openingHint).toContain('处理食材');
    expect(hints.payoffHint).toContain('香气勾住');
  });
});
