import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createTobApp } from './app.js';
import { TobRepository } from './storage/tob-repository.js';
import type { Logger } from '../utils/logger.js';

const API_TOKEN = 'tob-test-token-value';

/** 鉴权失败关闭码（RFC 6455 政策违规） */
const WS_CLOSE_POLICY_VIOLATION = 1008;
/** 哨兵值：连接在观察窗口内未被服务端关闭 */
const WS_STAYED_OPEN = -1;
/** 观察连接是否被立即关闭的等待窗口 */
const WS_OBSERVE_WINDOW_MS = 400;

/**
 * 连接后观察一小段时间：被拒绝则返回关闭码，未被关闭则返回哨兵值
 */
function connectWs(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      resolve(WS_STAYED_OPEN);
    }, WS_OBSERVE_WINDOW_MS);

    socket.on('close', (code: number) => {
      clearTimeout(timer);
      resolve(code);
    });
    socket.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function createStubLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

/** 构造一份除被测项外全部合法的依赖 */
async function buildDeps(apiToken: string, baseDir: string) {
  const logger = createStubLogger();
  const repository = new TobRepository(baseDir, logger);
  await repository.init();
  return {
    logger,
    apiToken,
    rateLimitMax: 1000,
    allowMockGeneration: true,
    hasModelClient: false,
    workspacePipelineLinked: false,
    repository,
    pipelines: [],
    dataDir: baseDir,
    listSourceNovels: async () => [],
    getSourceNovelChapterStats: async (novelId: string) => ({
      novelId,
      chapterCount: 0,
      minChapterNumber: null,
      maxChapterNumber: null,
    }),
  };
}

/** 启动到临时端口，返回基地址与关闭函数 */
async function listen(app: ReturnType<typeof createTobApp>) {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => app.server.close(() => resolve())),
  };
}

describe('createTobApp 鉴权', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCors = process.env.TOB_CORS_ORIGINS;
  let baseDir = '';

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'tob-app-test-'));
    process.env.NODE_ENV = 'test';
    delete process.env.TOB_CORS_ORIGINS;
  });

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCors === undefined) delete process.env.TOB_CORS_ORIGINS;
    else process.env.TOB_CORS_ORIGINS = originalCors;
    await rm(baseDir, { recursive: true, force: true });
  });

  it('生产环境缺少 TOB_API_TOKEN 时拒绝启动', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TOB_CORS_ORIGINS = 'https://example.com';
    const deps = await buildDeps('', baseDir);
    expect(() => createTobApp(deps)).toThrow(/TOB_API_TOKEN/u);
  });

  it('生产环境缺少 TOB_CORS_ORIGINS 时拒绝启动', async () => {
    process.env.NODE_ENV = 'production';
    const deps = await buildDeps(API_TOKEN, baseDir);
    expect(() => createTobApp(deps)).toThrow(/TOB_CORS_ORIGINS/u);
  });

  it('开发态未配置 token 时显式告警而非静默放行', async () => {
    const deps = await buildDeps('', baseDir);
    createTobApp(deps);
    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('TOB_API_TOKEN'));
  });

  it('缺少 Authorization 头时返回 401', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const response = await fetch(`${baseUrl}/api/tob/projects`);
      expect(response.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('token 错误时返回 401', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const response = await fetch(`${baseUrl}/api/tob/projects`, {
        headers: { authorization: 'Bearer wrong-token-same-length!' },
      });
      expect(response.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('token 正确时放行', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const response = await fetch(`${baseUrl}/api/tob/projects`, {
        headers: { authorization: `Bearer ${API_TOKEN}` },
      });
      expect(response.status).not.toBe(401);
    } finally {
      await close();
    }
  });

  it('/health 无需鉴权', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const response = await fetch(`${baseUrl}/api/tob/health`);
      expect(response.status).not.toBe(401);
    } finally {
      await close();
    }
  });

  it('未配置白名单时不反射任意来源', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const response = await fetch(`${baseUrl}/api/tob/health`, {
        headers: { origin: 'https://attacker.example' },
      });
      // 非生产且未配白名单时用 *，不得回显攻击者来源
      expect(response.headers.get('access-control-allow-origin')).not.toBe('https://attacker.example');
    } finally {
      await close();
    }
  });

  it('配置白名单后只回显白名单内来源', async () => {
    process.env.TOB_CORS_ORIGINS = 'https://allowed.example';
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const allowed = await fetch(`${baseUrl}/api/tob/health`, {
        headers: { origin: 'https://allowed.example' },
      });
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example');

      const denied = await fetch(`${baseUrl}/api/tob/health`, {
        headers: { origin: 'https://attacker.example' },
      });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await close();
    }
  });

  it('WebSocket 缺少 token 时被拒绝', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const code = await connectWs(`${baseUrl.replace('http', 'ws')}/ws`);
      expect(code).toBe(WS_CLOSE_POLICY_VIOLATION);
    } finally {
      await close();
    }
  });

  it('WebSocket token 错误时被拒绝', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const code = await connectWs(`${baseUrl.replace('http', 'ws')}/ws?token=wrong-token-same-length!`);
      expect(code).toBe(WS_CLOSE_POLICY_VIOLATION);
    } finally {
      await close();
    }
  });

  it('WebSocket token 正确时保持连接', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const code = await connectWs(`${baseUrl.replace('http', 'ws')}/ws?token=${API_TOKEN}`);
      expect(code).toBe(WS_STAYED_OPEN);
    } finally {
      await close();
    }
  });

  it('下发 helmet 安全响应头', async () => {
    const deps = await buildDeps(API_TOKEN, baseDir);
    const { baseUrl, close } = await listen(createTobApp(deps));
    try {
      const response = await fetch(`${baseUrl}/api/tob/health`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    } finally {
      await close();
    }
  });
});
