import express from 'express';
import type { Express, Request, Response } from 'express';
import path from 'node:path';
import helmet from 'helmet';
import compression from 'compression';
import type { AuthConfig } from '../../auth/types.js';
import { createAiUsageRequestMiddleware } from '../../ai/usage-request-middleware.js';
import { createEmailService, getSmtpConfigFromEnv } from '../../email/email-service.js';
import { ReferralService } from '../../referral/referral-service.js';
import { startReferralScheduler } from '../../referral/referral-scheduler.js';
import { createLogger } from '../../utils/logger.js';
import { createAuthMiddleware, requireAdmin } from '../middleware/auth.js';
import { createIpBlacklistService } from '../middleware/ip-blacklist.js';
import { createGuestVisitTrackingMiddleware } from '../middleware/guest-visit-tracker.js';
import { createRequestPerformanceMiddleware } from '../middleware/request-performance.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { createHttpsRedirect } from '../middleware/https-redirect.js';
import { createAdminIpBlacklistRouter } from '../routes/admin-ip-blacklist.js';
import { createAdminLogsRouter } from '../routes/admin-logs.js';
import { createApplicationsRouter } from '../routes/applications.js';
import { createAuthRouter } from '../routes/auth.js';
import { TrialAccountService } from '../../auth/trial-account-service.js';
import { registerDebugRoleRoutes } from '../routes/auth/debug-role.js';
import { createCaptchaRouter } from '../routes/captcha.js';
import { createReferralRouter } from '../routes/referral.js';
import { createSliderCaptchaRouter } from '../routes/slider-captcha.js';
import { getPasswordPolicy } from '../../auth/password-policy.js';
import type { AppDeps } from './types.js';

const appLogger = createLogger('server');

function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  if (buf.length > 0) {
    (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
  }
}

export type CoreSetupResult = {
  staticDir: string;
  referralService?: ReferralService;
};

