import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddingClient } from '../models/types.js';
import { VectorStore } from './vector-store.js';

const tempRoots: string[] = [];

async function createStore(embedBatch: EmbeddingClient['embedBatch']): Promise<VectorStore> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-vector-retry-'));
  tempRoots.push(root);
  return new VectorStore(root, {
    provider: 'test',
    model: 'test',
    dimensions: 3,
    embedQuery: vi.fn(async () => [1, 0, 0]),
    embedBatch,
  });
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('VectorStore embedding retries', () => {
  it('retries transient embedding failures before indexing', async () => {
    const embedBatch = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce([[1, 0, 0]]);
    const store = await createStore(embedBatch);

    await store.indexText({ category: 'character_state', entityId: 'char-1:ch1', text: 'state' });

    expect(embedBatch).toHaveBeenCalledTimes(3);
    store.close();
  });

  it('rejects instead of silently succeeding after retries are exhausted', async () => {
    const embedBatch = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    const store = await createStore(embedBatch);

    await expect(store.indexText({
      category: 'character_state',
      entityId: 'char-1:ch1',
      text: 'state',
    })).rejects.toThrow('embedding failed after 3 attempts');

    expect(embedBatch).toHaveBeenCalledTimes(3);
    store.close();
  });

  it('preserves the previous index when replacement embeddings fail', async () => {
    const embedBatch = vi.fn()
      .mockResolvedValueOnce([[1, 0, 0]])
      .mockRejectedValue(new Error('provider unavailable'));
    const store = await createStore(embedBatch);
    await store.indexText({ category: 'character_state', entityId: 'char-1:ch1', text: 'old state' });

    await expect(store.indexText({
      category: 'character_state',
      entityId: 'char-1:ch1',
      text: 'new state',
    })).rejects.toThrow('embedding failed after 3 attempts');

    await expect(store.getEntityTexts('character_state', 'char-1:ch1')).resolves.toEqual([
      { text: 'old state', chapterNumber: 0 },
    ]);
    store.close();
  });
});
