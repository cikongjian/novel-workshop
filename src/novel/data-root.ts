import path from 'node:path';
import fs from 'node:fs';
import { resolvePathWithin } from '../utils/path-safety.js';

export function normalizeNovelDataRoot(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  return path.basename(resolved).toLowerCase() === 'novels'
    ? path.dirname(resolved)
    : resolved;
}

export function getNovelStorageCandidates(inputPath: string, novelId: string): {
  directDir: string;
  legacyDir: string;
} {
  const dataRoot = normalizeNovelDataRoot(inputPath);
  const novelsRoot = path.resolve(dataRoot, 'novels');
  return {
    directDir: resolvePathWithin(novelsRoot, novelId),
    legacyDir: resolvePathWithin(path.join(novelsRoot, 'novels'), novelId),
  };
}

export function resolveNovelStorageDir(inputPath: string, novelId: string): string {
  const dataRoot = normalizeNovelDataRoot(inputPath);
  const novelsRoot = path.resolve(dataRoot, 'novels');

  const { directDir, legacyDir } = getNovelStorageCandidates(inputPath, novelId);

  // 路径边界校验：防止 novelId 包含 ../ 导致路径遍历
  const directMeta = path.join(directDir, 'novel.json');
  const legacyMeta = path.join(legacyDir, 'novel.json');

  if (fs.existsSync(directMeta)) return directDir;
  if (fs.existsSync(legacyMeta)) return legacyDir;

  const hasDirectDir = fs.existsSync(directDir);
  const hasLegacyDir = fs.existsSync(legacyDir);

  if (hasDirectDir && !hasLegacyDir) return directDir;
  if (hasLegacyDir && !hasDirectDir) return legacyDir;

  return directDir;
}
