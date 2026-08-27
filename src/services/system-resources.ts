import os from 'node:os';
import { execSync } from 'node:child_process';

interface CpuSnapshot {
  idle: number;
  total: number;
}

export interface DiskInfo {
  filesystem: string;
  mountpoint: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface SystemResourcesSnapshot {
  timestamp: string;
  hostname: string;
  platform: string;
  uptime: number;
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  cpu: {
    model: string;
    cores: number;
    loadAvg: [number, number, number];
    usagePercent: number;
  };
  disk: DiskInfo[];
  process: {
    nodeVersion: string;
    pid: number;
    uptimeSeconds: number;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
}

let prevCpuSnapshot: CpuSnapshot | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function takeCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

async function getCpuUsagePercent(): Promise<number> {
  let previous = prevCpuSnapshot;
  if (!previous) {
    previous = takeCpuSnapshot();
    prevCpuSnapshot = previous;
    await delay(200);
  }

  const current = takeCpuSnapshot();
  const idleDelta = current.idle - previous.idle;
  const totalDelta = current.total - previous.total;
  prevCpuSnapshot = current;
  if (totalDelta === 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 10000) / 100;
}

function getDiskInfo(): DiskInfo[] {
  try {
    const output = execSync('df -Pk 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const lines = output.trim().split('\n').slice(1);
    const KB = 1024;
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) return null;
        const filesystem = parts[0];
        if (!filesystem.startsWith('/dev/')) return null;
        const totalKB = Number.parseInt(parts[1], 10);
        const usedKB = Number.parseInt(parts[2], 10);
        const freeKB = Number.parseInt(parts[3], 10);
        const usagePercent = Number.parseInt(parts[4], 10) || 0;
        const mountpoint = parts[5];
        return {
          filesystem,
          mountpoint,
          totalBytes: totalKB * KB,
          usedBytes: usedKB * KB,
          freeBytes: freeKB * KB,
          usagePercent,
        } satisfies DiskInfo;
      })
      .filter((item): item is DiskInfo => item !== null);
  } catch {
    return [];
  }
}

export async function collectSystemResourcesSnapshot(): Promise<SystemResourcesSnapshot> {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = process.memoryUsage();

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptime: Math.floor(os.uptime()),
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usagePercent: Math.round((usedMem / totalMem) * 10000) / 100,
    },
    cpu: {
      model: cpus[0]?.model || 'Unknown',
      cores: cpus.length,
      loadAvg: os.loadavg() as [number, number, number],
      usagePercent: await getCpuUsagePercent(),
    },
    disk: getDiskInfo(),
    process: {
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsage: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
      },
    },
  };
}
