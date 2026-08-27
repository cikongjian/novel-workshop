import type { NovelDataAuditReport } from '../novel/novel-data-audit.js';
import type {
  NovelOrganizationResult,
  NovelOrganizationScope,
} from '../novel/novel-data-organizer.js';
import type { NovelDataRollbackResult } from '../novel/novel-data-rollback.js';
import type {
  ChapterGenerationIntegrityReport,
  ChapterGenerationRepairResult,
} from '../novel/chapter-generation-integrity.js';
import type { MemoryCoverage } from '../memory/novel-memory.js';
import type { ReindexMemorySummary } from './reindex-memory.js';
import type { CoverPromptDiagnostics } from '../server/routes/handlers/novel-cover/prompt-diagnostics.js';

export type RemoteNovelSummary = {
  id: string;
  title: string;
  ownerId: string;
  status: string;
  genre: string;
  chapterCount: number;
  finalizedChapterCount: number;
  wordCount: number;
  updatedAt: string;
};

export type RemoteNovelList = {
  novels: RemoteNovelSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type RemoteNovelBackup = {
  id: string;
  size: number;
  createdAt: string;
};

export type RemoteNovelDataCapabilities = {
  protocol: {
    name: string;
    version: number;
  };
  serverTime: string;
  features: {
    audit: boolean;
    organizationPreview: boolean;
    organizationApply: boolean;
    planTokens: boolean;
    backups: boolean;
    rollback: boolean;
    chapterIntegrity: boolean;
    chapterRepair: boolean;
    memoryCoverage?: boolean;
    memoryReindex?: boolean;
    coverPromptDiagnostics?: boolean;
  };
  limits: {
    listPageSize: number;
    organizationScopes: number;
  };
};

export type RemoteMemoryReindexResponse = {
  success: boolean;
  message: string;
  summary: ReindexMemorySummary;
};

export type RemoteMemoryRebuildResult = {
  reindex: RemoteMemoryReindexResponse;
  coverage: MemoryCoverage;
};

export type RemoteCoverPromptDiagnosticResult = {
  elapsedMs: number;
  promptSource: 'ai' | 'template' | 'manual';
  positivePromptLength: number;
  negativePromptLength: number;
  recommendedSize?: string;
  diagnostics?: CoverPromptDiagnostics;
};

export type RemoteNovelDataDoctorResult = {
  apiBase: string;
  compatible: boolean;
  health: {
    status: string;
    authEnabled: boolean;
  };
  capabilities: RemoteNovelDataCapabilities;
  latencyMs: {
    health: number;
    authenticatedHandshake: number;
  };
};

export type RemoteNovelDataClient = {
  doctor(): Promise<RemoteNovelDataDoctorResult>;
  list(params: {
    search?: string;
    ownerId?: string;
    limit: number;
    offset: number;
  }): Promise<RemoteNovelList>;
  audit(novelId: string): Promise<NovelDataAuditReport>;
  chapterIntegrity(novelId: string): Promise<ChapterGenerationIntegrityReport>;
  repairChapterIntegrity(params: {
    novelId: string;
    apply: boolean;
    expectedPlanToken?: string;
  }): Promise<ChapterGenerationRepairResult>;
  memoryCoverage(novelId: string): Promise<MemoryCoverage>;
  rebuildMemory(params: { novelId: string; apply: boolean }): Promise<RemoteMemoryRebuildResult>;
  diagnoseCoverPrompt(novelId: string): Promise<RemoteCoverPromptDiagnosticResult>;
  organize(params: {
    novelId: string;
    scopes: NovelOrganizationScope[];
    apply: boolean;
    expectedPlanToken?: string;
  }): Promise<NovelOrganizationResult>;
  backups(novelId: string): Promise<{ novelId: string; backups: RemoteNovelBackup[] }>;
  rollback(params: { novelId: string; backupId: string }): Promise<NovelDataRollbackResult>;
};

export class RemoteNovelDataHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'RemoteNovelDataHttpError';
    this.status = status;
    this.code = code;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeRemoteApiBase(baseUrl: string, allowHttp = false): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('远程地址无效，请提供完整的 http(s) URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('远程地址只支持 HTTP 或 HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('远程地址不能包含用户名或密码，请使用管理员令牌认证');
  }
  if (parsed.protocol === 'http:' && !allowHttp && !isLoopback(parsed.hostname)) {
    throw new Error('拒绝通过明文 HTTP 连接远程环境；仅本机或显式 --allow-http 可用');
  }
  parsed.search = '';
  parsed.hash = '';
  const cleanPath = parsed.pathname.replace(/\/+$/u, '');
  parsed.pathname = cleanPath.endsWith('/api') ? cleanPath : `${cleanPath}/api`;
  return parsed.toString().replace(/\/$/u, '');
}

