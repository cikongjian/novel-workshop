import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeRemoteApiBase } from './remote-novel-data-client.js';
import { writeRemoteNovelDataReport } from './remote-novel-data-report.js';
import { parseRemoteNovelDataOptions } from './remote-novel-data.js';

const NOVEL_ID = '11111111-1111-4111-8111-111111111111';

describe('remote novel data CLI', () => {
  it('accepts structural repair scopes for remote organization', () => {
    const options = parseRemoteNovelDataOptions([
      'organize', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--scope', 'threads,finalization,facts',
    ], {});

    expect(options.scopes).toEqual(['threads', 'finalization', 'facts']);
  });

  it('reads connection defaults from environment', () => {
    const options = parseRemoteNovelDataOptions(['audit', '--novel', NOVEL_ID], {
      NW_REMOTE_BASE_URL: 'https://example.com',
      NW_REMOTE_TOKEN: 'secret-token',
    });
    expect(options.baseUrl).toBe('https://example.com');
    expect(options.action).toBe('audit');
    expect(options.novelId).toBe(NOVEL_ID);
  });

  it('parses a read-only remote connection diagnosis', () => {
    const options = parseRemoteNovelDataOptions([
      'doctor', '--base-url', 'https://example.com', '--token', 'token', '--retries', '2',
    ], {});
    expect(options.action).toBe('doctor');
    expect(options.retries).toBe(2);
    expect(options.apply).toBe(false);
  });

  it('parses cover prompt diagnostics with an AI-sized timeout', () => {
    const options = parseRemoteNovelDataOptions([
      'cover-prompt', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID,
    ], {});
    expect(options.action).toBe('cover-prompt');
    expect(options.novelId).toBe(NOVEL_ID);
    expect(options.timeoutMs).toBe(180_000);
    expect(() => parseRemoteNovelDataOptions([
      'cover-prompt', '--base-url', 'https://example.com', '--token', 'token',
    ], {})).toThrow('--novel');
  });

  it('requires an exact confirmation before applying organization', () => {
    expect(() => parseRemoteNovelDataOptions([
      'organize', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--apply', '--confirm', '22222222-2222-4222-8222-222222222222',
    ], {})).toThrow('--confirm');
  });

  it('rejects remote plaintext HTTP unless explicitly allowed', () => {
    expect(() => normalizeRemoteApiBase('http://production.example.com')).toThrow('明文 HTTP');
    expect(normalizeRemoteApiBase('http://127.0.0.1:3313')).toBe('http://127.0.0.1:3313/api');
    expect(normalizeRemoteApiBase('https://example.com/platform/')).toBe('https://example.com/platform/api');
    expect(() => normalizeRemoteApiBase('https://admin:secret@example.com')).toThrow('用户名或密码');
  });

  it('validates organization scopes', () => {
    expect(() => parseRemoteNovelDataOptions([
      'organize', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--scope', 'characters,raw-files',
    ], {})).toThrow('--scope');
  });

  it('allows bounded batch audit but never batch organization', () => {
    const audit = parseRemoteNovelDataOptions([
      'audit', '--all', '--base-url', 'https://example.com', '--token', 'token', '--limit', '20',
    ], {});
    expect(audit.all).toBe(true);
    expect(audit.limit).toBe(20);
    expect(() => parseRemoteNovelDataOptions([
      'organize', '--all', '--base-url', 'https://example.com', '--token', 'token',
    ], {})).toThrow('--all');
  });

  it('validates reviewed plan tokens and explicit rollback confirmation', () => {
    const token = 'a'.repeat(64);
    const organize = parseRemoteNovelDataOptions([
      'organize', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--apply', '--confirm', NOVEL_ID, '--plan-token', token,
    ], {});
    expect(organize.planToken).toBe(token);

    const rollback = parseRemoteNovelDataOptions([
      'rollback', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--backup', 'backup-1', '--apply', '--confirm', NOVEL_ID,
    ], {});
    expect(rollback.backupId).toBe('backup-1');
    expect(() => parseRemoteNovelDataOptions([
      'rollback', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--backup', 'backup-1',
    ], {})).toThrow('--apply');
  });

  it('requires exact confirmation for remote empty-chapter repair', () => {
    const token = 'b'.repeat(64);
    const options = parseRemoteNovelDataOptions([
      'chapter-repair', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--apply', '--confirm', NOVEL_ID, '--plan-token', token,
    ], {});
    expect(options.action).toBe('chapter-repair');
    expect(options.planToken).toBe(token);
    expect(() => parseRemoteNovelDataOptions([
      'chapter-repair', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--apply', '--confirm', '22222222-2222-4222-8222-222222222222',
    ], {})).toThrow('--confirm');
  });

  it('keeps remote memory checks read-only and requires confirmation for rebuilds', () => {
    const check = parseRemoteNovelDataOptions([
      'memory-check', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID,
    ], {});
    expect(check.apply).toBe(false);

    const rebuild = parseRemoteNovelDataOptions([
      'memory-rebuild', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--apply', '--confirm', NOVEL_ID,
    ], {});
    expect(rebuild.apply).toBe(true);
    expect(rebuild.timeoutMs).toBe(600_000);
    expect(() => parseRemoteNovelDataOptions([
      'memory-rebuild', '--base-url', 'https://example.com', '--token', 'token',
      '--novel', NOVEL_ID, '--apply', '--confirm', '22222222-2222-4222-8222-222222222222',
    ], {})).toThrow('--confirm');
  });

  it('accepts a durable report path without persisting connection credentials', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-novel-report-'));
    try {
      const outputPath = path.join(root, 'reports', 'audit.json');
      const options = parseRemoteNovelDataOptions([
        'audit', '--base-url', 'https://example.com', '--token', 'secret-token',
        '--novel', NOVEL_ID, '--out', outputPath,
      ], {});
      expect(options.outputPath).toBe(outputPath);

      const resolved = await writeRemoteNovelDataReport(outputPath, {
        schemaVersion: 1,
        action: 'audit',
        generatedAt: '2026-07-12T00:00:00.000Z',
        request: { novelId: NOVEL_ID },
        result: { summary: { healthScore: 92 } },
      });
      const report = await fs.readFile(resolved, 'utf8');
      expect(JSON.parse(report)).toMatchObject({
        schemaVersion: 1,
        action: 'audit',
        request: { novelId: NOVEL_ID },
        result: { summary: { healthScore: 92 } },
      });
      expect(report).not.toContain('secret-token');
      expect(await fs.readdir(path.dirname(outputPath))).toEqual(['audit.json']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
