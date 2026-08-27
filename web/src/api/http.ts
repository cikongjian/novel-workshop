import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import {
  getTransientUserApiHeaderForDefaultProfile,
  getTransientUserApiHeaderForNovelId,
} from '../utils/user-api-local';
import { getApiBase, getDeployBase } from '../utils/deploy-path';
import {
  clearLegacyPersistedAuth,
  clearSessionAccessToken,
  getSessionAccessToken,
  setSessionAccessToken,
} from '../utils/auth-session';
const TOKEN_REFRESH_SKEW_SECONDS = 120;
const JWT_PARTS_COUNT = 3;

type RefreshTokenResponse = {
  accessToken: string;
};

const http = axios.create({
  baseURL: getApiBase(),
  timeout: 60000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// 公开路径（无需认证）- 必须完全匹配，不包含子路径
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/password-policy',
  '/auth/refresh',
  '/auth/logout',
  '/captcha',
  '/slider-captcha',
  '/health',
  '/homepage',
  '/novels/cover',
  '/billing/payments/callback',
  '/sync/session',
  '/applications/apply',
  '/settings/public/comic-config',
  '/bookstore/list',
];

const TOKEN_REFRESH_EXCLUDED_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/password-policy',
  '/auth/refresh',
  '/auth/logout',
]);

const LONG_RUNNING_BACKGROUND_ROUTES = new Set([
  '/generate/chapter',
  '/shuangwen/generate-chapter',
]);

function isRecoverableLongRunningHttpError(error: AxiosError<{ error?: string; code?: string }>): boolean {
  const status = error.response?.status;
  return status === 502
    || status === 504
    || status === 524
    || error.code === 'ECONNABORTED'
    || error.code === 'ERR_NETWORK';
}

function isPortraitGenerationRequest(error: AxiosError<{ error?: string; code?: string }>): boolean {
  const url = error.config?.url || '';
  const method = error.config?.method?.toLowerCase();
  return method === 'post'
    && url.includes('/characters/')
    && /\/portrait(?:\?|$)/.test(url)
    && !url.includes('/portrait-prompt')
    && !url.includes('/portrait-style-options');
}

function shouldSuppressGlobalHttpError(error: AxiosError<{ error?: string; code?: string }>): boolean {
  const url = error.config?.url || '';
  // TTS 合成请求失败由调用方自行处理（producer 内部跳过，试听有应用层 catch）
  if (url.includes('/tts/preview')) return true;
  if (!isRecoverableLongRunningHttpError(error)) return false;
  return LONG_RUNNING_BACKGROUND_ROUTES.has(url)
    || isPortraitGenerationRequest(error);
}

function extractNovelId(config: InternalAxiosRequestConfig): string | null {
  const url = config.url || '';
  const match = url.match(/\/novels\/([0-9a-f-]{36})(?:\/|$)/i);
  if (match?.[1]) return match[1];
  const anchorMatch = url.match(/\/anchors\/generate\/([0-9a-f-]{36})(?:\/|$)/i);
  if (anchorMatch?.[1]) return anchorMatch[1];

  const params = config.params as { novelId?: unknown } | undefined;
  if (typeof params?.novelId === 'string') return params.novelId;

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const formNovelId = config.data.get('novelId');
    return typeof formNovelId === 'string' ? formNovelId : null;
  }

  if (config.data && typeof config.data === 'object') {
    const data = config.data as { novelId?: unknown };
    if (typeof data.novelId === 'string') return data.novelId;
  }

  return null;
}

function normalizeApiPath(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    const pathname = parsed.pathname.startsWith('/api/')
      ? parsed.pathname.slice('/api'.length)
      : parsed.pathname;
    return pathname || '/';
  } catch {
    const [path] = url.split('?');
    return path || '';
  }
}

// 需认证路径前缀 — 即使匹配 PUBLIC_PATH_PREFIXES，也强制要求认证
const NON_PUBLIC_PATH_PREFIXES = [
  '/bookstore/my/',
  '/bookstore/admin/',
];

// 公开路径前缀（无需认证）- 用于动态路径匹配
const PUBLIC_PATH_PREFIXES = [
  '/bookstore/', // 书城相关（详情、阅读、评论等）
];

// 公开路径后缀匹配：以指定后缀结尾的路径视为公开
const PUBLIC_PATH_SUFFIXES = [
  '/characters', // 作品角色列表（书城详情页展示）
];

function isPublicApiPath(url: string): boolean {
  const path = normalizeApiPath(url);
  if (NON_PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  if (PUBLIC_PATHS.includes(path)) return true;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return PUBLIC_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix) && path.startsWith('/novels/'));
}

function shouldSkipTokenRefresh(url: string): boolean {
  return TOKEN_REFRESH_EXCLUDED_PATHS.has(normalizeApiPath(url));
}

function readJwtExpirySeconds(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== JWT_PARTS_COUNT) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function shouldRefreshAccessToken(token: string | null): boolean {
  if (!token) return false;
  const exp = readJwtExpirySeconds(token);
  if (!exp) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp - nowSeconds <= TOKEN_REFRESH_SKEW_SECONDS;
}

let refreshPromise: Promise<string> | null = null;
let pendingLegacyRefreshToken: string | null = null;

export function stageLegacyRefreshTokenMigration(refreshToken: string | null): void {
  pendingLegacyRefreshToken = refreshToken;
}

export function discardLegacyRefreshTokenMigration(): void {
  pendingLegacyRefreshToken = null;
}

