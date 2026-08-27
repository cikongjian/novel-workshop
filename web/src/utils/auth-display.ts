import type { CreatorStatus } from '../api/auth';

type RoleLike = {
  role: 'user' | 'admin';
  creatorStatus?: CreatorStatus;
} | null | undefined;

export const CREATOR_STATUS_LABELS: Record<CreatorStatus, string> = {
  none: '读者',
  pending: '作家审核中',
  approved: '作家',
  rejected: '申请未通过',
  suspended: '作家资格停用',
};

export function getUserRoleLabel(user: RoleLike): string {
  if (!user) return '未登录';
  if (user.role === 'admin') return '管理员';
  return CREATOR_STATUS_LABELS[user.creatorStatus ?? 'none'];
}

export function getCreatorStatusTagType(status: CreatorStatus): 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'rejected':
    case 'suspended':
      return 'danger';
    default:
      return 'info';
  }
}
