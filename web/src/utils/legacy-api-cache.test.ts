import { describe, expect, it, vi } from 'vitest';
import { clearLegacyPrivateApiCache } from './legacy-api-cache';

describe('clearLegacyPrivateApiCache', () => {
  it('deletes the API cache created by older service workers', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);

    await expect(clearLegacyPrivateApiCache({ delete: deleteCache })).resolves.toBe(true);
    expect(deleteCache).toHaveBeenCalledWith('api-cache');
  });

  it('fails closed when Cache Storage is unavailable', async () => {
    const deleteCache = vi.fn().mockRejectedValue(new Error('unavailable'));

    await expect(clearLegacyPrivateApiCache({ delete: deleteCache })).resolves.toBe(false);
  });
});
