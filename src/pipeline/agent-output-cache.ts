/**
 * Agent 输出缓存 - 减少 world-builder / character 的重复 AI 调用
 *
 * 核心思路：
 * - 缓存最近一次 Agent 输出，按 (novelId, agentRole) 存储
 * - 下一章生成时，检测输入指纹是否变化
 * - 如果大纲/设定没有显著变化，直接复用缓存，跳过 AI 调用
 * - 如果有新场景/新角色/新设定，重新调用 AI
 *
 * 指纹计算：对 Agent 输入的关键字段做 hash，如果 hash 相同则命中缓存
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveNovelStorageDir } from '../novel/data-root.js';

const CACHE_FILENAME = 'agent-output-cache.json';

type CacheEntry = {
  /** 输入指纹，用于判断是否需要重新生成 */
  fingerprint: string;
  /** 缓存的 Agent 输出内容 */
  content: string;
  /** 生成时间 */
  generatedAt: string;
  /** 来源章节号 */
  sourceChapter: number;
  /** 命中次数 */
  hitCount: number;
};

type CacheFile = {
  /** 按 `${novelId}:${agentRole}` 存储的缓存项 */
  entries: Record<string, CacheEntry>;
};

function getCacheFilePath(novelsDir: string, novelId: string): string {
  return path.join(resolveNovelStorageDir(novelsDir, novelId), CACHE_FILENAME);
}

function cacheKey(novelId: string, agentRole: string): string {
  return `${novelId}:${agentRole}`;
}

/**
 * 计算输入指纹
 *
 * 只取"稳定字段"做 hash，确保相邻章节缓存可命中：
 * - worldContext: 世界设定（章节间稳定，新增场景/规则时才变）
 * - characterContext: 角色档案（章节间稳定，新增角色时才变）
 * - worldContract: 世界观契约（章节间稳定）
 * - includeOutline=true 时包含当前章大纲，供章节级 Agent 使用
 * - cacheVersion 用于提示词或输出契约升级后主动淘汰旧缓存
 */
export function computeAgentFingerprint(input: {
  outlineText?: string;
  worldContext?: string;
  characterContext?: string;
  worldContract?: string;
  includeOutline?: boolean;
  cacheVersion?: string;
}): string {
  const parts: string[] = [];

  if (input.cacheVersion) {
    parts.push(`version:${input.cacheVersion}`);
  }

  if (input.includeOutline && input.outlineText) {
    parts.push(`outline:${input.outlineText.slice(0, 4000)}`);
  }

  // 世界设定取前 2000 字（新增场景/规则时才变）
  if (input.worldContext) {
    parts.push(`world:${input.worldContext.slice(0, 2000)}`);
  }

  // 角色档案取前 2000 字（新增角色时才变）
  if (input.characterContext) {
    parts.push(`char:${input.characterContext.slice(0, 2000)}`);
  }

  // 世界观契约取前 500 字
  if (input.worldContract) {
    parts.push(`contract:${input.worldContract.slice(0, 500)}`);
  }

  return createHash('md5').update(parts.join('||')).digest('hex').slice(0, 16);
}

/**
 * 读取缓存
 */
async function readCache(novelsDir: string, novelId: string): Promise<CacheFile> {
  const filePath = getCacheFilePath(novelsDir, novelId);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return { entries: {} };
  }
}

/**
 * 写入缓存
 */
async function writeCache(novelsDir: string, novelId: string, cache: CacheFile): Promise<void> {
  const filePath = getCacheFilePath(novelsDir, novelId);
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * 尝试从缓存读取 Agent 输出
 *
 * @returns 缓存的内容，如果没有命中则返回 undefined
 */
export async function getCachedAgentOutput(
  novelsDir: string,
  novelId: string,
  agentRole: string,
  fingerprint: string,
): Promise<string | undefined> {
  try {
    const cache = await readCache(novelsDir, novelId);
    const key = cacheKey(novelId, agentRole);
    const entry = cache.entries[key];

    if (!entry || entry.fingerprint !== fingerprint) {
      return undefined;
    }

    // 更新命中次数（异步写入，不阻塞）
    entry.hitCount++;
    writeCache(novelsDir, novelId, cache).catch(() => {
      // 静默失败
    });

    return entry.content;
  } catch {
    return undefined;
  }
}

/**
 * 保存 Agent 输出到缓存
 */
export async function saveAgentOutputToCache(
  novelsDir: string,
  novelId: string,
  agentRole: string,
  content: string,
  fingerprint: string,
  chapterNumber: number,
): Promise<void> {
  try {
    const cache = await readCache(novelsDir, novelId);
    const key = cacheKey(novelId, agentRole);

    cache.entries[key] = {
      fingerprint,
      content,
      generatedAt: new Date().toISOString(),
      sourceChapter: chapterNumber,
      hitCount: 0,
    };

    await writeCache(novelsDir, novelId, cache);
  } catch {
    // 静默失败，缓存不影响生成
  }
}

/**
 * 清除指定小说的 Agent 缓存（可选，用于强制刷新）
 */
export async function clearAgentCache(novelsDir: string, novelId: string): Promise<void> {
  try {
    const filePath = getCacheFilePath(novelsDir, novelId);
    await fs.unlink(filePath);
  } catch {
    // 文件不存在，忽略
  }
}
