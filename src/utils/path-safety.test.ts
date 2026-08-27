import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPathWithin, resolvePathWithin } from './path-safety.js';

describe('path safety', () => {
  const root = path.resolve('data', 'novels');

  it('resolves normal nested paths', () => {
    expect(resolvePathWithin(root, 'novel-1', 'chapters', '001.md'))
      .toBe(path.join(root, 'novel-1', 'chapters', '001.md'));
  });

  it.each(['../secret', '..\\secret', '/absolute/path', 'safe/../../../secret']) (
    'rejects escaping segment %s',
    (segment) => {
      expect(() => resolvePathWithin(root, segment)).toThrow(/path traversal/);
    },
  );

  it('rejects null bytes', () => {
    expect(() => resolvePathWithin(root, 'bad\0name')).toThrow(/null byte/);
  });

  it('recognizes paths at or below the root only', () => {
    expect(isPathWithin(root, root)).toBe(true);
    expect(isPathWithin(root, path.join(root, 'child'))).toBe(true);
    expect(isPathWithin(root, path.resolve(root, '..', 'sibling'))).toBe(false);
  });
});
