import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getConfig } from '../config/index.js';
import { requireServiceUrl } from './service-url.js';

type ServiceState = {
  pid: number;
  startedAt: string;
  url: string;
  pythonCommand: string;
  scriptPath: string;
};

export type KokoroServiceStatus = {
  url: string;
  healthy: boolean;
  running: boolean;
  managed: boolean;
  pid: number | null;
  pythonCommand: string;
  scriptPath: string;
  autoStart: boolean;
  startedAt?: string;
};

export type KokoroServiceActionResult = {
  success: boolean;
  changed: boolean;
  message: string;
  status: KokoroServiceStatus;
};

const DEFAULT_URL = 'http://127.0.0.1:8767';
const DEFAULT_SCRIPT = path.resolve('kokoro-tts-server', 'server.py');
const DEFAULT_PYTHON = process.platform === 'win32' ? 'py' : 'python3';
const DEFAULT_PYTHON_ARGS = process.platform === 'win32' ? ['-3.12'] : [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const lowered = raw.trim().toLowerCase();
  return lowered === '1' || lowered === 'true' || lowered === 'yes' || lowered === 'on';
}

function normalizeUrl(rawUrl: string | undefined): string {
  const value = (rawUrl || DEFAULT_URL).trim();
  const prefixed = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const parsed = new URL(prefixed);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM') return true;
    return false;
  }
}

