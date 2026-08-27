/**
 * SEO 推送管理路由（管理员）
 *
 * 提供手动触发百度收录推送的 API 和推送日志查询。
 */
import express from 'express';
import type { Request, Response } from 'express';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { requireAdmin } from '../middleware/auth.js';
import { pushAllToBaidu, type SeoPushDeps } from './seo-push.js';
import { appendSeoPushLog, readSeoPushLogs } from './seo-push-log.js';

const LOG_LIMIT = 50;

export function createSeoPushRoutes(
  bookStoreManager: BookStoreManager | undefined,
  dataDir: string,
) {
  const router = express.Router();

  router.use(requireAdmin());

  /**
   * POST /api/admin/seo/push/baidu
   * 手动触发全量推送到百度普通收录。
   */
  router.post('/baidu', async (_req: Request, res: Response) => {
    const platformUrl = process.env.PLATFORM_URL;
    const baiduToken = process.env.BAIDU_PUSH_TOKEN;

    const deps: SeoPushDeps = {
      bookStoreManager,
      platformUrl,
      baiduToken,
    };

    const result = await pushAllToBaidu(deps);

    // 写入推送日志
    await appendSeoPushLog(dataDir, {
      trigger: 'manual',
      urls: result.urls ?? [],
      urlCount: (result.urls ?? []).length,
      success: result.success,
      remain: result.remain,
      error: result.error,
    }).catch(() => { /* 日志写入失败不影响推送响应 */ });

    if (result.error) {
      return res.json({
        error: result.error,
        success: result.success,
        remain: result.remain,
      });
    }

    res.json({
      success: result.success,
      remain: result.remain,
      message: `成功推送 ${result.success} 条 URL 到百度`,
    });
  });

  /**
   * GET /api/admin/seo/push/logs
   * 获取最近的推送日志记录。
   */
  router.get('/logs', async (_req: Request, res: Response) => {
    try {
      const logs = await readSeoPushLogs(dataDir, LOG_LIMIT);
      res.json(logs);
    } catch {
      res.json([]);
    }
  });

  /**
   * GET /api/admin/seo/push/status
   * 查看推送配置状态。
   */
  router.get('/status', (_req: Request, res: Response) => {
    const platformUrl = process.env.PLATFORM_URL;
    const baiduToken = process.env.BAIDU_PUSH_TOKEN;
    res.json({
      platformUrl: platformUrl || '未配置',
      baiduToken: baiduToken ? '已配置' : '未配置',
      ready: !!(platformUrl && baiduToken),
    });
  });

  return router;
}
