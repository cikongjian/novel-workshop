import { http } from './http';
import type {
  Announcement,
  AnnouncementWithReadStatus,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
  ListAnnouncementsQuery,
  ListAnnouncementsResponse,
} from '../types/announcement';

// ==================== 用户端 API ====================

export async function fetchActiveAnnouncements(): Promise<AnnouncementWithReadStatus[]> {
  const res = await http.get<{ announcements: AnnouncementWithReadStatus[] }>('/announcements');
  return res.data.announcements;
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await http.get<{ count: number }>('/announcements/unread-count');
  return res.data.count;
}

export async function markAnnouncementAsRead(id: string): Promise<void> {
  await http.post(`/announcements/${id}/read`);
}

// ==================== 管理员 API ====================

export async function createAnnouncement(data: CreateAnnouncementRequest): Promise<Announcement> {
  const res = await http.post<{ announcement: Announcement }>('/admin/announcements', data);
  return res.data.announcement;
}

export async function fetchAllAnnouncements(query?: ListAnnouncementsQuery): Promise<ListAnnouncementsResponse> {
  const res = await http.get<ListAnnouncementsResponse>('/admin/announcements', { params: query });
  return res.data;
}

export async function updateAnnouncement(id: string, data: UpdateAnnouncementRequest): Promise<Announcement> {
  const res = await http.put<{ announcement: Announcement }>(`/admin/announcements/${id}`, data);
  return res.data.announcement;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await http.delete(`/admin/announcements/${id}`);
}

export async function publishAnnouncement(id: string): Promise<Announcement> {
  const res = await http.post<{ announcement: Announcement }>(`/admin/announcements/${id}/publish`);
  return res.data.announcement;
}

export async function archiveAnnouncement(id: string): Promise<Announcement> {
  const res = await http.post<{ announcement: Announcement }>(`/admin/announcements/${id}/archive`);
  return res.data.announcement;
}
