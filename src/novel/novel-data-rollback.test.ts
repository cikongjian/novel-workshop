import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovelManager } from './novel-manager.js';
import { NovelPaths } from './novel-paths.js';
import { writeJson } from './fs-helpers.js';
import {
  NovelDataBackupNotFoundError,
  rollbackNovelData,
} from './novel-data-rollback.js';

const roots: string[] = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-data-rollback-'));
  roots.push(root);
  const manager = new NovelManager(path.join(root, 'novels'));
  const novel = await manager.createNovel({ title: '回滚测试小说', genre: 'modern' });
  return { manager, novel, paths: new NovelPaths(manager.getDataDir()) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('rollbackNovelData', () => {
  it('creates a safety backup before restoring and audits the restored data', async () => {
    const { manager, novel, paths } = await fixture();
    const target = {
      id: 'target-backup', novelId: novel.id, filename: 'target.tar.gz', size: 100,
      createdAt: '2026-07-10T00:00:00.000Z',
    };
    const safety = {
      id: 'safety-backup', novelId: novel.id, filename: 'safety.tar.gz', size: 120,
      createdAt: '2026-07-12T00:00:00.000Z',
    };
    const calls: string[] = [];
    const backupManager = {
      listBackups: vi.fn(async () => [target]),
      createBackup: vi.fn(async () => { calls.push('backup'); return safety; }),
      restoreBackup: vi.fn(async () => {
        calls.push('restore');
        await writeJson(paths.charactersPath(novel.id), []);
      }),
    };

    const result = await rollbackNovelData({
      novelManager: manager,
      backupManager,
      novelId: novel.id,
      backupId: target.id,
    });

    expect(calls).toEqual(['backup', 'restore']);
    expect(result.restoredBackup.id).toBe(target.id);
    expect(result.safetyBackup.id).toBe(safety.id);
    expect(result.reportAfter.novel.id).toBe(novel.id);
  });

  it('rejects an unknown backup without creating a new backup', async () => {
    const { manager, novel } = await fixture();
    const createBackup = vi.fn();
    await expect(rollbackNovelData({
      novelManager: manager,
      novelId: novel.id,
      backupId: 'missing',
      backupManager: {
        listBackups: vi.fn(async () => []),
        createBackup,
        restoreBackup: vi.fn(),
      },
    })).rejects.toBeInstanceOf(NovelDataBackupNotFoundError);
    expect(createBackup).not.toHaveBeenCalled();
  });
});
