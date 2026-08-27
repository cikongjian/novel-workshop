/**
 * Tests for state-reflog.ts — operation audit log (State Reflog)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  StateReflog,
  snapshotSaveEntry,
  arcCompressEntry,
  factGraphUpdateEntry,
  type ReflogEntry,
} from './state-reflog.js';

// ── Helpers ────────────────────────────────────────────────────────

/** Create a minimal entry payload (without id/timestamp) */
function makeEntry(
  overrides: Partial<Omit<ReflogEntry, 'id' | 'timestamp'>> = {},
): Omit<ReflogEntry, 'id' | 'timestamp'> {
  return {
    actor: 'agent',
    action: 'save_snapshot',
    entityType: 'story_state',
    reason: 'test entry',
    changeSize: 100,
    ...overrides,
  };
}

// ── Suite ──────────────────────────────────────────────────────────

describe('StateReflog', () => {
  let tmpDir: string;
  let filePath: string;
  let reflog: StateReflog;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reflog-test-'));
    filePath = path.join(tmpDir, 'reflog.json');
    reflog = new StateReflog(filePath);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── append ─────────────────────────────────────────────────────

  describe('append', () => {
    it('returns a full entry with id and timestamp', async () => {
      const result = await reflog.append(makeEntry());

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(result.actor).toBe('agent');
      expect(result.action).toBe('save_snapshot');
      expect(result.entityType).toBe('story_state');
      expect(result.reason).toBe('test entry');
      expect(result.changeSize).toBe(100);
    });

    it('assigns unique ids to each entry', async () => {
      const a = await reflog.append(makeEntry());
      const b = await reflog.append(makeEntry());
      expect(a.id).not.toBe(b.id);
    });

    it('preserves optional fields like chapterNumber and metadata', async () => {
      const result = await reflog.append(
        makeEntry({
          chapterNumber: 5,
          metadata: { key: 'value' },
        }),
      );
      expect(result.chapterNumber).toBe(5);
      expect(result.metadata).toEqual({ key: 'value' });
    });

    it('auto-flushes to disk when FLUSH_THRESHOLD (5) is reached', async () => {
      // Append exactly 5 entries to trigger auto-flush
      for (let i = 0; i < 5; i++) {
        await reflog.append(makeEntry({ reason: `entry-${i}` }));
      }

      // File should exist now due to auto-flush
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.entries).toHaveLength(5);
    });

    it('does not write to disk before threshold is reached', async () => {
      for (let i = 0; i < 4; i++) {
        await reflog.append(makeEntry());
      }

      // File should not exist yet (4 < threshold of 5)
      await expect(fs.access(filePath)).rejects.toThrow();
    });
  });

  // ── flush ──────────────────────────────────────────────────────

  describe('flush', () => {
    it('writes buffered entries to disk', async () => {
      await reflog.append(makeEntry({ reason: 'alpha' }));
      await reflog.append(makeEntry({ reason: 'beta' }));

      await reflog.flush();

      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0].reason).toBe('alpha');
      expect(data.entries[1].reason).toBe('beta');
    });

    it('is idempotent when buffer is empty', async () => {
      await reflog.flush();
      await reflog.flush();

      // File should not exist since nothing was appended
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('accumulates entries across multiple flushes', async () => {
      await reflog.append(makeEntry({ reason: 'first' }));
      await reflog.flush();

      await reflog.append(makeEntry({ reason: 'second' }));
      await reflog.flush();

      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0].reason).toBe('first');
      expect(data.entries[1].reason).toBe('second');
    });

    it('creates parent directories if they do not exist', async () => {
      const deepPath = path.join(tmpDir, 'a', 'b', 'c', 'reflog.json');
      const deepReflog = new StateReflog(deepPath);

      await deepReflog.append(makeEntry());
      await deepReflog.flush();

      const raw = await fs.readFile(deepPath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.entries).toHaveLength(1);
    });
  });

  // ── getHistory ─────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns entries in newest-first order', async () => {
      await reflog.append(makeEntry({ reason: 'oldest' }));
      await reflog.append(makeEntry({ reason: 'middle' }));
      await reflog.append(makeEntry({ reason: 'newest' }));

      const history = await reflog.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].reason).toBe('newest');
      expect(history[1].reason).toBe('middle');
      expect(history[2].reason).toBe('oldest');
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await reflog.append(makeEntry({ reason: `entry-${i}` }));
      }

      const history = await reflog.getHistory({ limit: 3 });
      expect(history).toHaveLength(3);
      // Should get the 3 newest entries
      expect(history[0].reason).toBe('entry-9');
      expect(history[1].reason).toBe('entry-8');
      expect(history[2].reason).toBe('entry-7');
    });

    it('defaults to limit of 100', async () => {
      // Append 105 entries
      for (let i = 0; i < 105; i++) {
        await reflog.append(makeEntry({ reason: `entry-${i}` }));
      }

      const history = await reflog.getHistory();
      expect(history).toHaveLength(100);
      // Newest first
      expect(history[0].reason).toBe('entry-104');
    });

    it('filters by entityType', async () => {
      await reflog.append(makeEntry({ entityType: 'story_state', reason: 'state' }));
      await reflog.append(makeEntry({ entityType: 'fact_graph', reason: 'fact' }));
      await reflog.append(makeEntry({ entityType: 'story_state', reason: 'state2' }));

      const history = await reflog.getHistory({ entityType: 'fact_graph' });
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe('fact');
    });

    it('filters by action', async () => {
      await reflog.append(makeEntry({ action: 'save_snapshot', reason: 'snap' }));
      await reflog.append(makeEntry({ action: 'compress_arc', reason: 'arc' }));
      await reflog.append(makeEntry({ action: 'save_snapshot', reason: 'snap2' }));

      const history = await reflog.getHistory({ action: 'compress_arc' });
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe('arc');
    });

    it('applies both entityType and action filters together', async () => {
      await reflog.append(makeEntry({
        entityType: 'story_state',
        action: 'save_snapshot',
        reason: 'match',
      }));
      await reflog.append(makeEntry({
        entityType: 'story_state',
        action: 'compress_arc',
        reason: 'no-match-action',
      }));
      await reflog.append(makeEntry({
        entityType: 'fact_graph',
        action: 'save_snapshot',
        reason: 'no-match-entity',
      }));

      const history = await reflog.getHistory({
        entityType: 'story_state',
        action: 'save_snapshot',
      });
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe('match');
    });

    it('returns empty array when no entries match', async () => {
      await reflog.append(makeEntry({ action: 'save_snapshot' }));

      const history = await reflog.getHistory({ action: 'compress_arc' });
      expect(history).toEqual([]);
    });

    it('returns empty array for a fresh reflog', async () => {
      const history = await reflog.getHistory();
      expect(history).toEqual([]);
    });

    it('flushes buffer before reading', async () => {
      // Append fewer than threshold so nothing auto-flushes
      await reflog.append(makeEntry({ reason: 'buffered' }));

      // getHistory should flush and return the buffered entry
      const history = await reflog.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe('buffered');
    });
  });

  // ── rotate ─────────────────────────────────────────────────────

  describe('rotate', () => {
    it('removes oldest entries when count exceeds maxEntries', async () => {
      for (let i = 0; i < 10; i++) {
        await reflog.append(makeEntry({ reason: `entry-${i}` }));
      }

      const removed = await reflog.rotate(6);
      expect(removed).toBe(4);

      const history = await reflog.getHistory({ limit: 10 });
      expect(history).toHaveLength(6);
      // The 4 oldest should be removed; newest 6 remain
      expect(history[0].reason).toBe('entry-9');
      expect(history[5].reason).toBe('entry-4');
    });

    it('returns 0 when entry count is within limit', async () => {
      await reflog.append(makeEntry());
      await reflog.append(makeEntry());

      const removed = await reflog.rotate(10);
      expect(removed).toBe(0);
    });

    it('returns 0 when entry count equals maxEntries exactly', async () => {
      for (let i = 0; i < 5; i++) {
        await reflog.append(makeEntry());
      }

      const removed = await reflog.rotate(5);
      expect(removed).toBe(0);
    });

    it('sets rotatedAt timestamp after rotation', async () => {
      for (let i = 0; i < 10; i++) {
        await reflog.append(makeEntry());
      }

      await reflog.rotate(5);

      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.rotatedAt).toBeDefined();
      expect(() => new Date(data.rotatedAt)).not.toThrow();
    });

    it('does not set rotatedAt when no rotation needed', async () => {
      await reflog.append(makeEntry());
      await reflog.flush();

      await reflog.rotate(100);

      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data.rotatedAt).toBeUndefined();
    });

    it('uses default maxEntries of 10000', async () => {
      // Just verify it doesn't throw; we won't actually create 10k+ entries
      await reflog.append(makeEntry());
      const removed = await reflog.rotate();
      expect(removed).toBe(0);
    });
  });

  // ── File I/O edge cases ────────────────────────────────────────

  describe('file I/O', () => {
    it('handles corrupted file gracefully (treats as empty)', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'not valid json', 'utf-8');

      // readData should fall back to { entries: [] }
      const history = await reflog.getHistory();
      expect(history).toEqual([]);
    });

    it('handles empty file gracefully', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, '', 'utf-8');

      const history = await reflog.getHistory();
      expect(history).toEqual([]);
    });

    it('persists data that survives across instances', async () => {
      await reflog.append(makeEntry({ reason: 'persistent' }));
      await reflog.flush();

      // Create a new instance pointing to the same file
      const reflog2 = new StateReflog(filePath);
      const history = await reflog2.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe('persistent');
    });

    it('writes valid JSON to disk', async () => {
      await reflog.append(
        makeEntry({ metadata: { nested: { deep: true } } }),
      );
      await reflog.flush();

      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      expect(data).toHaveProperty('entries');
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.entries[0].metadata).toEqual({ nested: { deep: true } });
    });
  });
});

