import type { UserProfile } from '../api/auth';

type CreatorPortalUser = Pick<UserProfile, 'role' | 'creatorStatus' | 'creatorRejectReason'> | null | undefined;

export function getCreatorPortalHint(user: CreatorPortalUser, guestHint?: string): string {
  if (!user) {
    return guestHint || '注册后即可浏览书城作品，随时可以申请成为作家开始创作。';
  }

  if (user.role === 'admin') {
    return '管理员账号，拥有平台全部管理权限。';
  }

  if (user.creatorStatus === 'pending') {
    return '作家申请已提交，正在等待审核，通常很快就会处理。';
  }

  if (user.creatorStatus === 'approved') {
    return '你已拥有作家资格，可以进入创作台开始做书。';
  }

  if (user.creatorStatus === 'suspended') {
    return user.creatorRejectReason?.trim() || '作家资格已停用，请联系管理员了解详情。';
  }

  if (user.creatorStatus === 'rejected') {
    return user.creatorRejectReason?.trim() || '上次申请未通过，可以完善资料后重新提交。';
  }

  return '当前为读者身份，可以浏览作品和参与评论。想创作的话，随时可以申请成为作家。';
}
