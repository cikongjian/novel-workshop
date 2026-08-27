/**
 * 运行时部署路径检测
 *
 * DMP 全栈部署通过子路径访问：
 *   - 内部路径: /fullstack/{id}/
 *   - 公开发布: /apps/{slug}/
 * 本地开发时无子路径，返回空字符串。
 */

/** 返回当前部署基路径，如 "/fullstack/abc123"、"/apps/my-app"，本地开发返回 "" */
export function getDeployBase(): string {
  const match = window.location.pathname.match(/^(\/(?:fullstack|apps)\/[^/]+)/);
  return match ? match[1] : '';
}

/** 返回 API 基路径，如 "/fullstack/abc123/api"，本地开发返回 "/api" */
export function getApiBase(): string {
  const base = getDeployBase();
  return base ? `${base}/api` : '/api';
}

/** 返回 WebSocket 基路径，如 "/fullstack/abc123/api/ws"，本地开发返回 "/api/ws" */
export function getWsBase(): string {
  const base = getDeployBase();
  return base ? `${base}/api/ws` : '/api/ws';
}

/** 当前访问路径是否为移动端路由。DMP 子路径部署时会先剥离部署基路径。 */
export function isMobileRoutePath(pathname = window.location.pathname): boolean {
  const base = getDeployBase();
  const routePath = base && pathname.startsWith(base)
    ? pathname.slice(base.length) || '/'
    : pathname;
  return routePath === '/m' || routePath.startsWith('/m/');
}

/**
 * 解析封面图片 src
 * 后端可能返回 "/novels/cover/{id}"（无 /api 前缀）或 "/api/novels/cover/{id}"，统一补全 deploy base
 */
export function resolveCoverSrc(coverOrUrl: string | undefined | null): string {
  if (!coverOrUrl) return '';
  if (coverOrUrl.startsWith('http://') || coverOrUrl.startsWith('https://') || coverOrUrl.startsWith('data:')) {
    return coverOrUrl;
  }
  const base = getDeployBase();
  if (coverOrUrl.startsWith('/api/')) {
    return `${base}${coverOrUrl}`;
  }
  return `${base}/api${coverOrUrl}`;
}
