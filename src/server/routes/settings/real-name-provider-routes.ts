import type { Router } from 'express';
import { z } from 'zod';
import { getConfig } from '../../../config/index.js';
import {
  getAllowedRealNameVerificationProviders,
  verifyRealNameWithSelectedProvider,
  type RealNameVerificationProviderId,
} from '../../../auth/real-name-provider.js';

const TestRealNameProviderBody = z.object({
  provider: z.enum(['basic_submission', 'mock_identity', 'http_bridge']),
  realName: z.string().trim().min(1, '请输入测试姓名'),
  idNumber: z.string().trim().min(6, '请输入测试身份证号'),
  phoneNumber: z.string().trim().min(6, '请输入测试手机号'),
  httpUrl: z.string().optional(),
  httpToken: z.string().optional(),
  httpTimeoutMs: z.number().int().min(1000).max(60000).optional(),
  httpHeaders: z.string().optional(),
});

function resolveMaskedHttpToken(raw: string | undefined): string {
  if (!raw?.trim()) {
    return '';
  }
  if (raw.includes('****')) {
    return getConfig().realNameVerification.httpToken;
  }
  return raw;
}

function resolveProviderLabel(provider: RealNameVerificationProviderId): string {
  if (provider === 'mock_identity') {
    return '模拟实名校验模式';
  }
  if (provider === 'http_bridge') {
    return 'HTTP 外部实名桥接';
  }
  return '基础资料提交模式';
}

export function registerRealNameProviderRoutes(router: Router): void {
  router.post('/real-name/test-provider', async (req, res) => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ success: false, error: '需要管理员权限' });
      return;
    }

    const parsed = TestRealNameProviderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || '参数无效' });
      return;
    }

    const payload = parsed.data;
    if (
      process.env.NODE_ENV === 'production'
      && !getAllowedRealNameVerificationProviders().includes(payload.provider)
    ) {
      res.status(400).json({
        success: false,
        provider: payload.provider,
        providerLabel: resolveProviderLabel(payload.provider),
        error: '生产环境不允许测试模拟实名校验 provider',
      });
      return;
    }

    try {
      const startedAt = Date.now();
      const result = await verifyRealNameWithSelectedProvider(
        payload.provider,
        {
          realName: payload.realName,
          idNumber: payload.idNumber,
          phoneNumber: payload.phoneNumber,
        },
        payload.provider === 'http_bridge'
          ? {
            httpConfig: {
              httpUrl: payload.httpUrl ?? '',
              httpToken: resolveMaskedHttpToken(payload.httpToken),
              httpTimeoutMs: payload.httpTimeoutMs ?? 8000,
              httpHeaders: payload.httpHeaders ?? '',
            },
          }
          : undefined,
      );

      res.json({
        success: true,
        provider: payload.provider,
        providerLabel: resolveProviderLabel(payload.provider),
        passed: result.passed,
        detail: result.detail,
        elapsed: Date.now() - startedAt,
      });
    } catch (error) {
      res.status(200).json({
        success: false,
        provider: payload.provider,
        providerLabel: resolveProviderLabel(payload.provider),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