export async function setupCoreApp(
  app: Express,
  deps: AppDeps,
  authConfig: AuthConfig,
): Promise<CoreSetupResult> {
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  // HTTP 响应压缩（gzip/deflate），跳过流式 SSE 和 WebSocket
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['accept'] === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
    threshold: 1024, // 小于 1KB 不压缩
  }));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  const serverHost = process.env.SERVER_HOST;
  if (process.env.NODE_ENV === 'production' && serverHost) {
    app.use(createHttpsRedirect(serverHost));
  }

  app.use(createRequestPerformanceMiddleware());

  app.use(express.json({ limit: '10mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: false, verify: captureRawBody }));

  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) {
    throw new Error('CORS_ORIGINS must be configured in production environment');
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin ?? '';
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.size === 0) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (allowedOrigins.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-nw-user-api-model');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // DNA 插画公开读取（无需鉴权，img 标签直接请求）
  app.get('/api/fun/dna/illustration/:questionId', async (req, res) => {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const questionId = Number.parseInt(req.params.questionId, 10);
      if (!Number.isInteger(questionId) || questionId < 1 || questionId > 35) {
        res.status(404).end();
        return;
      }
      const imgPath = path.resolve(__dirname, '../../../data/dna-illustrations', `${questionId}.png`);
      try {
        await fs.access(imgPath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buf = await fs.readFile(imgPath);
        res.end(buf);
      } catch {
        res.status(204).end();
      }
    } catch {
      res.status(204).end();
    }
  });

  app.use('/api', createAuthMiddleware(authConfig));
  app.use('/api', createGuestVisitTrackingMiddleware(deps.guestVisitManager));
  app.use('/api', createAiUsageRequestMiddleware());

  if (process.env.NODE_ENV !== 'production') {
    app.use('/api', (req, _res, next) => {
      appLogger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  const captchaRouter = createCaptchaRouter({ redis: deps.redis });
  const verifyCaptcha = (captchaRouter as any).verifyCaptcha as (captchaId: string, captchaText: string) => Promise<boolean>;
  app.use('/api/captcha', captchaRouter);

  if (authConfig.enabled && deps.authDb) {
    const debugRouter = express.Router();
    registerDebugRoleRoutes(debugRouter);
    app.use('/api/auth', debugRouter);
  }

  const sliderCaptchaRouter = createSliderCaptchaRouter({ redis: deps.redis });
  const verifySliderCaptcha = (sliderCaptchaRouter as any).verifySliderCaptcha as (
    challengeId: string,
    position: number,
    durationMs: number,
  ) => Promise<boolean>;
  app.use('/api/slider-captcha', sliderCaptchaRouter);

  // 密码策略端点始终可用（无需认证，仅返回配置信息）
  app.get('/api/auth/password-policy', (_req, res) => {
    res.json(getPasswordPolicy());
  });

  const ipBlacklistService = createIpBlacklistService({
    redis: deps.redis,
    failureThreshold: Number.parseInt(process.env.IP_BLACKLIST_FAILURE_THRESHOLD ?? '5', 10),
    failureWindowMs: Number.parseInt(process.env.IP_BLACKLIST_FAILURE_WINDOW_MIN ?? '10', 10) * 60_000,
    blockDurationMs: Number.parseInt(process.env.IP_BLACKLIST_BLOCK_DURATION_MIN ?? '60', 10) * 60_000,
  });

  let referralService: ReferralService | undefined;
  if (deps.authDb && deps.billingService) {
    referralService = new ReferralService(deps.authDb, deps.billingService);
    startReferralScheduler(referralService);
  }
  app.use('/api/referral', referralService
    ? createReferralRouter(referralService)
    : (_req: Request, res: Response) => {
        res.status(503).json({ error: '拉新功能需要认证系统支持，请配置 AUTH_ENABLED=true' });
      });

  if (deps.authDb && authConfig.enabled) {
    const trialAccountService = new TrialAccountService(deps.dataDir || path.join(process.cwd(), 'data'));
    app.use('/api/auth', createAuthRouter({
      db: deps.authDb,
      redis: deps.redis!,
      config: authConfig,
      dataDir: deps.dataDir,
      billingService: deps.billingService,
      referralService,
      novelManager: deps.novelManager,
      bookStoreManager: deps.bookStoreManager,
      contentAuditService: deps.contentAuditService,
      complianceEventManager: deps.complianceEventManager,
      verifySliderCaptcha,
      ipBlacklistService,
      notificationService: deps.notificationService,
    }, trialAccountService));
    app.use('/api/auth/admin/ip-blacklist', createAdminIpBlacklistRouter({ ipBlacklistService }));
    app.use('/api/auth/admin/logs', await createAdminLogsRouter(requireAdmin));

    let emailService = createEmailService(getSmtpConfigFromEnv());
    const previousOnSettingsChanged = deps.onSettingsChanged;
    deps.onSettingsChanged = () => {
      previousOnSettingsChanged?.();
      emailService = createEmailService(getSmtpConfigFromEnv());
    };
    app.use('/api/applications', createApplicationsRouter({
      db: deps.authDb,
      getEmailService: () => emailService,
      verifyCaptcha,
      verifySliderCaptcha,
      getPlatformUrl: () => process.env.PLATFORM_URL,
    }));
  }

  const rateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX ?? '300', 10);
  app.use('/api', rateLimit({
    max: Number.isFinite(rateLimitMax) ? rateLimitMax : 300,
    redis: deps.redis,
    skip: (req) => {
      if (req.method !== 'GET') return false;
      return /generation-status|batch\/status|by-chapter|comics\/\d+$|_status|chapters\/\d+$/.test(req.path);
    },
  }));

  const staticDir = path.resolve('web/dist');
  // 哈希 chunk 文件（带内容哈希）使用长期强缓存，index.html 已在 operational-routes 设置 no-cache
  app.use(express.static(staticDir, {
    maxAge: '1y',
    etag: true,
    index: false, // 禁止 express.static 处理 index.html，统一由 SPA fallback 路由处理
  }));

  return { staticDir, referralService };
}
