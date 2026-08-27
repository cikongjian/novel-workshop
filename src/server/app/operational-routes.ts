import path from 'node:path';
import type { Express } from 'express';
import type { WebSocketServer } from 'ws';
import type { AuthConfig } from '../../auth/types.js';
import { getConfig } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { getPerfSnapshot } from '../../utils/perf.js';
import { errorSanitizer } from '../middleware/error-sanitizer.js';
import { handleSeoMetaInjection } from '../middleware/seo-meta-injector.js';
import { isSeoFileRoute, handleSeoFileRoute, type SeoRouteDeps } from '../routes/seo.js';
import type { AppDeps } from './types.js';
import { brand } from '../../config/brand.js';

const wsLogger = createLogger('WebSocket');

export function registerOperationalRoutes(
  app: Express,
  deps: AppDeps,
  authConfig: AuthConfig,
  staticDir: string,
  wss: WebSocketServer,
): void {
  // SEO 依赖（用于 SPA fallback 中统一处理 SEO 请求）
  const seoDeps: SeoRouteDeps = {
    bookStoreManager: deps.bookStoreManager,
    platformUrl: process.env.PLATFORM_URL,
  };

  const seoMetaDeps = {
    bookStoreManager: deps.bookStoreManager,
    novelManager: deps.novelManager,
    authDb: deps.authDb,
    platformUrl: process.env.PLATFORM_URL,
    staticDir,
  };

  app.get('/api/health', async (_req, res) => {
    const mem = process.memoryUsage();

    let redisOk: boolean | undefined;
    if (deps.redis) {
      try {
        await deps.redis.ping();
        redisOk = true;
      } catch {
        redisOk = false;
      }
    }

    const healthy = redisOk !== false;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      authEnabled: authConfig.enabled,
      commentEnabled: getConfig().commentEnabled,
      system: {
        uptime: Math.floor(process.uptime()),
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        wsConnections: wss.clients.size,
        ...(redisOk !== undefined && { redis: redisOk }),
      },
      ...(process.env.NODE_ENV !== 'production'
        ? {
            performance: getPerfSnapshot({
              limit: 10,
              recentSlowLimit: 5,
            }),
          }
        : {}),
      features: {
        novels: true,
        chapters: true,
        characters: true,
        castSession: !!deps.modelClient,
        world: true,
        outline: true,
        adaptations: !!deps.adaptationManager,
        generate: !!(deps.chapterPipeline && deps.revisionPipeline),
        trends: !!deps.trendsService,
        publishing: !!deps.publishingAdvisorService,
        bookstore: !!(deps.bookStoreManager && deps.auditQueueManager),
        reports: !!(deps.reportManager && deps.bookStoreManager),
        moderation: !!(deps.bookStoreManager && deps.userBanManager),
      },
    });
  });

  // SPA fallback：统一处理所有非 API 的 GET 请求
  // 内部按优先级处理：SEO 文件 → SEO meta 注入 → 原始 index.html
  // 静态资源 404 拦截：不存在的 .js/.css/.woff2 等资源直接返回 404，
  // 避免被下方 SPA fallback 通配路由兜底返回 index.html（浏览器会报 MIME 错误）
  const STATIC_ASSET_RE = /\.(?:js|mjs|cjs|css|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|map|txt|xml|webmanifest)$/i;

  app.get('{*path}', async (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    if (STATIC_ASSET_RE.test(req.path)) {
      res.status(404).end();
      return;
    }

    const requestPath = req.path;

    // 1. SEO 文件路由：robots.txt / sitemap.xml / feed.xml
    if (isSeoFileRoute(requestPath)) {
      try {
        const handled = await handleSeoFileRoute(requestPath, seoDeps, res);
        if (handled) return;
      } catch (err) {
        wsLogger.warn('SEO 文件路由处理失败', {
          path: requestPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. SEO meta 注入（公开页面：首页、书城详情、章节阅读等）
    try {
      const seoResult = await handleSeoMetaInjection(requestPath, seoMetaDeps);
      if (seoResult?.seoInjected) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(seoResult.html);
        return;
      }
    } catch (err) {
      wsLogger.warn('SEO meta 注入失败，回退到原始 index.html', {
        path: requestPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 3. SPA fallback：返回原始 index.html
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.sendFile(path.resolve(staticDir, 'index.html'), (err) => {
      if (err) {
        res
      .status(200)
      .send(`${brand.displayName} - 前端尚未构建，请访问 /api/health 检查服务状态`);
      }
    });
  });

  const maxWsConnections = 200;
  wss.on('connection', (ws) => {
    if (wss.clients.size > maxWsConnections) {
      wsLogger.warn(`WebSocket 连接数超限（${wss.clients.size}/${maxWsConnections}），拒绝新连接`);
      ws.close(1013, 'Server too busy');
      return;
    }
    wsLogger.info(`客户端已连接，当前连接数: ${wss.clients.size}`);
    ws.on('close', () => {
      wsLogger.info(`客户端已断开，当前连接数: ${wss.clients.size}`);
    });
  });

  app.use(errorSanitizer());
}
