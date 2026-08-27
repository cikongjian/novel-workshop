import { http } from './http';

export type ComplianceEventCategory =
  | 'auth'
  | 'real_name'
  | 'report'
  | 'moderation'
  | 'publishing'
  | 'interaction'
  | 'creator';
export type ComplianceEventStatus = 'success' | 'failure' | 'rejected';

export type ComplianceEventRecord = {
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
  request: {
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
  };
  detail: Record<string, unknown>;
};

export type ComplianceEventListResponse = {
  items: ComplianceEventRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  retentionDays: number;
};

export type ComplianceEventStats = {
  total: number;
  last24Hours: number;
  last7Days: number;
  retentionDays: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byEventType: Record<string, number>;
};

export type ComplianceCheckStatus = 'pass' | 'warn';

export type ComplianceCheckItem = {
  key: string;
  title: string;
  status: ComplianceCheckStatus;
  detail: string;
};

export type ComplianceCheckResponse = {
  checkedAt: string;
  passCount: number;
  warnCount: number;
  items: ComplianceCheckItem[];
};

export async function fetchComplianceEvents(params: {
  page?: number;
  pageSize?: number;
  category?: ComplianceEventCategory;
  eventType?: string;
  status?: ComplianceEventStatus;
  actorUserId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ComplianceEventListResponse> {
  const { data } = await http.get<ComplianceEventListResponse>('/admin/compliance-events', { params });
  return data;
}

export async function fetchComplianceEventStats(): Promise<ComplianceEventStats> {
  const { data } = await http.get<ComplianceEventStats>('/admin/compliance-events/stats');
  return data;
}

export async function fetchComplianceChecks(): Promise<ComplianceCheckResponse> {
  const { data } = await http.get<ComplianceCheckResponse>('/admin/compliance-events/checks');
  return data;
}
