import { http } from './http';

export interface SystemResources {
  timestamp: string;
  hostname: string;
  platform: string;
  uptime: number;
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number };
  cpu: { model: string; cores: number; loadAvg: [number, number, number]; usagePercent: number };
  disk: Array<{ filesystem: string; mountpoint: string; totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number }>;
  process: { nodeVersion: string; pid: number; uptimeSeconds: number; memoryUsage: { rss: number; heapTotal: number; heapUsed: number; external: number } };
}

export async function fetchSystemResources(): Promise<SystemResources> {
  const { data } = await http.get<SystemResources>('/system', {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    params: {
      _: Date.now(),
    },
  });
  return data;
}
