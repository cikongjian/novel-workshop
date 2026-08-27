import type { AuthDb, AuthUser } from '../../../auth/types.js';
import {
  assertRealNameVerified,
  RealNameRequiredError,
} from '../../../auth/real-name-service.js';
import type { RealNameScene } from '../../../auth/real-name-policy.js';
import { ForbiddenError, UnauthorizedError } from '../../errors.js';

export async function ensureRealNameVerified(
  authDb: AuthDb | undefined,
  auth: AuthUser | undefined,
  scene: RealNameScene,
): Promise<void> {
  if (!auth) {
    throw new UnauthorizedError('请先登录');
  }

  if (!authDb) {
    return;
  }

  try {
    await assertRealNameVerified(authDb, auth.id, scene);
  } catch (error) {
    if (error instanceof RealNameRequiredError) {
      throw new ForbiddenError(error.message);
    }
    throw error;
  }
}
