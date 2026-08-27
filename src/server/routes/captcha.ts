import { Router } from 'express';
import svgCaptcha from 'svg-captcha';
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

const CAPTCHA_EXPIRE_SECONDS = 300; // 5分钟过期
const CAPTCHA_SIZE = 4;
const CAPTCHA_NOISE = 2;
const CAPTCHA_WIDTH = 200;
const CAPTCHA_HEIGHT = 50;
const CAPTCHA_FONT_SIZE = 38;
// 排除易混淆字符: 0/O/1/I，只用大写+数字提升可读性
const CAPTCHA_CHAR_PRESET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface CaptchaRouteDeps {
  redis?: Redis;
}

export function createCaptchaRouter(deps: CaptchaRouteDeps): Router {
  const router = Router();
  const { redis } = deps;

  // 内存存储（Redis 不可用时的降级方案）
  const memoryStore = new Map<string, { text: string; expireAt: number }>();

  // 定期清理过期的内存验证码
  const captchaCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (value.expireAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 60000); // 每分钟清理一次
  // unref：清理定时器不应阻止进程退出（多实例 / 停机时尤为重要）
  captchaCleanupTimer.unref();

  /** 生成验证码 */
  router.get('/generate', async (_req, res) => {
    try {
      // 生成验证码
      const captcha = svgCaptcha.create({
        size: CAPTCHA_SIZE,
        noise: CAPTCHA_NOISE,
        color: true,
        background: '#0f172a',
        width: CAPTCHA_WIDTH,
        height: CAPTCHA_HEIGHT,
        fontSize: CAPTCHA_FONT_SIZE,
        charPreset: CAPTCHA_CHAR_PRESET,
      });

      // 生成唯一 ID（使用 crypto 而非 Math.random 防止可预测性）
      const captchaId = `captcha_${Date.now()}_${randomBytes(8).toString('hex')}`;

      // 存储验证码（优先使用 Redis）
      if (redis) {
        await redis.setex(captchaId, CAPTCHA_EXPIRE_SECONDS, captcha.text.toLowerCase());
      } else {
        memoryStore.set(captchaId, {
          text: captcha.text.toLowerCase(),
          expireAt: Date.now() + CAPTCHA_EXPIRE_SECONDS * 1000,
        });
      }

      res.json({
        captchaId,
        captchaSvg: captcha.data,
        expiresIn: CAPTCHA_EXPIRE_SECONDS,
      });
    } catch (err) {
      console.error('[captcha] 生成验证码失败:', err);
      res.status(500).json({ error: '生成验证码失败' });
    }
  });

  /** 验证验证码（内部使用，不对外暴露） */
  async function verifyCaptcha(captchaId: string, captchaText: string): Promise<boolean> {
    if (!captchaId || !captchaText) {
      return false;
    }

    const inputText = captchaText.toLowerCase().trim();

    try {
      // 从 Redis 获取
      if (redis) {
        const storedText = await redis.get(captchaId);
        if (storedText && storedText === inputText) {
          // 验证成功后立即删除，防止重复使用
          await redis.del(captchaId);
          return true;
        }
        return false;
      }

      // 从内存获取
      const stored = memoryStore.get(captchaId);
      if (!stored) {
        return false;
      }

      // 检查是否过期
      if (stored.expireAt < Date.now()) {
        memoryStore.delete(captchaId);
        return false;
      }

      // 验证
      if (stored.text === inputText) {
        memoryStore.delete(captchaId);
        return true;
      }

      return false;
    } catch (err) {
      console.error('[captcha] 验证失败:', err);
      return false;
    }
  }

  // 导出验证函数供其他路由使用
  (router as any).verifyCaptcha = verifyCaptcha;

  return router;
}
