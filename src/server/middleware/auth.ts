import type { Request, Response, NextFunction } from 'express';
import type { AuthConfig } from '../../auth/types.js';
import { DEV_USER, AUTH_PUBLIC_PATHS } from '../../auth/types.js';
import { verifyAccessToken } from '../../auth/jwt-service.js';
import { UnauthorizedError, ForbiddenError } from '../errors.js';

/**
 * 认证中间件工厂
 *
 * AUTH_ENABLED=false（默认）：注入虚拟 dev 用户，所有请求直接放行
 * AUTH_ENABLED=true：从 Authorization header 解析 JWT
 */
export function createAuthMiddleware(config: AuthConfig) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 开发模式：注入虚拟用户，直接放行
    if (!config.enabled) {
      req.auth = DEV_USER;
      next();
      return;
    }

    // 免认证路径（静态白名单 + 书城公开读取接口）
    if (isPublicPath(req.method, req.path) || isPublicBookstorePath(req.method, req.path)) {
      next();
      return;
    }

    // 解析 Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next(new UnauthorizedError('缺少认证令牌'));
      return;
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token, config.jwtSecret);
      req.auth = {
        id: payload.userId,
        username: payload.username,
        role: payload.role,
      };
      next();
    } catch {
      next(new UnauthorizedError('认证令牌无效或已过期'));
    }
  };
}

/**
 * 要求管理员角色
 */
export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth || req.auth.role !== 'admin') {
      next(new ForbiddenError('需要管理员权限'));
      return;
    }
    next();
  };
}

function isPublicPath(method: string, pathname: string): boolean {
  if (method === 'GET' && (pathname === '/novels/cover' || pathname.startsWith('/novels/cover/'))) {
    return true;
  }

  if (method === 'GET' && pathname === '/downloads') {
    return true;
  }

  if (method === 'GET' && /^\/downloads\/file\/[^/]+$/.test(pathname)) {
    return true;
  }

  if (pathname.startsWith('/downloads/')) {
    return false;
  }

  // 海报分享页面（HTML）免认证：供 iframe 预览和微信外部打开
  if (method === 'GET' && /^\/posters\/page\/[\w-]+$/.test(pathname)) {
    return true;
  }

  // 海报访问追踪接口免认证：外部用户（无 token）调用
  if (method === 'POST' && /^\/posters\/page\/[\w-]+\/track(-read)?$/.test(pathname)) {
    return true;
  }

  // 角色立绘图片免认证：供阅读页/信箱/分享场景的 <img> 直接加载
  if (method === 'GET' && /^\/novels\/[^/]+\/characters\/[^/]+\/portrait$/.test(pathname)) {
    return true;
  }

  // 角色列表免认证：书城作品详情页的 Cast 区域需公开展示
  if (method === 'GET' && /^\/novels\/[^/]+\/characters$/.test(pathname)) {
    return true;
  }

  // 角色成长事件数据免认证：角色详情弹窗的成长时间线需公开展示
  if (method === 'GET' && /^\/novels\/[^/]+\/character-events$/.test(pathname)) {
    return true;
  }

  // 章节漫画单格图片免认证：供阅读页 <img> 直接加载（与立绘一致）
  if (method === 'GET' && /^\/novels\/[^/]+\/comics\/\d+\/panels\/[\w.-]+$/.test(pathname)) {
    return true;
  }

  return AUTH_PUBLIC_PATHS.some((publicPath) => pathname === publicPath || pathname.startsWith(`${publicPath}/`));
}

/** 书城 GET 读取接口免认证：列表、单书详情、章节列表、阅读器正文、公开漫画、互动状态 */
const BOOKSTORE_PUBLIC_GET = /^\/bookstore\/(list|[^/]+(\/chapters|\/reader\/chapters(\/\d+)?|\/reader\/chapter-page|\/reader\/comics\/\d+(\/panels\/[\w.-]+)?|\/like-status|\/favorite-status|\/comments|\/comments-page)?$)/;

function isPublicBookstorePath(method: string, pathname: string): boolean {
  return method === 'GET' && BOOKSTORE_PUBLIC_GET.test(pathname);
}
