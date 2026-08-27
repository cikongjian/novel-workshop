import { describe, expect, it } from 'vitest';
import { normalizeSenderAddress } from './email-service.js';

describe('normalizeSenderAddress', () => {
  it('preserves a plain validated mailbox', () => {
    expect(normalizeSenderAddress('writer@example.com', 'smtp@example.com'))
      .toBe('writer@example.com');
  });

  it('returns a structured named mailbox', () => {
    expect(normalizeSenderAddress('"Novel Writer" <writer@example.com>', 'smtp@example.com'))
      .toEqual({ name: 'Novel Writer', address: 'writer@example.com' });
  });

  it('removes header newlines from display-name input', () => {
    expect(normalizeSenderAddress('Writer\r\nBcc: victim@example.com', 'smtp@example.com'))
      .toEqual({ name: 'WriterBcc: victim@example.com', address: 'smtp@example.com' });
  });

  it('requires a valid fallback mailbox', () => {
    expect(() => normalizeSenderAddress('', 'smtp-account'))
      .toThrow(/SMTP_FROM/);
  });
});
