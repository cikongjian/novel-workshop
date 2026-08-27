import type { AuthUser } from '../auth/types.js';

const LEGACY_LOCAL_USER_IDS = ['dev', 'default-user'] as const;

function uniqueUserIds(userIds: readonly string[]): string[] {
  return [...new Set(userIds.filter((userId) => typeof userId === 'string' && userId.trim().length > 0))];
}

/**
 * 兼容本地开发阶段遗留的 dev/default-user 数据。
 * 启用认证后，管理员仍可看到并管理这些历史书城记录。
 */
export function getBookstoreUserScope(auth?: AuthUser): string[] {
  if (!auth?.id) {
    return [...LEGACY_LOCAL_USER_IDS];
  }

  if (auth.role === 'admin') {
    return uniqueUserIds([auth.id, ...LEGACY_LOCAL_USER_IDS]);
  }

  return [auth.id];
}

export function getBookstoreActorId(auth?: AuthUser): string {
  return auth?.id ?? 'dev';
}