// ── Helper factories ─────────────────────────────────────────────

describe('snapshotSaveEntry', () => {
  it('creates correct entry with defaults', () => {
    const entry = snapshotSaveEntry(3, 512);

    expect(entry.actor).toBe('agent');
    expect(entry.action).toBe('save_snapshot');
    expect(entry.entityType).toBe('story_state');
    expect(entry.chapterNumber).toBe(3);
    expect(entry.reason).toBe('保存第3章快照');
    expect(entry.changeSize).toBe(512);
  });

  it('accepts a custom actor', () => {
    const entry = snapshotSaveEntry(1, 100, 'user');
    expect(entry.actor).toBe('user');
  });

  it('does not include id or timestamp (those are added by append)', () => {
    const entry = snapshotSaveEntry(1, 100);
    expect(entry).not.toHaveProperty('id');
    expect(entry).not.toHaveProperty('timestamp');
  });
});

describe('arcCompressEntry', () => {
  it('creates correct entry for arc compression', () => {
    const entry = arcCompressEntry(1, 5, 2048);

    expect(entry.actor).toBe('system');
    expect(entry.action).toBe('compress_arc');
    expect(entry.entityType).toBe('story_state');
    expect(entry.reason).toBe('压缩第1-5章为弧线摘要');
    expect(entry.changeSize).toBe(2048);
    expect(entry.metadata).toEqual({ startChapter: 1, endChapter: 5 });
  });

  it('does not include chapterNumber (uses metadata instead)', () => {
    const entry = arcCompressEntry(1, 10, 500);
    expect(entry).not.toHaveProperty('chapterNumber');
  });
});

describe('factGraphUpdateEntry', () => {
  it('creates correct entry for fact graph updates', () => {
    const entry = factGraphUpdateEntry(7, 12);

    expect(entry.actor).toBe('agent');
    expect(entry.action).toBe('update_fact_graph');
    expect(entry.entityType).toBe('fact_graph');
    expect(entry.chapterNumber).toBe(7);
    expect(entry.reason).toBe('从第7章提取12条事实');
    expect(entry.changeSize).toBe(12);
  });
});
