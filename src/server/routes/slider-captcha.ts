/**
 * 滑块验证码路由
 *
 * 生成随机目标位置，前端渲染滑块，用户拖动到目标位置。
 * 验证：位置精度 ≤ 容差 + 拖拽时长 ≥ 最低时间。
 * 强化：每IP挑战频率限制 + 同一挑战失败次数限制。
 */

import { Router } from 'express';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';

/** 滑块轨道宽度（px） */
const SLIDER_TRACK_WIDTH = 280;
/** 滑块手柄尺寸（px）——前端对齐用 */
const SLIDER_HANDLE_SIZE = 40;
/** 完成验证所需的最小拖拽比例（0~1），0.9 = 拖到轨道 90% 处 */
const SLIDER_MIN_COMPLETE_RATIO = 0.9;
/** 最小拖拽时长（ms），过快视为机器人 */
const SLIDER_MIN_DRAG_DURATION_MS = 500;
/** 最大拖拽时长（ms），过慢视为自动化脚本 */
const SLIDER_MAX_DRAG_DURATION_MS = 30000;
/** 挑战过期时间（秒） */
const SLIDER_CHALLENGE_EXPIRE_SECONDS = 120;
/** 每个IP每分钟最多获取挑战数 */
const SLIDER_CHALLENGE_PER_IP_PER_MINUTE = 5;
/** 同一挑战最多允许的验证失败次数 */
const SLIDER_MAX_VERIFY_FAILURES = 3;

export interface SliderCaptchaRouteDeps {
  redis?: Redis;
}

interface StoredChallenge {
  trackWidth: number;
  expireAt: number;
  failureCount: number;
}

export function createSliderCaptchaRouter(deps: SliderCaptchaRouteDeps): Router {
  const router = Router();
  const { redis } = deps;

  // 内存存储（Redis 不可用时的降级方案）
  const memoryStore = new Map<string, StoredChallenge>();
  // 每IP挑战频率计数器（内存版）
  const ipChallengeCounters = new Map<string, { count: number; resetAt: number }>();

  // 定期清理过期挑战
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (value.expireAt < now) {
        memoryStore.delete(key);
      }
    }
    for (const [key, value] of ipChallengeCounters.entries()) {
      if (now >= value.resetAt) {
        ipChallengeCounters.delete(key);
      }
    }
  }, 60000);
  cleanup.unref();

  function getClientIp(req: any): string {
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  /** 检查 IP 风格挑战频率 */
  async function checkIpChallengeRate(clientIp: string): Promise<boolean> {
    if (redis) {
      try {
        const key = `slider_captcha_ip:${clientIp}`;
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, 60);
        }
        return count <= SLIDER_CHALLENGE_PER_IP_PER_MINUTE;
      } catch {
        // Redis 故障降级到内存
      }
    }
    const now = Date.now();
    let entry = ipChallengeCounters.get(clientIp);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + 60000 };
      ipChallengeCounters.set(clientIp, entry);
    }
    entry.count++;
    return entry.count <= SLIDER_CHALLENGE_PER_IP_PER_MINUTE;
  }

  /** 生成滑块验证挑战 */
  router.get('/generate', async (req, res) => {
    try {
      const clientIp = getClientIp(req);

      // 每IP挑战频率检查
      if (!(await checkIpChallengeRate(clientIp))) {
        res.status(429).json({
          error: '验证码获取过于频繁，请稍后再试',
          retryAfter: 60,
        });
        return;
      }

      const challengeId = `slider_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

      if (redis) {
        await redis.setex(
          challengeId,
          SLIDER_CHALLENGE_EXPIRE_SECONDS,
          JSON.stringify({ trackWidth: SLIDER_TRACK_WIDTH, failureCount: 0 }),
        );
      } else {
        memoryStore.set(challengeId, {
          trackWidth: SLIDER_TRACK_WIDTH,
          expireAt: Date.now() + SLIDER_CHALLENGE_EXPIRE_SECONDS * 1000,
          failureCount: 0,
        });
      }

      res.json({
        challengeId,
        trackWidth: SLIDER_TRACK_WIDTH,
        expiresIn: SLIDER_CHALLENGE_EXPIRE_SECONDS,
      });
    } catch (err) {
      console.error('[slider-captcha] 生成挑战失败:', err);
      res.status(500).json({ error: '生成滑块验证失败' });
    }
  });

  /** 验证滑块（内部使用，不对外暴露路由） */
  async function verifySliderCaptcha(
    challengeId: string,
    position: number,
    durationMs: number,
  ): Promise<boolean> {
    if (!challengeId) return false;

    // 检查拖拽时长范围
    if (durationMs < SLIDER_MIN_DRAG_DURATION_MS) {
      return false;
    }
    if (durationMs > SLIDER_MAX_DRAG_DURATION_MS) {
      return false;
    }

    try {
      let trackWidth: number | null = null;

      if (redis) {
        const stored = await redis.get(challengeId);
        if (!stored) return false;
        const parsed = JSON.parse(stored) as { trackWidth: number; failureCount?: number };
        trackWidth = parsed.trackWidth;
        const failures = (parsed.failureCount ?? 0) + 1;

        // 检查位置是否达标
        const maxDrag = trackWidth - SLIDER_HANDLE_SIZE;
        const passed = position >= maxDrag * SLIDER_MIN_COMPLETE_RATIO;

        if (passed) {
          await redis.del(challengeId);
          return true;
        }

        // 失败次数超限，删除挑战
        if (failures >= SLIDER_MAX_VERIFY_FAILURES) {
          await redis.del(challengeId);
          return false;
        }

        // 更新失败计数
        await redis.setex(
          challengeId,
          SLIDER_CHALLENGE_EXPIRE_SECONDS,
          JSON.stringify({ trackWidth, failureCount: failures }),
        );
        return false;
      } else {
        const stored = memoryStore.get(challengeId);
        if (!stored) return false;
        if (stored.expireAt < Date.now()) {
          memoryStore.delete(challengeId);
          return false;
        }
        trackWidth = stored.trackWidth;

        const maxDrag = trackWidth - SLIDER_HANDLE_SIZE;
        const passed = position >= maxDrag * SLIDER_MIN_COMPLETE_RATIO;

        if (passed) {
          memoryStore.delete(challengeId);
          return true;
        }

        stored.failureCount++;
        if (stored.failureCount >= SLIDER_MAX_VERIFY_FAILURES) {
          memoryStore.delete(challengeId);
          return false;
        }
        return false;
      }
    } catch (err) {
      console.error('[slider-captcha] 验证失败:', err);
      return false;
    }
  }

  // 导出验证函数供 auth 路由使用
  (router as any).verifySliderCaptcha = verifySliderCaptcha;

  return router;
}
