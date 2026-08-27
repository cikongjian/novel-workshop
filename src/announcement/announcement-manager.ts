import { randomUUID } from 'node:crypto';
import type {
  Announcement,
  AnnouncementReadRecord,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
  AnnouncementStatus,
  AnnouncementType,
  AnnouncementPriority,
  AnnouncementWithReadStatus,
} from './types.js';
import { createLogger } from '../utils/logger.js';
import type { Database } from 'better-sqlite3';

const logger = createLogger('AnnouncementManager');

type AnnouncementRow = {
  id: string; title: string; content: string; type: string; priority: string;
  status: string; show_in_banner: number; show_in_modal: number; show_in_dashboard: number;
  target_roles: string; expires_at: number | null;
  created_by: string; created_at: number; updated_at: number;
};

function rowToAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: r.id, title: r.title, content: r.content,
    type: r.type as Announcement['type'], priority: r.priority as Announcement['priority'],
    status: r.status as AnnouncementStatus,
    showInBanner: r.show_in_banner === 1, showInModal: r.show_in_modal === 1,
    showInDashboard: r.show_in_dashboard === 1,
    targetRoles: JSON.parse(r.target_roles || '[]'),
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : undefined,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export class AnnouncementManager {
  private readonly db: Database;

  constructor(_dataDir: string, db?: Database) {
    if (!db) throw new Error('AnnouncementManager requires AppDb');
    this.db = db;
  }

  async init(): Promise<void> {
    // SQLite 表已在 initAppDb 中创建，无需额外初始化
  }

  async createAnnouncement(request: CreateAnnouncementRequest, createdBy: string): Promise<Announcement> {
    const now = Date.now();
    const id = randomUUID();
    this.db.prepare('INSERT INTO announcements (id,title,content,type,priority,status,show_in_banner,show_in_modal,show_in_dashboard,target_roles,expires_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, request.title, request.content, request.type, request.priority, 'draft',
        request.showInBanner ? 1 : 0, request.showInModal ? 1 : 0, request.showInDashboard ? 1 : 0,
        JSON.stringify(request.targetRoles ?? []),
        request.expiresAt ? new Date(request.expiresAt).getTime() : null,
        createdBy, now, now);
    logger.info(`已创建公告: ${id} - ${request.title}`);
    return rowToAnnouncement(this.db.prepare('SELECT * FROM announcements WHERE id=?').get(id) as AnnouncementRow);
  }

  async listAnnouncements(filters?: { status?: AnnouncementStatus; type?: AnnouncementType; priority?: AnnouncementPriority; limit?: number; offset?: number }): Promise<{ announcements: Announcement[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.status) { conditions.push('status=?'); params.push(filters.status); }
    if (filters?.type) { conditions.push('type=?'); params.push(filters.type); }
    if (filters?.priority) { conditions.push('priority=?'); params.push(filters.priority); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) as cnt FROM announcements ${where}`).get(...params) as { cnt: number }).cnt;
    const priorityOrder = "CASE priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC, created_at DESC";
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    const rows = this.db.prepare(`SELECT * FROM announcements ${where} ORDER BY ${priorityOrder} LIMIT ? OFFSET ?`).all(...params, limit, offset) as AnnouncementRow[];
    return { announcements: rows.map(rowToAnnouncement), total };
  }

  async updateAnnouncement(id: string, request: UpdateAnnouncementRequest): Promise<Announcement> {
    const existing = this.db.prepare('SELECT * FROM announcements WHERE id=?').get(id) as AnnouncementRow | undefined;
    if (!existing) throw new Error(`公告不存在: ${id}`);
    const now = Date.now();
    const updated = { ...rowToAnnouncement(existing), ...request, updatedAt: new Date(now).toISOString() };
    this.db.prepare('UPDATE announcements SET title=?,content=?,type=?,priority=?,status=?,show_in_banner=?,show_in_modal=?,show_in_dashboard=?,target_roles=?,expires_at=?,updated_at=? WHERE id=?')
      .run(updated.title, updated.content, updated.type, updated.priority, updated.status,
        updated.showInBanner ? 1 : 0, updated.showInModal ? 1 : 0, updated.showInDashboard ? 1 : 0,
        JSON.stringify(updated.targetRoles), updated.expiresAt ? new Date(updated.expiresAt).getTime() : null, now, id);
    logger.info(`已更新公告: ${id}`);
    return updated;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    this.db.prepare('DELETE FROM announcement_reads WHERE announcement_id=?').run(id);
    this.db.prepare('DELETE FROM announcements WHERE id=?').run(id);
    logger.info(`已删除公告: ${id}`);
  }

  async getAnnouncement(id: string): Promise<Announcement | null> {
    const row = this.db.prepare('SELECT * FROM announcements WHERE id=?').get(id) as AnnouncementRow | undefined;
    return row ? rowToAnnouncement(row) : null;
  }

  async listActiveAnnouncementsForUser(userId: string, userRole: 'admin' | 'user'): Promise<AnnouncementWithReadStatus[]> {
    const now = Date.now();
    const rows = this.db.prepare("SELECT * FROM announcements WHERE status='published' AND (expires_at IS NULL OR expires_at > ?)").all(now) as AnnouncementRow[];
    const active = rows.map(rowToAnnouncement).filter(a => {
      const roles = a.targetRoles as string[];
      return !roles.length || roles.includes(userRole) || roles.includes('all');
    });
    const readRows = this.db.prepare('SELECT announcement_id FROM announcement_reads WHERE user_id=?').all(userId) as Array<{ announcement_id: string }>;
    const readSet = new Set(readRows.map(r => r.announcement_id));
    return active.map(a => ({ ...a, isRead: readSet.has(a.id) }));
  }

  async markAsRead(announcementId: string, userId: string): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id,user_id,read_at) VALUES (?,?,?)').run(announcementId, userId, Date.now());
  }

  async getUnreadCount(userId: string, userRole: 'admin' | 'user'): Promise<number> {
    const active = await this.listActiveAnnouncementsForUser(userId, userRole);
    return active.filter(a => !a.isRead).length;
  }

  async publishAnnouncement(id: string): Promise<Announcement> {
    return this.updateAnnouncement(id, { status: 'published' } as UpdateAnnouncementRequest);
  }

  async archiveAnnouncement(id: string): Promise<Announcement> {
    return this.updateAnnouncement(id, { status: 'archived' } as UpdateAnnouncementRequest);
  }

  async archiveExpiredAnnouncements(): Promise<number> {
    const now = Date.now();
    const result = this.db.prepare("UPDATE announcements SET status='archived', updated_at=? WHERE status='published' AND expires_at IS NOT NULL AND expires_at<?").run(now, now);
    const count = result.changes;
    if (count > 0) logger.info(`已自动归档 ${count} 条过期公告`);
    return count;
  }
}
