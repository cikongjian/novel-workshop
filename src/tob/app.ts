import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from '../server/middleware/rate-limit.js';
import { createTobRouter } from './routes/tob-router.js';
import { createTobBroadcaster } from './ws.js';
import type { Logger } from '../utils/logger.js';
import type { TobPipelineSummary } from './types.js';
import type { NovelGenre, NovelStatus } from '../novel/types.js';

type TobAppDeps = {
  logger: Logger;
  apiToken: string;
  rateLimitMax: number;
  allowMockGeneration: boolean;
  hasModelClient: boolean;
  workspacePipelineLinked: boolean;
  repository: import('./storage/tob-repository.js').TobRepository;
  pipelines: TobPipelineSummary[];
  dataDir: string;
  listSourceNovels: () => Promise<Array<{
    id: string;
    title: string;
    genre: NovelGenre;
    status: NovelStatus;
    chapterCount: number;
    updatedAt: string;
  }>>;
  getSourceNovelChapterStats: (novelId: string) => Promise<{
    novelId: string;
    chapterCount: number;
    minChapterNumber: number | null;
    maxChapterNumber: number | null;
  }>;
};

/**
 * 恒定时间比较，避免通过响应时间差逐字节爆破 token
 */
function isBearerTokenValid(authorizationHeader: string, apiToken: string): boolean {
  const expected = `Bearer ${apiToken}`;
  const providedBuffer = Buffer.from(authorizationHeader, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function createAuthMiddleware(apiToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      next();
      return;
    }
    // 未配置 token 时放行：仅适用于绑定回环的本机开发。
    // 生产环境已在 createTobApp 中强制要求 token，走不到这里。
    if (!apiToken) {
      next();
      return;
    }
    if (isBearerTokenValid(req.headers.authorization ?? '', apiToken)) {
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized' });
  };
}

export function createTobApp(deps: TobAppDeps) {
  // ToB 接口会消耗模型额度并读取源站小说，无鉴权暴露的代价远高于主应用
  if (!deps.apiToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TOB_API_TOKEN must be configured in production environment');
    }
    deps.logger.warn(
      'TOB_API_TOKEN 未配置，ToB HTTP 与 WebSocket 接口当前无鉴权，仅可用于绑定回环的本机开发',
    );
  }

  const app = express();
  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  const broadcaster = createTobBroadcaster(wss, deps.apiToken);

  deps.logger.info('ToB WebSocket server initialized', { path: '/ws' });

  app.use(helmet());
  app.use(express.json({ limit: '4mb' }));

  const allowedOrigins = new Set(
    (process.env.TOB_CORS_ORIGINS ?? process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) {
    throw new Error('TOB_CORS_ORIGINS must be configured in production environment');
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin ?? '';
    // 未配置白名单时只在非生产放开；生产环境上面已硬失败，
    // 不再回落到"反射任意来源"，否则任意站点都能跨域打这个服务
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.size === 0) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (allowedOrigins.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use('/api/tob', rateLimit({ max: deps.rateLimitMax }));
  app.use('/api/tob', createAuthMiddleware(deps.apiToken));
  app.use(
    '/api/tob',
    createTobRouter({
      repository: deps.repository,
      allowMockGeneration: deps.allowMockGeneration,
      hasModelClient: deps.hasModelClient,
      workspacePipelineLinked: deps.workspacePipelineLinked,
      pipelines: deps.pipelines,
      dataDir: deps.dataDir,
      listSourceNovels: deps.listSourceNovels,
      getSourceNovelChapterStats: deps.getSourceNovelChapterStats,
      broadcaster,
    }),
  );

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    deps.logger.error('Unhandled ToB request error', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'internal server error' });
  });

  return { app, server };
}
