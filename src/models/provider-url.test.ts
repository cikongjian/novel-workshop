import { describe, expect, it } from 'vitest';
import { normalizeProviderBaseUrl } from './provider-url.js';

describe('normalizeProviderBaseUrl', () => {
  it('rewrites Zhipu coding endpoint to the general API endpoint', () => {
    expect(normalizeProviderBaseUrl('zhipu', 'https://open.bigmodel.cn/api/coding/paas/v4')).toBe(
      'https://open.bigmodel.cn/api/paas/v4',
    );
    expect(normalizeProviderBaseUrl('zhipu', 'https://open.bigmodel.cn/api/coding/paas/v4/')).toBe(
      'https://open.bigmodel.cn/api/paas/v4',
    );
  });

  it('preserves non-Zhipu providers except for trimming trailing slashes', () => {
    expect(normalizeProviderBaseUrl('openai', 'https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('appends /v1 for custom-openai when only the domain is provided', () => {
    expect(normalizeProviderBaseUrl('custom-openai', 'https://api.example.com')).toBe(
      'https://api.example.com/v1',
    );
    expect(normalizeProviderBaseUrl('custom-openai', 'https://api.example.com/')).toBe(
      'https://api.example.com/v1',
    );
    expect(normalizeProviderBaseUrl('custom-openai', 'http://127.0.0.1:9000')).toBe(
      'http://127.0.0.1:9000/v1',
    );
  });

  it('appends /v1 for custom-openai unless the path already ends with /v1', () => {
    // 已以 /v1 结尾：保持不变（含去尾部斜杠）
    expect(normalizeProviderBaseUrl('custom-openai', 'https://example.com/api/v1')).toBe(
      'https://example.com/api/v1',
    );
    expect(normalizeProviderBaseUrl('custom-openai', 'https://example.com/api/v1/')).toBe(
      'https://example.com/api/v1',
    );
    // 缺少 /v1 的子路径（含 token 路径）：补全，确保与拉取模型路径一致
    expect(normalizeProviderBaseUrl('custom-openai', 'https://example.com/openai')).toBe(
      'https://example.com/openai/v1',
    );
    expect(normalizeProviderBaseUrl('custom-openai', 'https://node.example.com/token/abc')).toBe(
      'https://node.example.com/token/abc/v1',
    );
  });
});
