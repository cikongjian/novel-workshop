// ==================== 公告类型 ====================

export type AnnouncementType = 'info' | 'warning' | 'success' | 'error' | 'feature' | 'maintenance';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;

  showInBanner: boolean;
  showInModal: boolean;
  showInDashboard: boolean;

  targetRoles: ('admin' | 'user')[];

  publishedAt?: string;
  expiresAt?: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementWithReadStatus extends Announcement {
  isRead: boolean;
}

export interface CreateAnnouncementRequest {
  title: string;
  content: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  showInBanner?: boolean;
  showInModal?: boolean;
  showInDashboard?: boolean;
  targetRoles?: ('admin' | 'user')[];
  expiresAt?: string;
}

export interface UpdateAnnouncementRequest {
  title?: string;
  content?: string;
  type?: AnnouncementType;
  priority?: AnnouncementPriority;
  showInBanner?: boolean;
  showInModal?: boolean;
  showInDashboard?: boolean;
  targetRoles?: ('admin' | 'user')[];
  expiresAt?: string;
}

export interface ListAnnouncementsQuery {
  status?: AnnouncementStatus;
  type?: AnnouncementType;
  priority?: AnnouncementPriority;
  limit?: number;
  offset?: number;
}

export interface ListAnnouncementsResponse {
  announcements: Announcement[];
  total: number;
}
