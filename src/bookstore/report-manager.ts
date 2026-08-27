import { randomUUID } from 'crypto';
import type { AuthDb } from '../auth/types.js';
import { getProfile } from '../auth/user-service.js';
import type {
  Report,
  SubmitReportRequest,
  ReportListQuery,
  PaginatedResponse,
  ReportStatus,
} from './types.js';
import type { Database } from 'better-sqlite3';

const REPORT_LIMIT_PER_DAY = 3;

type ReportRow = {
  id: string; novel_id: string; chapter_id: string | null; reporter_id: string;
  report_type: string; reason: string; evidence: string | null; violation_position: string | null;
  status: string; create_time: number; handler_id: string | null; handle_result: string | null;
  handle_time: number | null; reporter_phone: string | null; reporter_email: string | null;
};

function rowToReport(r: ReportRow): Report {
  return {
    id: r.id, novelId: r.novel_id, chapterId: r.chapter_id ?? undefined,
    reporterId: r.reporter_id, reportType: r.report_type as Report['reportType'],
    reason: r.reason,
    evidence: r.evidence ? JSON.parse(r.evidence) as string[] : undefined,
    violationPosition: r.violation_position ? JSON.parse(r.violation_position) as Report['violationPosition'] : undefined,
    status: r.status as ReportStatus,
    createTime: new Date(r.create_time),
    handlerId: r.handler_id ?? undefined,
    handleResult: r.handle_result ?? undefined,
    handleTime: r.handle_time ? new Date(r.handle_time) : undefined,
  };
}

export class ReportManager {
  private readonly db: Database;
  private readonly authDb: AuthDb | null;

  constructor(_dataDir: string, authDb: AuthDb | null, db?: Database) {
    this.authDb = authDb;
    if (!db) throw new Error('ReportManager requires AppDb');
    this.db = db;
  }

  private checkReportLimitSync(reporterId: string, novelId: string): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const count = (this.db.prepare(
      'SELECT COUNT(*) as cnt FROM reports WHERE reporter_id=? AND novel_id=? AND create_time>?'
    ).get(reporterId, novelId, oneDayAgo) as { cnt: number }).cnt;
    if (count >= REPORT_LIMIT_PER_DAY) {
      throw new Error(`每天对同一作品最多举报 ${REPORT_LIMIT_PER_DAY} 次`);
    }
  }

  async submitReport(reporterId: string, request: SubmitReportRequest): Promise<Report> {
    if (this.authDb) {
      const profile = await getProfile(this.authDb, reporterId);
      if (!profile) throw new Error('用户不存在');
    }
    this.checkReportLimitSync(reporterId, request.novelId);

    const report: Omit<Report, 'reporterPhone' | 'reporterEmail'> & { reporterPhone?: string; reporterEmail?: string } = {
      id: randomUUID(), novelId: request.novelId, chapterId: request.chapterId,
      reporterId, reportType: request.reportType, reason: request.reason,
      evidence: request.evidence, violationPosition: request.violationPosition,
      status: 'pending', createTime: new Date(),
      reporterPhone: (request as Record<string, unknown>).reporterPhone as string | undefined,
      reporterEmail: (request as Record<string, unknown>).reporterEmail as string | undefined,
    };

    this.db.prepare(
      'INSERT INTO reports (id,novel_id,chapter_id,reporter_id,report_type,reason,evidence,violation_position,status,create_time,reporter_phone,reporter_email) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(report.id, report.novelId, report.chapterId ?? null, report.reporterId, report.reportType, report.reason, report.evidence ? JSON.stringify(report.evidence) : null, report.violationPosition ? JSON.stringify(report.violationPosition) : null, report.status, report.createTime.getTime(), report.reporterPhone ?? null, report.reporterEmail ?? null);

    return report;
  }

  async handleReport(reportId: string, handlerId: string, result: string, status: ReportStatus): Promise<Report | null> {
    const now = Date.now();
    this.db.prepare(
      'UPDATE reports SET status=?,handler_id=?,handle_result=?,handle_time=? WHERE id=?'
    ).run(status, handlerId, result, now, reportId);
    const row = this.db.prepare('SELECT * FROM reports WHERE id=?').get(reportId) as ReportRow | undefined;
    return row ? rowToReport(row) : null;
  }

  async getReport(reportId: string): Promise<Report | null> {
    const row = this.db.prepare('SELECT * FROM reports WHERE id=?').get(reportId) as ReportRow | undefined;
    return row ? rowToReport(row) : null;
  }

  async listReports(query: ReportListQuery): Promise<PaginatedResponse<Report>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.status) { conditions.push('status=?'); params.push(query.status); }
    if (query.reportType) { conditions.push('report_type=?'); params.push(query.reportType); }
    if (query.startDate) { conditions.push('create_time>=?'); params.push(new Date(query.startDate).getTime()); }
    if (query.endDate) { conditions.push('create_time<=?'); params.push(new Date(query.endDate).getTime()); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) as cnt FROM reports ${where}`).get(...params) as { cnt: number }).cnt;
    const totalPages = Math.ceil(total / query.pageSize);
    const start = (query.page - 1) * query.pageSize;
    const rows = this.db.prepare(`SELECT * FROM reports ${where} ORDER BY create_time DESC LIMIT ? OFFSET ?`).all(...params, query.pageSize, start) as ReportRow[];
    return { items: rows.map(rowToReport), total, page: query.page, pageSize: query.pageSize, totalPages };
  }
}
