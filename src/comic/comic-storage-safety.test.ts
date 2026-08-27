import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterDNAStore } from './comic-dna-store.js';
import { ComicPipeline } from './comic-pipeline.js';
import type { CharacterDNA } from './comic-dna-types.js';

describe('comic storage path safety', () => {
  let root = '';
  let novelsDir = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'nw-comic-storage-'));
    novelsDir = path.join(root, 'novels');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores character DNA inside the selected novel directory', async () => {
    const store = new CharacterDNAStore(novelsDir);
    await store.write('novel-1', 'character-1', { version: 1 } as CharacterDNA);

    const stored = await readFile(
      path.join(novelsDir, 'novel-1', 'character-dna', 'character-1.json'),
      'utf8',
    );
    expect(JSON.parse(stored)).toMatchObject({ version: 1 });
  });

  it.each([
    ['../escape', 'character-1'],
    ['novel-1', '../escape'],
  ])('rejects escaping novel and character identifiers', async (novelId, characterId) => {
    const store = new CharacterDNAStore(novelsDir);
    await expect(store.write(novelId, characterId, { version: 1 } as CharacterDNA))
      .rejects.toThrow(/path traversal/);
  });

  it('rejects an escaping novel id before running the comic agents', async () => {
    const novelManager = { getNovel: vi.fn() };
    const pipeline = new ComicPipeline(
      {} as never,
      {} as never,
      {} as never,
      novelManager as never,
      novelsDir,
    );

    await expect(pipeline.designScenes('../escape', 1, {} as never))
      .rejects.toThrow(/path traversal/);
    expect(novelManager.getNovel).not.toHaveBeenCalled();
  });
});
