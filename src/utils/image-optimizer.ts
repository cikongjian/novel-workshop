/**
 * 图片按需优化：缩放 + WebP 转换 + 磁盘缓存
 *
 * 设计原则：
 * - 原图不改动，缩略图缓存到 .thumbs/ 子目录
 * - Accept 头支持 WebP 时自动转换，否则保持原格式
 * - 缓存命中直接返回路径，不重复处理
 * - sharp 不可用时优雅降级为原图直传
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import { createLogger } from './logger.js';

const log = createLogger('ImageOptimizer');

// ─── 常量 ───────────────────────────────────────────────
const THUMBS_DIR_NAME = '.thumbs';

/** 允许的缩放宽度白名单，防止恶意请求生成无限种尺寸 */
const ALLOWED_WIDTHS = new Set([200, 400, 600, 800]);
const WEBP_QUALITY = 80;
const JPEG_QUALITY = 82;

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// ─── sharp 懒加载（避免未安装时崩溃） ──────────────────
type SharpFactory = typeof import('sharp').default;
let _sharp: SharpFactory | null | undefined; // undefined = 未尝试加载

async function getSharp(): Promise<SharpFactory | null> {
  if (_sharp !== undefined) return _sharp;
  try {
    const mod = await import('sharp');
    _sharp = mod.default;
    log.info('sharp 已加载，图片优化功能可用');
    return _sharp;
  } catch {
    _sharp = null;
    log.warn('sharp 未安装或加载失败，图片将以原图直传');
    return null;
  }
}

// ─── 类型 ───────────────────────────────────────────────
export interface ImageServeResult {
  stream: ReadStream;
  contentType: string;
  size: number;
  filePath: string;
}

export type ImageServeFile = Omit<ImageServeResult, 'stream'>;

export interface ImageServeOptions {
  /** 请求的缩放宽度，仅白名单值有效 */
  width?: number;
  /** 客户端是否接受 WebP（从 Accept 头判断） */
  acceptsWebp?: boolean;
}

// ─── 核心函数 ───────────────────────────────────────────

/**
 * 获取优化后的图片流。
 * 如果 sharp 可用且请求了缩放/WebP，先查缓存再按需生成。
 * 否则直接返回原图流。
 */
export async function serveOptimizedImage(
  originalPath: string,
  options: ImageServeOptions = {},
): Promise<ImageServeResult> {
  const file = await resolveOptimizedImageFile(originalPath, options);
  return {
    ...file,
    stream: createReadStream(file.filePath),
  };
}

export async function resolveOptimizedImageFile(
  originalPath: string,
  options: ImageServeOptions = {},
): Promise<ImageServeFile> {
  const ext = path.extname(originalPath).toLowerCase();
  const sharp = await getSharp();

  // 确定目标宽度
  const requestedWidth = options.width && ALLOWED_WIDTHS.has(options.width)
    ? options.width
    : undefined;

  // 确定目标格式
  const useWebp = sharp !== null && options.acceptsWebp === true;

  // 无需优化：sharp 不可用 或 没有任何转换请求
  if (!sharp || (!requestedWidth && !useWebp)) {
    return resolveOriginalFile(originalPath, ext);
  }

  // 构建缓存路径
  const targetExt = useWebp ? '.webp' : ext;
  const widthSuffix = requestedWidth ? `_w${requestedWidth}` : '_orig';
  const baseName = path.basename(originalPath, ext);
  const thumbDir = path.join(path.dirname(originalPath), THUMBS_DIR_NAME);
  const cachedPath = path.join(thumbDir, `${baseName}${widthSuffix}${targetExt}`);

  // 命中缓存
  try {
    const stat = await fs.stat(cachedPath);
    // 校验缓存是否过期（原图更新后缓存失效）
    const origStat = await fs.stat(originalPath);
    if (stat.mtimeMs >= origStat.mtimeMs) {
      return {
        contentType: MIME_MAP[targetExt] || 'application/octet-stream',
        size: stat.size,
        filePath: cachedPath,
      };
    }
  } catch {
    // 缓存不存在，继续生成
  }

  // 生成缩略图
  try {
    await fs.mkdir(thumbDir, { recursive: true });
    let pipeline = sharp(originalPath);

    if (requestedWidth) {
      pipeline = pipeline.resize(requestedWidth, undefined, {
        withoutEnlargement: true, // 不放大小图
        fit: 'inside',
      });
    }

    if (useWebp) {
      pipeline = pipeline.webp({ quality: WEBP_QUALITY });
    } else if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    }

    await pipeline.toFile(cachedPath);
    const stat = await fs.stat(cachedPath);

    return {
      contentType: MIME_MAP[targetExt] || 'application/octet-stream',
      size: stat.size,
      filePath: cachedPath,
    };
  } catch (err) {
    log.warn(`缩略图生成失败，降级为原图: ${err instanceof Error ? err.message : err}`);
    return resolveOriginalFile(originalPath, ext);
  }
}

async function resolveOriginalFile(filePath: string, ext: string): Promise<ImageServeFile> {
  const stat = await fs.stat(filePath);
  return {
    contentType: MIME_MAP[ext] || 'image/jpeg',
    size: stat.size,
    filePath,
  };
}

/**
 * 从 Accept 头判断是否支持 WebP
 */
export function acceptsWebp(acceptHeader?: string): boolean {
  return typeof acceptHeader === 'string' && acceptHeader.includes('image/webp');
}

/**
 * 将请求参数中的宽度值标准化到白名单
 * 返回 undefined 表示使用原尺寸
 */
export function normalizeWidth(raw?: string | number): number | undefined {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!n || isNaN(n)) return undefined;
  // 对齐到最近的白名单宽度（向上取整）
  for (const w of [200, 400, 600, 800]) {
    if (n <= w) return w;
  }
  return 800;
}