async function waitFor(
  checker: () => Promise<boolean> | boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checker()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

export class KokoroServiceManager {
  private actionQueue: Promise<void> = Promise.resolve();

  private getRuntimeDir(): string {
    return path.resolve(getConfig().dataDir, 'runtime');
  }

  private getStateFile(): string {
    return path.join(this.getRuntimeDir(), 'kokoro-service.json');
  }

  private getPythonCommand(): string {
    return (process.env.KOKORO_PYTHON || DEFAULT_PYTHON).trim() || DEFAULT_PYTHON;
  }

  private getPythonArgs(): string[] {
    // If user overrides KOKORO_PYTHON (e.g. a full path), no extra args needed
    if (process.env.KOKORO_PYTHON) return [];
    return DEFAULT_PYTHON_ARGS;
  }

  private getScriptPath(): string {
    const raw = process.env.KOKORO_SERVER_SCRIPT || DEFAULT_SCRIPT;
    return path.resolve(raw);
  }

  private getAutoStartFlag(): boolean {
    return toBool(process.env.KOKORO_AUTO_START, true);
  }

  private resolveUrl(urlOverride?: string): string {
    const rawUrl = normalizeUrl(urlOverride || process.env.KOKORO_URL || getConfig().tts.kokoroUrl || DEFAULT_URL);
    return requireServiceUrl(rawUrl, DEFAULT_URL);
  }

  private async readState(): Promise<ServiceState | null> {
    try {
      const content = await fs.readFile(this.getStateFile(), 'utf-8');
      const parsed = JSON.parse(content) as Partial<ServiceState>;
      if (!parsed.pid || !parsed.startedAt || !parsed.url || !parsed.pythonCommand || !parsed.scriptPath) {
        return null;
      }
      return {
        pid: parsed.pid,
        startedAt: parsed.startedAt,
        url: parsed.url,
        pythonCommand: parsed.pythonCommand,
        scriptPath: parsed.scriptPath,
      };
    } catch {
      return null;
    }
  }

  private async writeState(state: ServiceState): Promise<void> {
    await fs.mkdir(this.getRuntimeDir(), { recursive: true });
    await fs.writeFile(this.getStateFile(), JSON.stringify(state, null, 2), 'utf-8');
  }

  private async clearState(): Promise<void> {
    await fs.rm(this.getStateFile(), { force: true });
  }

  private async checkHealth(url: string): Promise<boolean> {
    try {
      const resp = await fetch(`${url}/health`, {
        redirect: 'error',
        signal: AbortSignal.timeout(2500),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  private async withLock<T>(runner: () => Promise<T>): Promise<T> {
    const prev = this.actionQueue;
    let release!: () => void;
    this.actionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await runner();
    } finally {
      release();
    }
  }

  async getStatus(urlOverride?: string): Promise<KokoroServiceStatus> {
    const state = await this.readState();
    const url = this.resolveUrl(urlOverride || state?.url);
    let running = state ? isProcessAlive(state.pid) : false;
    const healthy = await this.checkHealth(url);
    let managed = !!state;

    if (state && !running) {
      await this.clearState();
      managed = false;
    }

    if (!state && healthy) {
      running = true;
    }

    return {
      url,
      healthy,
      running,
      managed,
      pid: state?.pid ?? null,
      pythonCommand: this.getPythonCommand(),
      scriptPath: this.getScriptPath(),
      autoStart: this.getAutoStartFlag(),
      startedAt: state?.startedAt,
    };
  }

  private async startInternal(targetUrl: string): Promise<KokoroServiceActionResult> {
    const pythonCmd = this.getPythonCommand();
    const pythonArgs = this.getPythonArgs();
    const scriptPath = this.getScriptPath();
    const parsed = new URL(targetUrl);
    const port = parsed.port || '8767';
    const host = parsed.hostname;

    const child = spawn(pythonCmd, [...pythonArgs, scriptPath], {
      env: {
        ...process.env,
        KOKORO_PORT: port,
        KOKORO_HOST: host,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    child.unref();

    child.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) console.log(`[Kokoro:stdout] ${line}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) console.log(`[Kokoro:stderr] ${line}`);
    });

    const pid = child.pid!;
    const startedAt = new Date().toISOString();
    await this.writeState({ pid, startedAt, url: targetUrl, pythonCommand: pythonCmd, scriptPath });

    const ready = await waitFor(() => this.checkHealth(targetUrl), 30_000, 1000);

    const status = await this.getStatus(targetUrl);
    if (ready) {
      return { success: true, changed: true, message: 'Kokoro 服务已启动', status };
    }
    return { success: false, changed: true, message: 'Kokoro 进程已启动但健康检查未通过，模型可能仍在加载中', status };
  }

  private async stopInternal(targetUrl: string): Promise<KokoroServiceActionResult> {
    const state = await this.readState();
    if (!state) {
      const status = await this.getStatus(targetUrl);
      return { success: true, changed: false, message: '没有托管中的 Kokoro 进程', status };
    }

    if (isProcessAlive(state.pid)) {
      try {
        process.kill(state.pid, 'SIGTERM');
        await waitFor(() => !isProcessAlive(state.pid), 5_000, 300);
        if (isProcessAlive(state.pid)) {
          process.kill(state.pid, 'SIGKILL');
          await sleep(500);
        }
      } catch { /* 进程可能已退出 */ }
    }

    await this.clearState();
    const status = await this.getStatus(targetUrl);
    return { success: true, changed: true, message: 'Kokoro 服务已停止', status };
  }

  private async killProcessByPort(targetUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(targetUrl);
      const rawPort = parsed.port || '8767';
      if (!/^\d{1,5}$/.test(rawPort)) return false;
      const port = rawPort;
      const isWin = process.platform === 'win32';

      if (isWin) {
        const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8', timeout: 5000 });
        const match = out.trim().split('\n')[0]?.match(/\s(\d+)\s*$/);
        if (match) {
          execSync(`taskkill /F /PID ${match[1]}`, { timeout: 5000 });
          return true;
        }
      } else {
        execSync(`fuser -k ${port}/tcp`, { timeout: 5000 });
        return true;
      }
    } catch { /* 找不到进程或终止失败 */ }
    return false;
  }

  async start(urlOverride?: string): Promise<KokoroServiceActionResult> {
    return this.withLock(async () => {
      const targetUrl = this.resolveUrl(urlOverride);
      const pre = await this.getStatus(targetUrl);

      if (pre.healthy && pre.managed) {
        return { success: true, changed: false, message: 'Kokoro 服务已在运行中', status: pre };
      }

      if (pre.healthy && !pre.managed) {
        return { success: true, changed: false, message: '检测到已有外部 Kokoro 进程在运行', status: pre };
      }

      if (pre.managed) {
        await this.stopInternal(targetUrl);
      }

      return this.startInternal(targetUrl);
    });
  }

  async stop(urlOverride?: string): Promise<KokoroServiceActionResult> {
    return this.withLock(async () => {
      const targetUrl = this.resolveUrl(urlOverride);
      return this.stopInternal(targetUrl);
    });
  }

  async restart(urlOverride?: string): Promise<KokoroServiceActionResult> {
    return this.withLock(async () => {
      const targetUrl = this.resolveUrl(urlOverride);
      const pre = await this.getStatus(targetUrl);

      if (pre.healthy && !pre.managed) {
        const killed = await this.killProcessByPort(targetUrl);
        if (!killed) {
          return {
            success: false,
            changed: false,
            message: '检测到已有外部 Kokoro 进程，自动终止失败。请先手动停止后再启动。',
            status: pre,
          };
        }
        await waitFor(async () => !(await this.checkHealth(targetUrl)), 5_000, 500);
      } else if (pre.managed) {
        await this.stopInternal(targetUrl);
      }

      return this.startInternal(targetUrl);
    });
  }

  async autoStartIfNeeded(narrationEngine: string, kokoroUrl: string): Promise<void> {
    if (narrationEngine !== 'kokoro') return;
    if (!this.getAutoStartFlag()) return;

    const status = await this.getStatus(kokoroUrl);
    if (status.healthy) {
      console.log('[Kokoro] 服务已在线，跳过自动启动');
      return;
    }

    try {
      const result = await this.start(kokoroUrl);
      if (result.success) {
        console.log('[Kokoro] 自动启动成功');
      } else {
        console.warn(`[Kokoro] 自动启动未就绪: ${result.message}`);
      }
    } catch (err) {
      console.warn('[Kokoro] 自动启动失败:', err instanceof Error ? err.message : err);
    }
  }
}

export const kokoroServiceManager = new KokoroServiceManager();
