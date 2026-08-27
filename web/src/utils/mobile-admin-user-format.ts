import type { AdminUserListItem, CreatorStatus } from '../api/auth';

export function formatAdminUserStatus(status: AdminUserListItem['status']): string {
  return status === 'active' ? '正常' : '已禁用';
}

export function formatAdminCreatorStatus(status: CreatorStatus): string {
  const labels: Record<CreatorStatus, string> = {
    none: '未开通',
    pending: '审核中',
    approved: '创作者',
    rejected: '已拒绝',
    suspended: '已停用',
  };
  return labels[status] ?? status;
}

export function formatAdminDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatAdminDateTime(value: string | null): string {
  if (!value) return '未登录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${h}:${m}:${s}`;
}

export function formatAdminWords(value: number): string {
  return `${value.toLocaleString()} 字`;
}

export function formatAdminShortWords(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万字`;
  return `${value.toLocaleString()} 字`;
}

export function getAdminUserInitial(username: string): string {
  const trimmed = username.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'U';
}
