import { describe, expect, it } from 'vitest';
import { requireServiceUrl, validateServiceUrl } from './service-url.js';

describe('TTS service URL validation', () => {
  it('allows literal loopback and private network addresses', () => {
    expect(validateServiceUrl('http://127.0.0.1:8765/path', '')).toBe('http://127.0.0.1:8765');
    expect(validateServiceUrl('http://192.168.1.20:8767', '')).toBe('http://192.168.1.20:8767');
    expect(validateServiceUrl('http://[::1]:8767', '')).toBe('http://[::1]:8767');
  });

  it('pins localhost to the loopback literal', () => {
    expect(validateServiceUrl('http://localhost:8765', '')).toBe('http://127.0.0.1:8765');
  });

  it.each([
    'https://example.com:8765',
    'http://service.internal:8765',
    'file:///tmp/service.sock',
    'http://user:pass@127.0.0.1:8765',
  ])('rejects non-service target %s', (url) => {
    expect(validateServiceUrl(url, '')).toBeNull();
  });

  it('fails closed when a required URL is invalid', () => {
    expect(() => requireServiceUrl('https://example.com', 'http://127.0.0.1:8765')).toThrow();
  });
});
