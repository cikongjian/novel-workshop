import fs from 'node:fs/promises';
import path from 'node:path';
import type { NovelManager } from '../../../novel/novel-manager.js';
import { resolvePathWithin } from '../../../utils/path-safety.js';

type CoverDirs = {
  canonicalNovelDir: string;
  legacyNovelDir: string;
};

function getCoverDirs(novelManager: NovelManager, novelId: string): CoverDirs {
  const novelsRoot = novelManager.getDataDir();
  return {
    canonicalNovelDir: resolvePathWithin(path.join(novelsRoot, 'novels'), novelId),
    legacyNovelDir: resolvePathWithin(novelsRoot, novelId),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true }).catch(() => {});
}

export async function resolveNovelCoverPath(
  novelManager: NovelManager,
  novelId: string,
  fileName: string,
): Promise<string | null> {
  const { canonicalNovelDir, legacyNovelDir } = getCoverDirs(novelManager, novelId);
  const canonicalPath = resolvePathWithin(canonicalNovelDir, fileName);
  if (await fileExists(canonicalPath)) {
    return canonicalPath;
  }

  const legacyPath = resolvePathWithin(legacyNovelDir, fileName);
  if (!(await fileExists(legacyPath))) {
    return null;
  }

  // Move legacy covers into the canonical novel directory so future sync/export includes them.
  await fs.mkdir(canonicalNovelDir, { recursive: true });
  await fs.copyFile(legacyPath, canonicalPath);
  await removeIfExists(legacyPath);
  return canonicalPath;
}

export async function saveNovelCoverFile(
  novelManager: NovelManager,
  novelId: string,
  fileName: string,
  content: Buffer,
  previousFileName?: string,
): Promise<void> {
  const { canonicalNovelDir, legacyNovelDir } = getCoverDirs(novelManager, novelId);
  await fs.mkdir(canonicalNovelDir, { recursive: true });

  if (previousFileName && previousFileName !== fileName) {
    await Promise.all([
      removeIfExists(resolvePathWithin(canonicalNovelDir, previousFileName)),
      removeIfExists(resolvePathWithin(legacyNovelDir, previousFileName)),
    ]);
  }

  await fs.writeFile(resolvePathWithin(canonicalNovelDir, fileName), content);
}

export async function deleteNovelCoverFile(
  novelManager: NovelManager,
  novelId: string,
  fileName?: string,
): Promise<void> {
  if (!fileName) return;
  const { canonicalNovelDir, legacyNovelDir } = getCoverDirs(novelManager, novelId);
  await Promise.all([
    removeIfExists(resolvePathWithin(canonicalNovelDir, fileName)),
    removeIfExists(resolvePathWithin(legacyNovelDir, fileName)),
  ]);
}
