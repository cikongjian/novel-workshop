import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export type ComplianceEventCategory =
  | 'auth'
  | 'real_name'
  | 'report'
  | 'moderation'
  | 'publishing'
  | 'interaction'
  | 'creator';
export type ComplianceEventStatus = 'success' | 'failure' | 'rejected';

export interface ComplianceRequestContext {
  method: string;
  path: string;
  ipAddress: string;
  forwardedFor: string[];
  remoteAddress: string | null;
  remotePort: number | null;
  localAddress: string | null;
  localPort: number | null;
  userAgent: string;
  clientHints: {
    secChUa: string;
    secChUaMobile: string;
    secChUaPlatform: string;
  };
}

export interface ComplianceEventRecord {
  id: string;
  category: ComplianceEventCategory;
  eventType: string;
  status: ComplianceEventStatus;
  occurredAt: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  request: ComplianceRequestContext;
  detail: Record<string, unknown>;
}

export interface ComplianceEventInput {
  category: ComplianceEventCategory;
  eventType: string;
  status: ComplianceEventStatus;
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  request: ComplianceRequestContext;
  detail?: Record<string, unknown>;
}

export interface ComplianceEventQuery {
  page: number;
  pageSize: number;
  category?: ComplianceEventCategory;
  eventType?: string;
  status?: ComplianceEventStatus;
  actorUserId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

type ComplianceEventStore = {
  events: ComplianceEventRecord[];
};

const COMPLIANCE_EVENT_FILE = 'compliance-events.json';
const DEFAULT_RETENTION_DAYS = 365;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveForwardedFor(header: string | string[] | undefined): string[] {
  if (Array.isArray(header)) {
    return header
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (typeof header === 'string') {
    return header
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

function sanitizeRequestPath(value: string): string {
  if (!value) return '/';
  return value.length > 300 ? value.slice(0, 300) : value;
}

function sanitizeUserAgent(value: string): string {
  if (!value) return 'unknown';
  return value.length > 300 ? value.slice(0, 300) : value;
}

function resolveRetentionDays(): number {
  const raw = Number.parseInt(process.env.COMPLIANCE_EVENT_RETENTION_DAYS ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }
  return Math.max(30, Math.min(3650, raw));
}

function isWithinRange(value: string, dateFrom?: string, dateTo?: string): boolean {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;

  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    if (!Number.isNaN(from) && time < from) {
      return false;
    }
  }

  if (dateTo) {
    const to = new Date(dateTo).getTime();
    if (!Number.isNaN(to) && time > to) {
      return false;
    }
  }

  return true;
}

export function buildComplianceRequestContext(req: Request): ComplianceRequestContext {
  const forwardedFor = resolveForwardedFor(req.headers['x-forwarded-for']);
  const ipAddress = forwardedFor[0] || req.ip || req.socket.remoteAddress || 'unknown';

  return {
    method: req.method.toUpperCase(),
    path: sanitizeRequestPath(req.originalUrl || req.path || '/'),
    ipAddress,
    forwardedFor,
    remoteAddress: req.socket.remoteAddress ?? null,
    remotePort: req.socket.remotePort ?? null,
    localAddress: req.socket.localAddress ?? null,
    localPort: req.socket.localPort ?? null,
    userAgent: sanitizeUserAgent(normalizeString(req.headers['user-agent'])),
    clientHints: {
      secChUa: normalizeString(req.headers['sec-ch-ua']),
      secChUaMobile: normalizeString(req.headers['sec-ch-ua-mobile']),
      secChUaPlatform: normalizeString(req.headers['sec-ch-ua-platform']),
    },
  };
}

export class ComplianceEventManager {
  constructor(private readonly dataDir: string) {}

  private getFilePath(): string {
    return path.join(this.dataDir, COMPLIANCE_EVENT_FILE);
  }

  private async ensureStore(): Promise<void> {
    const filePath = this.getFilePath();
    try {
      await fs.access(filePath);
    } catch {
      const initialStore: ComplianceEventStore = { events: [] };
      await fs.writeFile(filePath, JSON.stringify(initialStore, null, 2), 'utf-8');
    }
  }

  private async readStore(): Promise<ComplianceEventStore> {
    await this.ensureStore();
    const content = await fs.readFile(this.getFilePath(), 'utf-8');
    const parsed = JSON.parse(content) as Partial<ComplianceEventStore>;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  }

  private async writeStore(store: ComplianceEventStore): Promise<void> {
    await fs.writeFile(this.getFilePath(), JSON.stringify(store, null, 2), 'utf-8');
  }

  private pruneExpiredEvents(events: ComplianceEventRecord[]): ComplianceEventRecord[] {
    const retentionDays = resolveRetentionDays();
    const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return events.filter((event) => {
      const time = new Date(event.occurredAt).getTime();
      return Number.isFinite(time) && time >= threshold;
    });
  }

  async record(input: ComplianceEventInput): Promise<ComplianceEventRecord> {
    const store = await this.readStore();
    const nextEvents = this.pruneExpiredEvents(store.events);

    const record: ComplianceEventRecord = {
      id: randomUUID(),
      category: input.category,
      eventType: input.eventType,
      status: input.status,
      occurredAt: new Date().toISOString(),
      actorUserId: input.actorUserId ?? null,
      actorUsername: input.actorUsername ?? null,
      actorRole: input.actorRole ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      request: input.request,
      detail: input.detail ?? {},
    };

    nextEvents.push(record);
    await this.writeStore({ events: nextEvents });
    return record;
  }

  async list(query: ComplianceEventQuery): Promise<{
    items: ComplianceEventRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    retentionDays: number;
  }> {
    const store = await this.readStore();
    const events = this.pruneExpiredEvents(store.events);
    let filtered = [...events];

    if (query.category) {
      filtered = filtered.filter((event) => event.category === query.category);
    }

    if (query.eventType) {
      filtered = filtered.filter((event) => event.eventType === query.eventType);
    }

    if (query.status) {
      filtered = filtered.filter((event) => event.status === query.status);
    }

    if (query.actorUserId) {
      filtered = filtered.filter((event) => event.actorUserId === query.actorUserId);
    }

    if (query.dateFrom || query.dateTo) {
      filtered = filtered.filter((event) => isWithinRange(event.occurredAt, query.dateFrom, query.dateTo));
    }

    if (query.search) {
      const keyword = query.search.trim().toLowerCase();
      filtered = filtered.filter((event) => {
        const haystack = JSON.stringify(event).toLowerCase();
        return haystack.includes(keyword);
      });
    }

    filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(Math.max(1, query.page), totalPages);
    const start = (page - 1) * query.pageSize;

    return {
      items: filtered.slice(start, start + query.pageSize),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
      retentionDays: resolveRetentionDays(),
    };
  }

  async getStats(): Promise<{
    total: number;
    last24Hours: number;
    last7Days: number;
    retentionDays: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    byEventType: Record<string, number>;
  }> {
    const store = await this.readStore();
    const events = this.pruneExpiredEvents(store.events);
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byEventType: Record<string, number> = {};

    for (const event of events) {
      byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
      byStatus[event.status] = (byStatus[event.status] ?? 0) + 1;
      byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + 1;
    }

    return {
      total: events.length,
      last24Hours: events.filter((event) => new Date(event.occurredAt).getTime() >= dayAgo).length,
      last7Days: events.filter((event) => new Date(event.occurredAt).getTime() >= weekAgo).length,
      retentionDays: resolveRetentionDays(),
      byCategory,
      byStatus,
      byEventType,
    };
  }
}
