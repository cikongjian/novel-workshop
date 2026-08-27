import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLegacyPersistedLocalSecrets,
  getLocalProfileSecrets,
  removeLocalProfileSecret,
  saveLocalProfileSecrets,
} from './user-api-local';

const profileId = 'test-profile';

afterEach(() => {
  removeLocalProfileSecret(profileId);
});

describe('local user API secrets', () => {
  it('keeps secrets in memory for the current page only', () => {
    saveLocalProfileSecrets(profileId, [' key-a ', 'key-a', 'key-b']);

    expect(getLocalProfileSecrets(profileId)).toEqual(['key-a', 'key-b']);
  });

  it('removes the legacy localStorage record', () => {
    const removeItem = vi.fn();

    clearLegacyPersistedLocalSecrets({ removeItem });

    expect(removeItem).toHaveBeenCalledWith('nw_user_api_local_secrets_v1');
  });
});
