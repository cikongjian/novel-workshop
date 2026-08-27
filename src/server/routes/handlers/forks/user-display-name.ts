import type { Request } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import { getProfile } from '../../../../auth/user-service.js';

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getRequestFallbackName(req: Request): string {
  const auth = req.auth as (typeof req.auth & { name?: string; penName?: string | null }) | undefined;
  return (
    cleanDisplayName(auth?.penName)
    ?? cleanDisplayName(auth?.username)
    ?? cleanDisplayName(auth?.name)
    ?? '读者'
  );
}

export async function resolveRequestUserDisplayName(req: Request, authDb?: AuthDb): Promise<string> {
  const fallback = getRequestFallbackName(req);
  const userId = cleanDisplayName(req.auth?.id);
  if (!authDb || !userId) return fallback;

  try {
    const profile = await getProfile(authDb, userId);
    return cleanDisplayName(profile?.penName) ?? cleanDisplayName(profile?.username) ?? fallback;
  } catch {
    return fallback;
  }
}
