import path from 'node:path';

export function isPathWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolvePathWithin(root: string, ...segments: string[]): string {
  if (segments.some((segment) => segment.includes('\0'))) {
    throw new Error('Invalid path: null byte is not allowed');
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  if (!isPathWithin(resolvedRoot, target)) {
    throw new Error('Invalid path: path traversal detected');
  }
  return target;
}
