import { describe, expect, it } from 'vitest';
import {
  findCommandByTopic,
  formatCommandHelp,
  formatGlobalHelp,
  formatGroupHelp,
  isKnownGroup,
  resolveCliCommand,
} from './parser.js';

describe('resolveCliCommand', () => {
  it('resolves grouped commands and preserves passthrough args', () => {
    const resolved = resolveCliCommand(['memory', 'reindex', '--novel', 'abc']);
    expect(resolved).not.toBeNull();
    expect(resolved?.command.script).toBe('scripts/reindex-memory');
    expect(resolved?.args).toEqual(['--novel', 'abc']);
  });

  it('resolves alias commands', () => {
    const resolved = resolveCliCommand(['report:world-gate', '--novel', 'abc']);
    expect(resolved).not.toBeNull();
    expect(resolved?.command.path).toEqual(['world', 'gate-report']);
    expect(resolved?.args).toEqual(['--novel', 'abc']);
  });

  it('returns null for unknown commands', () => {
    expect(resolveCliCommand(['missing', 'command'])).toBeNull();
  });
});

describe('help formatters', () => {
  it('knows registered groups', () => {
    expect(isKnownGroup(['backup'])).toBe(true);
    expect(isKnownGroup(['world'])).toBe(true);
    expect(isKnownGroup(['missing'])).toBe(false);
  });

  it('finds commands by topic', () => {
    expect(findCommandByTopic(['backup', 'storage-cleanup'])?.script).toBe('scripts/backup-storage-cleanup');
    expect(findCommandByTopic(['cleanup:storage'])?.path).toEqual(['backup', 'storage-cleanup']);
    expect(findCommandByTopic(['dev', 'system-resources'])?.script).toBe('scripts/system-resources');
    expect(findCommandByTopic(['status:system-resources'])?.path).toEqual(['dev', 'system-resources']);
    expect(findCommandByTopic(['dev', 'check-mojibake'])?.script).toBe('scripts/check-mojibake');
    expect(findCommandByTopic(['check:mojibake'])?.path).toEqual(['dev', 'check-mojibake']);
    expect(findCommandByTopic(['log:query'])?.path).toEqual(['dev', 'log-query']);
    expect(findCommandByTopic(['log:cleanup'])?.path).toEqual(['dev', 'log-cleanup']);
    expect(findCommandByTopic(['audit:titles'])?.path).toEqual(['audit', 'titles']);
    expect(findCommandByTopic(['regen:titles'])?.path).toEqual(['audit', 'regenerate-titles']);
    expect(findCommandByTopic(['remote', 'novel-data'])?.path).toEqual(['remote', 'novel-data']);
    expect(findCommandByTopic(['story-state:backfill'])?.path).toEqual(['story-state', 'backfill']);
    expect(findCommandByTopic(['build:copy-assets'])?.path).toEqual(['dev', 'copy-build-assets']);
    expect(findCommandByTopic(['compare:orchestrator'])?.path).toEqual(['dev', 'compare-orchestrator']);
  });

  it('renders global help with examples', () => {
    const help = formatGlobalHelp('nw');
    expect(help).toContain('Novel Workshop 命令行工具');
    expect(help).toContain('用法：nw <group> <command> [...args]');
    expect(help).toContain('audit');
    expect(help).toContain('backup');
    expect(help).toContain('memory');
  });

  it('renders group and command help', () => {
    const groupHelp = formatGroupHelp('memory', 'nw');
    expect(groupHelp).toContain('memory 命令');
    expect(groupHelp).toContain('reindex');

    const backupHelp = formatGroupHelp('backup', 'nw');
    expect(backupHelp).toContain('backup 命令');
    expect(backupHelp).toContain('storage-cleanup');

    const command = findCommandByTopic(['memory', 'reindex']);
    expect(command).not.toBeNull();
    const commandHelp = formatCommandHelp(command!, 'nw');
    expect(commandHelp).toContain('用法：nw memory reindex [...args]');
    expect(commandHelp).toContain('在命令后附加 --help');
  });
});
