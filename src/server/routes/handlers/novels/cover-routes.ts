import type { Router } from 'express';
import { Buffer } from 'node:buffer';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { getConfig } from '../../../../config/index.js';
import {
  deleteNovelCoverFile,
  resolveNovelCoverPath,
  saveNovelCoverFile,
} from '../../helpers/novel-cover-storage.js';
import {
  acceptsWebp,
  normalizeWidth,
  serveOptimizedImage,
} from '../../../../utils/image-optimizer.js';
import { type LoadNovelRouteFn } from './route-support.js';

/** 封面文件最大大小（5MB） */
const MAX_COVER_SIZE = 5 * 1024 * 1024;

type NovelCoverRouteDeps = {
  novelManager: NovelManager;
  bookStoreManager?: BookStoreManager;
  loadOwnedNovelForWrite: LoadNovelRouteFn;
};

function detectImageExtByMagic(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return '.png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return '.webp';
  return null;
}

export function registerNovelCoverRoutes(
  router: Router,
  { novelManager, bookStoreManager, loadOwnedNovelForWrite }: NovelCoverRouteDeps,
): void {
  router.get('/cover/:id', async (req, res) => {
    try {
      const novel = await novelManager.getNovel(req.params.id);
      if (!novel.coverImage) {
        res.status(404).json({ error: '无封面' });
        return;
      }
      const coverPath = await resolveNovelCoverPath(novelManager, req.params.id, novel.coverImage);
      if (!coverPath) {
        res.status(404).json({ error: '封面不存在' });
        return;
      }

      const thumbWidth = normalizeWidth(req.query.w as string | undefined);
      const wantsWebp = acceptsWebp(req.headers.accept);
      const versionToken = Buffer.from(
        `${novel.coverImage}:${novel.updatedAt}:w${thumbWidth ?? 'full'}:${wantsWebp ? 'webp' : 'orig'}`,
        'utf-8',
      ).toString('base64url');
      const etag = `W/"${versionToken}"`;
      const ifNoneMatch = req.headers['if-none-match'];
      const requestedVersion = typeof req.query.v === 'string' ? req.query.v.trim() : '';

      res.setHeader('ETag', etag);
      if (novel.updatedAt) {
        res.setHeader('Last-Modified', new Date(novel.updatedAt).toUTCString());
      }
      if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader(
        'Cache-Control',
        requestedVersion
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=300, must-revalidate',
      );
      res.setHeader('Vary', 'Accept');

      const result = await serveOptimizedImage(coverPath, {
        width: thumbWidth,
        acceptsWebp: wantsWebp,
      });
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', result.size);
      result.stream.pipe(res);
    } catch (err) {
      const message = safeErrorMessage(err, '获取封面失败');
      if (message.includes('不存在') || message.includes('ENOENT')) {
        res.status(404).json({ error: '封面不存在' });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.post('/cover/:id', async (req, res) => {
    try {
      const { data, generated } = req.body as { data?: string; mimeType?: string; generated?: boolean };

      // 检查是否禁用手动上传封面（AI生成的封面不拦截）
      if (getConfig().disableCoverUpload && !generated) {
        res.status(403).json({
          error: '手动上传封面功能已关闭，请使用AI生成封面',
          code: 'COVER_UPLOAD_DISABLED',
        });
        return;
      }

      const ownedNovel = await loadOwnedNovelForWrite(req, res);
      if (!ownedNovel) return;
      if (!data || typeof data !== 'string') {
        res.status(400).json({ error: '缺少 data 字段（base64）' });
        return;
      }
      const buf = Buffer.from(data, 'base64');

      // 文件大小限制
      if (buf.length > MAX_COVER_SIZE) {
        res.status(400).json({
          error: `封面图片文件过大，不能超过 ${MAX_COVER_SIZE / 1024 / 1024}MB`,
          code: 'COVER_SIZE_EXCEEDED',
        });
        return;
      }

      const detectedExt = detectImageExtByMagic(buf);
      if (!detectedExt) {
        res.status(400).json({ error: '上传的文件不是有效图片（仅支持 JPEG/PNG/WebP）' });
        return;
      }
      const fileName = `cover-${Date.now()}${detectedExt}`;

      await saveNovelCoverFile(
        novelManager,
        req.params.id,
        fileName,
        buf,
        ownedNovel.coverImage,
      );
      const updated = await novelManager.updateNovel(req.params.id, { coverImage: fileName });
      if (bookStoreManager) {
        await bookStoreManager.onNovelCoverChanged(req.params.id);
      }
      res.json(updated);
    } catch (err) {
      const message = safeErrorMessage(err, '上传封面失败');
      res.status(500).json({ error: message });
    }
  });

  router.delete('/cover/:id', async (req, res) => {
    try {
      const novel = await loadOwnedNovelForWrite(req, res);
      if (!novel) return;
      await deleteNovelCoverFile(novelManager, req.params.id, novel.coverImage);
      const updated = await novelManager.updateNovel(req.params.id, { coverImage: undefined });
      if (bookStoreManager) {
        await bookStoreManager.onNovelCoverChanged(req.params.id);
      }
      res.json(updated);
    } catch (err) {
      const message = safeErrorMessage(err, '删除封面失败');
      res.status(500).json({ error: message });
    }
  });
}