function redirectToLogin(): void {
  const current = window.location.pathname;
  const loginPath = `${getDeployBase()}/login`;

  // 如果已经是登录页，不重定向
  if (current === loginPath || current === `${loginPath}/`) return;

  // 检查当前页面是否是公开页面（书城、首页等）
  const isPublicPage = PUBLIC_PATH_PREFIXES.some((prefix) => current.includes(prefix))
    || current === '/' || current === '/m' || current.startsWith('/m/bookstore');

  // 只有在需要认证的页面上才重定向到登录页
  if (!isPublicPage) {
    clearSessionAccessToken();
    clearLegacyPersistedAuth();
    const redirectUrl = `${current}${window.location.search}${window.location.hash}`;
    window.location.href = `${loginPath}?redirect=${encodeURIComponent(redirectUrl)}`;
  } else {
    clearSessionAccessToken();
    clearLegacyPersistedAuth();
  }
}

export async function refreshSessionAccessToken(legacyRefreshToken?: string | null): Promise<string> {
  if (legacyRefreshToken) {
    stageLegacyRefreshTokenMigration(legacyRefreshToken);
  }
  if (!refreshPromise) {
    const tokenForMigration = pendingLegacyRefreshToken;
    pendingLegacyRefreshToken = null;
    refreshPromise = axios.post<RefreshTokenResponse>(
      `${getApiBase()}/auth/refresh`,
      tokenForMigration ? { refreshToken: tokenForMigration } : {},
      { withCredentials: true },
    )
      .then((res) => {
        setSessionAccessToken(res.data.accessToken);
        return res.data.accessToken;
      })
      .catch((err) => {
        redirectToLogin();
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function ensureFreshAccessToken(): Promise<string | null> {
  const token = getSessionAccessToken();
  if (!shouldRefreshAccessToken(token)) return token;
  return refreshSessionAccessToken();
}

function shouldAttachUserApiHeader(url: string): boolean {
  const isPortraitGenerationRoute = url.includes('/portrait-prompt')
    || (url.includes('/characters/') && url.includes('/portrait') && !url.includes('/portrait-style-options'));

  return url.startsWith('/generate/')
    || url.startsWith('/fun/')
    || url.includes('/constitution/generate')
    || url.startsWith('/shuangwen/')
    || url.startsWith('/short-story/')
    || url.startsWith('/assistant/')
    || url.includes('/agent-skills/generate')
    || url.includes('/outline/generate')
    || url.includes('/outline/extend')
    || url.includes('/outline/analyze')
    || url.includes('/plot-branches/generate-preview')
    || url.includes('/anchors/generate/')
    || url.includes('/cover-ai/')
    || (url.includes('/characters/') && url.includes('/polish-intro'))
    || url.startsWith('/character-chat/')
    || url.startsWith('/character-moments/')
    || url.startsWith('/side-stories/')
    || url.includes('/characters/detect-duplicates')
    || url.includes('/characters/backfill-tts')
    || url.includes('/characters/backfill-position')
    || isPortraitGenerationRoute
    || url.includes('/cast-session/propose')
    || url.includes('/adaptations/generate')
    || url.includes('/clean-dialogue-bracket-preview')
    || url.includes('/apply-clean-dialogue-bracket');
}

// 请求拦截器：自动附加 JWT（公开路径除外）
http.interceptors.request.use(async (config) => {
  const url = config.url || '';
  const isPublic = isPublicApiPath(url);

  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
    delete (config.headers as Record<string, unknown>)['Content-Type'];
    delete (config.headers as Record<string, unknown>)['content-type'];
  }

  if (!isPublic) {
    const token = await ensureFreshAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  const novelId = extractNovelId(config);
  if (shouldAttachUserApiHeader(url)) {
    const transientHeader = novelId
      ? getTransientUserApiHeaderForNovelId(novelId)
      : getTransientUserApiHeaderForDefaultProfile();
    if (transientHeader) {
      config.headers['x-nw-user-api-model'] = transientHeader;
    } else if (config.headers && 'x-nw-user-api-model' in config.headers) {
      delete (config.headers as Record<string, unknown>)['x-nw-user-api-model'];
    }
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; code?: string }>) => {
    const status = error.response?.status;
    const msg = error.response?.data?.error;
    const originalConfig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401 自动刷新 token（排除 auth 接口自身）
    if (status === 401 && originalConfig && !originalConfig._retry && !shouldSkipTokenRefresh(originalConfig.url || '')) {
      originalConfig._retry = true;
      try {
        const accessToken = await refreshSessionAccessToken();
        originalConfig.headers.Authorization = `Bearer ${accessToken}`;
        return http(originalConfig);
      } catch {
        return Promise.reject(error);
      }
    }

    if (shouldSuppressGlobalHttpError(error)) {
      return Promise.reject(error);
    }

    if (status === 429) {
      ElMessage.warning(msg ?? '请求过于频繁，请稍后再试');
    } else if (status === 400) {
      ElMessage.warning(msg ?? '请求参数有误');
    } else if (status === 401) {
      // 已在上方处理
    } else if (status === 404) {
      // 404 通常由调用方处理，不全局提示
    } else if (status === 503) {
      ElMessage.info(msg ?? '服务暂不可用');
    } else if (status && status >= 500) {
      ElMessage.error(msg ?? '服务器内部错误');
    } else if (error.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请检查网络连接');
    } else if (!error.response) {
      ElMessage.error('网络连接失败');
    }

    return Promise.reject(error);
  },
);

/** AI 生成请求超时：30 分钟（修订管线需要较长时间） */
const AI_TIMEOUT = 1_800_000;

export { http, AI_TIMEOUT };
