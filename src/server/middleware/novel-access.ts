import type { Request } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import { createLogger } from '../../utils/logger.js';
import { canAccessNovel } from './novel-ownership.js';

const log = createLogger('novel-access');

/**
 * 验证用户是否有权限访问指定小说
 * @returns true 如果有权限，否则返回错误消息
 */
export async function checkNovelAccess(
  req: Request,
  novelManager: NovelManager,
  novelId: string,
): Promise<{ allowed: true } | { allowed: false; error: string; status: number }> {
  try {
    const novel = await novelManager.getNovel(novelId);
    if (!novel) {
      return { allowed: false, error: '小说不存在', status: 404 };
    }

    if (canAccessNovel(req.auth, novel)) {
      return { allowed: true };
    }

    return { allowed: false, error: '无权访问此小说', status: 403 };
  } catch (err) {
    // 判定失败必须留痕：否则越权排查时只看到 500，不知道是数据问题还是逻辑问题
    log.error('小说访问权校验失败', {
      novelId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: false, error: '验证权限失败', status: 500 };
  }
}
