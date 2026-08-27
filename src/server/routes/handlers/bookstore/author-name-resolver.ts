import type { RowDataPacket } from 'mysql2/promise';
import type { AuthDb } from '../../../../auth/types.js';
import { getProfile } from '../../../../auth/user-service.js';
import { brand } from '../../../../config/brand.js';

const DEFAULT_BOOKSTORE_AUTHOR_NAME = brand.displayName;
const LEGACY_ADMIN_CACHE_KEY = '__legacy_admin_author__';
const LEGACY_LOCAL_USER_IDS = new Set(['dev', 'default-user']);

interface AdminDisplayNameRow extends RowDataPacket {
  username: string;
  pen_name: string | null;
}

type AuthorNameTarget = {
  userId: string;
  authorName?: string | null;
};

export async function resolveBookAuthorName(
  target: AuthorNameTarget,
  authDb?: AuthDb,
  authorNameCache?: Map<string, Promise<string>>,
): Promise<string> {
  const existingName = target.authorName?.trim();
  if (existingName) {
    return existingName;
  }

  if (isLegacyLocalUserId(target.userId)) {
    return resolveLegacyAdminAuthorName(authDb, authorNameCache);
  }

  return resolveRegisteredUserAuthorName(target.userId, authDb, authorNameCache);
}

function isLegacyLocalUserId(userId: string): boolean {
  return LEGACY_LOCAL_USER_IDS.has(userId);
}

async function resolveRegisteredUserAuthorName(
  userId: string,
  authDb?: AuthDb,
  authorNameCache?: Map<string, Promise<string>>,
): Promise<string> {
  if (!authDb) {
    return DEFAULT_BOOKSTORE_AUTHOR_NAME;
  }

  const cached = authorNameCache?.get(userId);
  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    try {
      const profile = await getProfile(authDb, userId);
      return profile?.penName?.trim() || profile?.username?.trim() || DEFAULT_BOOKSTORE_AUTHOR_NAME;
    } catch {
      return DEFAULT_BOOKSTORE_AUTHOR_NAME;
    }
  })();

  authorNameCache?.set(userId, lookup);
  return lookup;
}

async function resolveLegacyAdminAuthorName(
  authDb?: AuthDb,
  authorNameCache?: Map<string, Promise<string>>,
): Promise<string> {
  if (!authDb) {
    return DEFAULT_BOOKSTORE_AUTHOR_NAME;
  }

  const cached = authorNameCache?.get(LEGACY_ADMIN_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    try {
      const [rows] = await authDb.execute<AdminDisplayNameRow[]>(
        `SELECT username, pen_name
         FROM users
         WHERE role = ?
         ORDER BY created_at ASC
         LIMIT 1`,
        ['admin'],
      );
      const admin = rows[0];
      return admin?.pen_name?.trim() || admin?.username?.trim() || DEFAULT_BOOKSTORE_AUTHOR_NAME;
    } catch {
      return DEFAULT_BOOKSTORE_AUTHOR_NAME;
    }
  })();

  authorNameCache?.set(LEGACY_ADMIN_CACHE_KEY, lookup);
  return lookup;
}
