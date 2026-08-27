import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminNovelDebugRouter } from '../server/routes/admin-novel-debug.js';
import {
  createRemoteNovelDataClient,
  RemoteNovelDataHttpError,
} from './remote-novel-data-client.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote novel data client connectivity', () => {
  it('completes the doctor handshake over a real loopback HTTP connection', async () => {
    const app = express();
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', authEnabled: true });
    });
    app.use('/api/admin/novel-debug', (req, _res, next) => {
      req.auth = { id: 'admin-1', username: 'admin', role: 'admin' };
      next();
    }, createAdminNovelDebugRouter({
      novelManager: {} as never,
      backupManager: {} as never,
    }));
    const server = http.createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server address unavailable');
      const client = createRemoteNovelDataClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        token: 'admin-token',
        retries: 0,
      });
      await expect(client.doctor()).resolves.toMatchObject({
        compatible: true,
        health: { status: 'ok', authEnabled: true },
        capabilities: {
          protocol: { name: 'novel-data-maintenance', version: 2 },
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });

  it('checks public health and authenticated maintenance capabilities', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', authEnabled: true }))
      .mockResolvedValueOnce(jsonResponse({
        protocol: { name: 'novel-data-maintenance', version: 2 },
        serverTime: '2026-07-12T00:00:00.000Z',
        features: {
          audit: true,
          organizationPreview: true,
          organizationApply: true,
          planTokens: true,
          backups: true,
          rollback: true,
        },
        limits: { listPageSize: 100, organizationScopes: 6 },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteNovelDataClient({
      baseUrl: 'https://example.com',
      token: 'admin-token',
      retries: 0,
    });

    const result = await client.doctor();

    expect(result.compatible).toBe(true);
    expect(result.apiBase).toBe('https://example.com/api');
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.com/api/health', expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/api/admin/novel-debug/capabilities',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      }),
    );
  });

  it('retries transient read failures but not organization writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'gateway unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ novels: [], total: 0, limit: 1, offset: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteNovelDataClient({
      baseUrl: 'https://example.com',
      token: 'admin-token',
      retries: 1,
    });

    await expect(client.list({ limit: 1, offset: 0 })).resolves.toMatchObject({ total: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset().mockResolvedValue(jsonResponse({ error: 'gateway unavailable' }, 503));
    await expect(client.organize({
      novelId: '11111111-1111-4111-8111-111111111111',
      scopes: ['characters'],
      apply: false,
    })).rejects.toBeInstanceOf(RemoteNovelDataHttpError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('summarizes cover prompt diagnostics without retaining prompt text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      promptSource: 'template',
      positivePrompt: 'positive prompt text',
      negativePrompt: 'negative',
      recommendedSize: '832x1216',
      diagnostics: {
        modelAccess: {
          source: 'platform-global',
          clientAvailable: true,
          provider: 'custom-openai',
          model: 'test-model',
        },
        aiAttempt: {
          outcome: 'template-fallback',
          elapsedMs: 97000,
          error: { category: 'timeout', name: 'Error', message: 'upstream timeout' },
        },
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteNovelDataClient({
      baseUrl: 'https://example.com',
      token: 'admin-token',
      retries: 0,
    });

    await expect(client.diagnoseCoverPrompt('novel-1')).resolves.toMatchObject({
      promptSource: 'template',
      positivePromptLength: 20,
      negativePromptLength: 8,
      diagnostics: { aiAttempt: { outcome: 'template-fallback' } },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/novels/novel-1/cover-ai/prompt?diagnostics=1',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('returns actionable authentication and DNS diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: '认证令牌无效或已过期' }, 401)));
    const authClient = createRemoteNovelDataClient({
      baseUrl: 'https://example.com',
      token: 'expired',
      retries: 0,
    });
    await expect(authClient.list({ limit: 1, offset: 0 }))
      .rejects.toThrow('管理员认证失败');

    const dnsError = new TypeError('fetch failed', { cause: Object.assign(new Error('lookup'), { code: 'ENOTFOUND' }) });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(dnsError));
    const dnsClient = createRemoteNovelDataClient({
      baseUrl: 'https://missing.example.com',
      token: 'token',
      retries: 0,
    });
    await expect(dnsClient.list({ limit: 1, offset: 0 }))
      .rejects.toThrow('无法解析远程主机 missing.example.com');
  });

  it('uses separate read-only check and confirmed repair endpoints for empty chapters', async () => {
    const planToken = 'a'.repeat(64);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        novel: { id: '11111111-1111-4111-8111-111111111111', title: '测试', ownerId: 'owner' },
        summary: {
          chapterCount: 1,
          emptyChapterCount: 1,
          repairablePlaceholderCount: 1,
          suspiciousEmptyChapterCount: 0,
          persistedFailureCount: 0,
        },
        issues: [],
        planToken,
        auditedAt: '2026-07-12T00:00:00.000Z',
      }))
      .mockResolvedValueOnce(jsonResponse({
        mode: 'apply',
        novelId: '11111111-1111-4111-8111-111111111111',
        planToken,
        deletedChapterNumbers: [1],
        preservedFailureRecords: [1],
        reportBefore: {},
      }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteNovelDataClient({
      baseUrl: 'https://example.com',
      token: 'admin-token',
      retries: 0,
    });
    const novelId = '11111111-1111-4111-8111-111111111111';

    await client.chapterIntegrity(novelId);
    await client.repairChapterIntegrity({
      novelId,
      apply: true,
      expectedPlanToken: planToken,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://example.com/api/admin/novel-debug/novels/${novelId}/chapter-integrity`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://example.com/api/admin/novel-debug/novels/${novelId}/chapter-integrity/repair`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          apply: true,
          confirmNovelId: novelId,
          expectedPlanToken: planToken,
        }),
      }),
    );
  });

  it('previews or incrementally rebuilds remote memory without clearing existing vectors', async () => {
    const novelId = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        message: '记忆索引重建完成',
        summary: { ok: true, totalNovels: 1, successNovels: 1, failedNovels: 0 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        novelId,
        complete: true,
        source: {},
        indexed: { chunkStats: { totalChunks: 12, categories: {} } },
        missing: {},
        stale: {},
        readiness: { sourceDomainsReady: true, warnings: [] },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteNovelDataClient({
      baseUrl: 'https://example.com',
      token: 'admin-token',
      retries: 0,
    });

    await expect(client.rebuildMemory({ novelId, apply: true })).resolves.toMatchObject({
      reindex: { success: true },
      coverage: { complete: true },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://example.com/api/novels/${novelId}/memory/reindex`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clearBeforeRebuild: false, dryRun: false }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://example.com/api/novels/${novelId}/memory/coverage`,
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
