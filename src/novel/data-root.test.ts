import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { normalizeNovelDataRoot, resolveNovelStorageDir } from './data-root.js';

describe('normalizeNovelDataRoot', () => {
  it('keeps data root unchanged', () => {
    const input = path.resolve('data');
    expect(normalizeNovelDataRoot(input)).toBe(input);
  });

  it('strips trailing novels directory', () => {
    const input = path.resolve('data', 'novels');
    expect(normalizeNovelDataRoot(input)).toBe(path.resolve('data'));
  });

  it('prefers legacy nested dir when direct meta is missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-data-root-'));
    const novelId = 'test-novel';
    const directDir = path.join(tempRoot, 'novels', novelId);
    const legacyDir = path.join(tempRoot, 'novels', 'novels', novelId);
    fs.mkdirSync(directDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'novel.json'), '{}', 'utf8');

    expect(resolveNovelStorageDir(tempRoot, novelId)).toBe(legacyDir);
  });

  it.each([
    path.join('..', 'escape'),
    path.resolve('outside-novel'),
  ])('rejects path traversal novel id %s', (novelId) => {
    expect(() => resolveNovelStorageDir(path.resolve('data'), novelId)).toThrow(/path traversal/);
  });
});
