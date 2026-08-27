// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readOrCreateBillingUserId } from './billing-user';

describe('readOrCreateBillingUserId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses a cryptographically random UUID and persists it', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('123e4567-e89b-42d3-a456-426614174000');

    const first = readOrCreateBillingUserId();
    const second = readOrCreateBillingUserId();

    expect(first).toBe('bill_123e4567-e89b-42d3-a456-426614174000');
    expect(second).toBe(first);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
});
