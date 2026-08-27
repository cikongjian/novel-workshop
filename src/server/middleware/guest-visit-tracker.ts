import type { NextFunction, Request, Response } from 'express';
import type { GuestVisitManager } from '../../guest-visits/guest-visit-manager.js';

const PUBLIC_GUEST_TRACK_PATTERNS = [
  /^\/homepage\/public$/,
  /^\/homepage\/public\/novels\/[^/]+\/chapters\/\d+$/,
  /^\/bookstore\/list$/,
  /^\/bookstore\/[^/]+$/,
  /^\/bookstore\/[^/]+\/comments$/,
  /^\/bookstore\/[^/]+\/like-status$/,
  /^\/bookstore\/[^/]+\/favorite-status$/,
  /^\/bookstore\/[^/]+\/reader\/chapters$/,
  /^\/bookstore\/[^/]+\/reader\/chapters\/\d+$/,
];

function isTrackableGuestPath(method: string, pathname: string): boolean {
  if (method !== 'GET') {
    return false;
  }
  return PUBLIC_GUEST_TRACK_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * 安全地获取请求 IP。
 * 使用 req.ip（受 Express trust proxy 控制），不自行解析 X-Forwarded-For。
 */
function getRequestIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createGuestVisitTrackingMiddleware(guestVisitManager?: GuestVisitManager) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!guestVisitManager || req.auth || !isTrackableGuestPath(req.method, req.path)) {
      next();
      return;
    }

    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    const referrer = typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
    void guestVisitManager.recordVisit({
      ip: getRequestIp(req),
      userAgent,
      path: req.path,
      referrer,
    });
    next();
  };
}