async function readJsonResponse<T>(response: Response, route: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as {
    error?: unknown;
    code?: unknown;
  } & T;
  if (!response.ok) {
    const serverMessage = typeof payload.error === 'string'
      ? payload.error
      : `远程请求失败 (${response.status})`;
    const message = response.status === 401
      ? `管理员认证失败：${serverMessage}`
      : response.status === 403
        ? `管理员权限校验失败：${serverMessage}`
        : response.status === 404 && route === '/admin/novel-debug/capabilities'
          ? '远程维护接口不存在，请确认服务端已部署当前版本且 --base-url 路径正确'
          : serverMessage;
    throw new RemoteNovelDataHttpError(
      message,
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
    );
  }
  return payload;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  return errorCode((error as { cause?: unknown }).cause);
}

function connectionErrorMessage(apiBase: string, error: unknown): string {
  const code = errorCode(error);
  const endpoint = new URL(apiBase);
  const target = `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `无法解析远程主机 ${endpoint.hostname} (${code})`;
  }
  if (code === 'ECONNREFUSED') return `远程平台拒绝连接：${target}`;
  if (code === 'ECONNRESET') return `远程连接被重置：${target}`;
  if (code && /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/u.test(code)) {
    return `远程 TLS 证书校验失败 (${code})；私有 CA 请通过 NODE_EXTRA_CA_CERTS 配置`;
  }
  return `无法连接远程平台：${target}${code ? ` (${code})` : ''}`;
}

function retryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createRemoteNovelDataClient(params: {
  baseUrl: string;
  token?: string;
  allowHttp?: boolean;
  timeoutMs?: number;
  retries?: number;
}): RemoteNovelDataClient {
  const apiBase = normalizeRemoteApiBase(params.baseUrl, params.allowHttp);
  const timeoutMs = Math.max(1_000, Math.min(1_800_000, params.timeoutMs ?? 20_000));
  const retries = Math.max(0, Math.min(3, params.retries ?? 1));

  const request = async <T>(
    method: 'GET' | 'POST',
    route: string,
    body?: unknown,
  ): Promise<T> => {
    const attempts = method === 'GET' ? retries + 1 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${apiBase}${route}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(params.token ? { Authorization: `Bearer ${params.token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        if (attempt + 1 < attempts && retryableStatus(response.status)) {
          await response.body?.cancel().catch(() => {});
          await delay(250 * (attempt + 1));
          continue;
        }
        return await readJsonResponse<T>(response, route);
      } catch (error) {
        if (error instanceof RemoteNovelDataHttpError) throw error;
        if (attempt + 1 < attempts) {
          await delay(250 * (attempt + 1));
          continue;
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`远程请求超过 ${timeoutMs}ms（已尝试 ${attempts} 次）`);
        }
        throw new Error(connectionErrorMessage(apiBase, error));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('远程请求未执行');
  };

  return {
    doctor: async () => {
      const healthStartedAt = Date.now();
      const health = await request<{ status: string; authEnabled: boolean }>('GET', '/health');
      const healthLatency = Date.now() - healthStartedAt;
      const handshakeStartedAt = Date.now();
      const capabilities = await request<RemoteNovelDataCapabilities>(
        'GET',
        '/admin/novel-debug/capabilities',
      );
      return {
        apiBase,
        compatible: capabilities.protocol.name === 'novel-data-maintenance'
          && capabilities.protocol.version === 2,
        health: {
          status: health.status,
          authEnabled: health.authEnabled,
        },
        capabilities,
        latencyMs: {
          health: healthLatency,
          authenticatedHandshake: Date.now() - handshakeStartedAt,
        },
      };
    },
    list: ({ search, ownerId, limit, offset }) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (search) query.set('search', search);
      if (ownerId) query.set('ownerId', ownerId);
      return request<RemoteNovelList>('GET', `/admin/novel-debug/novels?${query}`);
    },
    audit: novelId => request<NovelDataAuditReport>(
      'GET',
      `/admin/novel-debug/novels/${encodeURIComponent(novelId)}/audit`,
    ),
    chapterIntegrity: novelId => request<ChapterGenerationIntegrityReport>(
      'GET',
      `/admin/novel-debug/novels/${encodeURIComponent(novelId)}/chapter-integrity`,
    ),
    repairChapterIntegrity: ({ novelId, apply, expectedPlanToken }) => (
      request<ChapterGenerationRepairResult>(
        'POST',
        `/admin/novel-debug/novels/${encodeURIComponent(novelId)}/chapter-integrity/repair`,
        {
          apply,
          confirmNovelId: apply ? novelId : undefined,
          expectedPlanToken: apply ? expectedPlanToken : undefined,
        },
      )
    ),
    memoryCoverage: novelId => request<MemoryCoverage>(
      'GET',
      `/novels/${encodeURIComponent(novelId)}/memory/coverage`,
    ),
    rebuildMemory: async ({ novelId, apply }) => {
      const reindex = await request<RemoteMemoryReindexResponse>(
        'POST',
        `/novels/${encodeURIComponent(novelId)}/memory/reindex`,
        {
          clearBeforeRebuild: false,
          dryRun: !apply,
        },
      );
      const coverage = await request<MemoryCoverage>(
        'GET',
        `/novels/${encodeURIComponent(novelId)}/memory/coverage`,
      );
      return { reindex, coverage };
    },
    diagnoseCoverPrompt: async (novelId) => {
      const startedAt = Date.now();
      const result = await request<{
        promptSource: RemoteCoverPromptDiagnosticResult['promptSource'];
        positivePrompt?: string;
        negativePrompt?: string;
        recommendedSize?: string;
        diagnostics?: CoverPromptDiagnostics;
      }>(
        'POST',
        `/novels/${encodeURIComponent(novelId)}/cover-ai/prompt?diagnostics=1`,
        {},
      );
      return {
        elapsedMs: Date.now() - startedAt,
        promptSource: result.promptSource,
        positivePromptLength: result.positivePrompt?.length ?? 0,
        negativePromptLength: result.negativePrompt?.length ?? 0,
        recommendedSize: result.recommendedSize,
        diagnostics: result.diagnostics,
      };
    },
    organize: ({ novelId, scopes, apply, expectedPlanToken }) => request<NovelOrganizationResult>(
      'POST',
      `/admin/novel-debug/novels/${encodeURIComponent(novelId)}/organize`,
      {
        scopes,
        apply,
        confirmNovelId: apply ? novelId : undefined,
        expectedPlanToken: apply ? expectedPlanToken : undefined,
      },
    ),
    backups: novelId => request<{ novelId: string; backups: RemoteNovelBackup[] }>(
      'GET',
      `/admin/novel-debug/novels/${encodeURIComponent(novelId)}/backups`,
    ),
    rollback: ({ novelId, backupId }) => request<NovelDataRollbackResult>(
      'POST',
      `/admin/novel-debug/novels/${encodeURIComponent(novelId)}/rollback`,
      { backupId, confirmNovelId: novelId },
    ),
  };
}
