import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isPublicIpAddress } from './url-safety.js';
import { safeFetch } from './safe-fetch.js';

describe('URL safety', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.1.1',
    '198.51.100.10',
    '192.88.99.1',
    '::1',
    '64:ff9b::1',
    '100::1',
    'fc00::1',
    'fe80::1',
    '2002:7f00:1::',
    '::ffff:127.0.0.1',
  ])('blocks non-public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('accepts public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([
    'http://localhost:3000',
    'http://service.internal',
    'http://169.254.169.254/latest/meta-data',
    'http://user:password@example.com',
    'file:///etc/passwd',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => assertSafeUrl(url)).toThrow();
  });

  it('rejects private targets before opening a request', async () => {
    await expect(safeFetch('http://127.0.0.1:65535')).rejects.toThrow(/内部|保留|主机/);
  });
});
