import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { getNovelsDir } from '../src/config/index.js';
import type { ComicManifest } from '../src/comic/comic-image-service.js';

const DEFAULT_MAX_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 清理未发布的章节漫画草稿（manifest.status='draft' 且生成时间超过阈值）。
 *
 * - 已发布（status='published'）的保留，供书城读者；
 * - 作者浏览器本地 IndexedDB 缓存不受影响（仍在作者设备，可重新发布上传）；
 * - 服务器端只删 draft，省测试服务器空间。
 *
 * 用法：
 *   nw data clean-comic-drafts                       # 预览（dry-run）清理 7 天前的 draft
 *   nw data clean-comic-drafts --apply               # 执行清理
 *   nw data clean-comic-drafts --max-age-days 3 --apply
 *   nw data clean-comic-drafts --novel <novelId> --apply
 */
export async function runCleanComicDraftsCli(args: string[], invocation: string): Promise<number> {
  const maxAgeDays = parseNumberArg(args, '--max-age-days', DEFAULT_MAX_AGE_DAYS);
  const dryRun = !args.includes('--apply');
  const novelFilter = parseStringArg(args, '--novel');

  const cutoff = Date.now() - maxAgeDays * DAY_MS;
  const novelsDir = getNovelsDir();

  console.log(invocation);
  console.log(`${dryRun ? '[预览模式] ' : ''}清理 ${maxAgeDays} 天前未发布的漫画草稿（status=draft）`);
  console.log(`novels 目录：${novelsDir}${novelFilter ? `（仅 ${novelFilter}）` : ''}\n`);

  let novelDirs: Dirent[];
  try {
    novelDirs = await fs.readdir(novelsDir, { withFileTypes: true });
  } catch (err) {
    console.log(`novels 目录不存在或不可读，无内容可清理。${err instanceof Error ? `（${err.message}）` : ''}`);
    return 0;
  }

  let chapterCount = 0;
  let novelCount = 0;
  let totalBytes = 0;

  for (const novelEntry of novelDirs) {
    if (!novelEntry.isDirectory()) continue;
    const novelId = novelEntry.name;
    if (novelFilter && novelId !== novelFilter) continue;

    const comicsDir = path.join(novelsDir, novelId, 'comics');
    let chapterDirs: Dirent[];
    try {
      chapterDirs = await fs.readdir(comicsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    let novelDeleted = false;
    for (const chapterEntry of chapterDirs) {
      if (!chapterEntry.isDirectory()) continue;
      const chapterPath = path.join(comicsDir, chapterEntry.name);
      const manifestPath = path.join(chapterPath, 'manifest.json');

      let manifest: ComicManifest;
      try {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ComicManifest;
      } catch {
        continue;
      }
      if (manifest.status !== 'draft') continue;

      const generatedAt = Date.parse(manifest.generatedAt);
      if (!Number.isFinite(generatedAt) || generatedAt > cutoff) continue;

      const size = await dirSize(chapterPath);
      console.log(`  ${dryRun ? '将删除' : '已删除'} ${novelId}/${chapterEntry.name}（生成于 ${manifest.generatedAt}，约 ${Math.round(size / 1024)}KB）`);
      chapterCount += 1;
      totalBytes += size;
      novelDeleted = true;
      if (!dryRun) {
        await fs.rm(chapterPath, { recursive: true, force: true });
      }
    }
    if (novelDeleted) novelCount += 1;
  }

  console.log(`\n${dryRun ? '预览：' : '完成：'}清理 ${chapterCount} 个章节草稿，涉及 ${novelCount} 本小说，释放约 ${Math.round(totalBytes / 1024)}KB`);
  if (dryRun && chapterCount > 0) {
    console.log('加 --apply 执行实际删除。');
  }
  return 0;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch (err) {
        console.warn(`[clean-comic-drafts] 跳过无法 stat 的文件 ${full}：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return total;
}

function parseNumberArg(args: string[], flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  if (idx < 0) return fallback;
  const n = Number(args[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStringArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
