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

export type Qwen3ServiceStatus = {
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

export type Qwen3ServiceActionResult = {
  success: boolean;
  changed: boolean;
  message: string;
  status: Qwen3ServiceStatus;
};

const DEFAULT_URL = 'http://127.0.0.1:8765';
const DEFAULT_SCRIPT = path.resolve('qwen-tts-server', 'server.py');
const DEFAULT_PYTHON = 'python';

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

export class Qwen3TTSServiceManager {
  private actionQueue: Promise<void> = Promise.resolve();

  private getRuntimeDir(): string {
    return path.resolve(getConfig().dataDir, 'runtime');
  }

  private getStateFile(): string {
    return path.join(this.getRuntimeDir(), 'qwen3-tts-service.json');
  }

  private getPythonCommand(): string {
    return (process.env.QWEN3_TTS_PYTHON || DEFAULT_PYTHON).trim() || DEFAULT_PYTHON;
  }

  private getScriptPath(): string {
    const raw = process.env.QWEN3_TTS_SERVER_SCRIPT || DEFAULT_SCRIPT;
    return path.resolve(raw);
  }

  private getAutoStartFlag(): boolean {
    return toBool(process.env.QWEN3_TTS_AUTO_START, true);
  }

  private resolveUrl(urlOverride?: string): string {
    const rawUrl = normalizeUrl(urlOverride || process.env.QWEN3_TTS_URL || getConfig().tts.qwen3Url || DEFAULT_URL);
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
      const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2500) });
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

  async getStatus(urlOverride?: string): Promise<Qwen3ServiceStatus> {
    const state = await this.readState();
    const url = this.resolveUrl(urlOverride || state?.url);
    let running = state ? isProcessAlive(state.pid) : false;
    const healthy = await this.checkHealth(url);
    let managed = !!state;
    let pid = state?.pid ?? null;

    if (state && !running) {
      await this.clearState();
      managed = false;
      pid = null;
      running = false;
    }

    return {
      url,
      healthy,
      running,
      managed,
      pid,
      pythonCommand: state?.pythonCommand || this.getPythonCommand(),
      scriptPath: state?.scriptPath || this.getScriptPath(),
      autoStart: this.getAutoStartFlag(),
      startedAt: state?.startedAt,
    };
  }

  private async startInternal(urlOverride?: string): Promise<Qwen3ServiceActionResult> {
    const targetUrl = this.resolveUrl(urlOverride);
    process.env.QWEN3_TTS_URL = targetUrl;

    const preStatus = await this.getStatus(targetUrl);
    if (preStatus.healthy) {
      return {
        success: true,
        changed: false,
        message: 'Qwen3-TTS 服务已在运行',
        status: preStatus,
      };
    }

    const scriptPath = this.getScriptPath();
    try {
      await fs.access(scriptPath);
    } catch {
      throw new Error(`未找到 Qwen3-TTS 启动脚本: ${scriptPath}`);
    }

    const pythonCommand = this.getPythonCommand();
    const parsedUrl = new URL(targetUrl);
    const host = parsedUrl.hostname;
    const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');

    const child = spawn(
      pythonCommand,
      [scriptPath],
      {
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          QWEN_TTS_HOST: host,
          QWEN_TTS_PORT: port,
          PYTHONUTF8: '1',
        },
        // 注意：不使用 detached: true
        // Windows 上 DETACHED_PROCESS 与 CREATE_NO_WINDOW 互斥，
        // 同时设置会导致弹出黑色控制台窗口。
        // 不 detach 意味着 Node.js 退出时 Python 进程也会结束（符合预期）。
        stdio: 'ignore',
        windowsHide: true,
      },
    );

    const pid = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', () => {
        if (!child.pid) {
          reject(new Error('Qwen3-TTS 进程启动失败，未获取到 PID'));
          return;
        }
        resolve(child.pid);
      });
    });

    child.unref();

    await this.writeState({
      pid,
      startedAt: new Date().toISOString(),
      url: targetUrl,
      pythonCommand,
      scriptPath,
    });

    const healthy = await waitFor(() => this.checkHealth(targetUrl), 25_000, 1_000);
    const status = await this.getStatus(targetUrl);

    return {
      success: healthy,
      changed: true,
      message: healthy ? 'Qwen3-TTS 服务启动成功' : '服务进程已启动，正在预热中，请稍后再测',
      status,
    };
  }

  private async stopInternal(urlOverride?: string): Promise<Qwen3ServiceActionResult> {
    const state = await this.readState();
    const targetUrl = this.resolveUrl(urlOverride || state?.url);

    if (!state) {
      const status = await this.getStatus(targetUrl);
      if (status.healthy) {
        // 尝试终止外部进程
        const killed = await this.killProcessByPort(targetUrl);
        if (killed) {
          await waitFor(async () => !(await this.checkHealth(targetUrl)), 5_000, 500);
          const newStatus = await this.getStatus(targetUrl);
          return {
            success: true,
            changed: true,
            message: '已终止外部 Qwen3-TTS 进程',
            status: newStatus,
          };
        }
        return {
          success: false,
          changed: false,
          message: '当前 Qwen3-TTS 并非由后端托管启动，自动终止失败。请手动停止。',
          status,
        };
      }
      return {
        success: true,
        changed: false,
        message: 'Qwen3-TTS 服务当前未运行',
        status,
      };
    }

    if (isProcessAlive(state.pid)) {
      try {
        process.kill(state.pid);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ESRCH') {
          throw err;
        }
      }

      await waitFor(() => !isProcessAlive(state.pid), 8_000, 300);
    }

    await this.clearState();
    const status = await this.getStatus(targetUrl);

    return {
      success: true,
      changed: true,
      message: 'Qwen3-TTS 服务已停止',
      status,
    };
  }

  async start(urlOverride?: string): Promise<Qwen3ServiceActionResult> {
    return this.withLock(() => this.startInternal(urlOverride));
  }

  async stop(urlOverride?: string): Promise<Qwen3ServiceActionResult> {
    return this.withLock(() => this.stopInternal(urlOverride));
  }

  /**
   * 通过端口号查找并终止占用该端口的进程（用于接管外部启动的 TTS 服务）
   */
  private async killProcessByPort(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      const rawPort = parsed.port || '8765';
      if (!/^\d{1,5}$/.test(rawPort)) return false;
      const port = rawPort;

      if (process.platform === 'win32') {
        // Windows: netstat 找 PID，taskkill 终止
        const output = execSync(
          `netstat -ano | findstr :${port} | findstr LISTENING`,
          { encoding: 'utf-8', timeout: 5000, windowsHide: true },
        ).trim();
        const lines = output.split('\n').filter(Boolean);
        const pids = new Set<number>();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) pids.add(pid);
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, windowsHide: true });
            console.log(`[Qwen3-TTS] 已终止外部进程 PID=${pid}`);
          } catch { /* 进程可能已退出 */ }
        }
        return pids.size > 0;
      } else {
        // Linux/macOS: lsof 或 fuser
        try {
          const output = execSync(
            `lsof -ti :${port}`,
            { encoding: 'utf-8', timeout: 5000, windowsHide: true },
          ).trim();
          const pids = output.split('\n').map(Number).filter(Boolean);
          for (const pid of pids) {
            try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
          }
          return pids.length > 0;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async restart(urlOverride?: string): Promise<Qwen3ServiceActionResult> {
    return this.withLock(async () => {
      const targetUrl = this.resolveUrl(urlOverride);
      const pre = await this.getStatus(targetUrl);

      if (pre.healthy && !pre.managed) {
        // 外部进程：尝试通过端口找到 PID 并终止
        const killed = await this.killProcessByPort(targetUrl);
        if (!killed) {
          return {
            success: false,
            changed: false,
            message: '检测到已有外部 Qwen3-TTS 进程，自动终止失败。请先手动停止后再启动。',
            status: pre,
          };
        }
        // 等待端口释放
        await waitFor(async () => !(await this.checkHealth(targetUrl)), 5_000, 500);
      } else if (pre.managed) {
        await this.stopInternal(targetUrl);
      }

      return this.startInternal(targetUrl);
    });
  }

  async autoStartIfNeeded(engine: string, qwen3Url: string): Promise<void> {
    if (engine !== 'qwen3-tts') return;
    if (!this.getAutoStartFlag()) return;

    const status = await this.getStatus(qwen3Url);
    if (status.healthy) {
      console.log('[Qwen3-TTS] 服务已在线，跳过自动启动');
      return;
    }

    try {
      const result = await this.start(qwen3Url);
      if (result.success) {
        console.log('[Qwen3-TTS] 自动启动成功');
      } else {
        console.warn(`[Qwen3-TTS] 自动启动未就绪: ${result.message}`);
      }
    } catch (err) {
      console.warn('[Qwen3-TTS] 自动启动失败:', err instanceof Error ? err.message : err);
    }
  }
}

export const qwen3TTSServiceManager = new Qwen3TTSServiceManager();
