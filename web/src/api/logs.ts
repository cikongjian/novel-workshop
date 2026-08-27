/**
 * 日志管理 API
 */

import { http } from './http';

export interface LogEntry {
  time: string;
  level: string;
  tag?: string;
  msg: string;
  [key: string]: unknown;
}

export interface LogSummary {
  total: number;
  byLevel: Record<string, number>;
  byTag: Record<string, number>;
  timeRange: { earliest: string; latest: string } | null;
}

export interface LogFileInfo {
  name: string;
  size: number;
  mtime: string;
}

export interface LogFilesResponse {
  files: LogFileInfo[];
  totalSize: number;
  count: number;
  persistenceEnabled: boolean;
}

export interface LogQueryResponse {
  logs: LogEntry[];
  summary: LogSummary;
  source: 'files' | 'buffer';
  persistenceEnabled: boolean;
}

export interface LogStatsResponse {
  summary: LogSummary;
  files: {
    count: number;
    totalSize: number;
  };
  source: 'files' | 'buffer';
  persistenceEnabled: boolean;
}

export interface LogFilters {
  level?: string;
  tag?: string;
  search?: string;
  since?: string;
  limit?: number;
  date?: string;
}

/**
 * 获取日志文件列表
 */
export async function getLogFiles(limit?: number): Promise<LogFilesResponse> {
  const { data } = await http.get<LogFilesResponse>('/auth/admin/logs/files', {
    params: {
      limit: limit || undefined,
    },
  });
  return data;
}

/**
 * 查询日志
 */
export async function queryLogs(filters: LogFilters = {}): Promise<LogQueryResponse> {
  const { data } = await http.get<LogQueryResponse>('/auth/admin/logs/query', {
    params: {
      level: filters.level || undefined,
      tag: filters.tag || undefined,
      search: filters.search || undefined,
      since: filters.since || undefined,
      limit: filters.limit || undefined,
      date: filters.date || undefined,
    },
  });
  return data;
}

/**
 * 获取日志统计
 */
export async function getLogStats(): Promise<LogStatsResponse> {
  const { data } = await http.get<LogStatsResponse>('/auth/admin/logs/stats');
  return data;
}

/**
 * 获取可用的日志级别
 */
export async function getLogLevels(): Promise<{ levels: string[] }> {
  const { data } = await http.get<{ levels: string[] }>('/auth/admin/logs/levels');
  return data;
}

/**
 * 获取已使用的日志标签
 */
export async function getLogTags(): Promise<{ tags: string[] }> {
  const { data } = await http.get<{ tags: string[] }>('/auth/admin/logs/tags');
  return data;
}
