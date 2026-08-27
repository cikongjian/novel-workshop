import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAuditClient, type AuditConfig } from './audit-client.js';
import { ContentAuditService } from './content-audit-service.js';
import type { ModelClient, ModelResponse } from '../models/types.js';

const BASE_CONFIG: AuditConfig = {
  provider: 'keyword',
  apiKey: '',
  passThreshold: 60,
  blockThreshold: 80,
};

describe('createAuditClient', () => {
  it('uses the local keyword provider for keyword/local aliases', async () => {
    const client = createAuditClient(BASE_CONFIG);
    const result = await client.auditText('这里包含色情描写');

    expect(client.providerId).toBe('keyword');
    expect(result.suggestion).toBe('block');
    expect(result.violations[0]).toMatchObject({
      type: 'porn',
      keyword: '色情',
    });
  });

  it('forces manual review for unimplemented cloud providers', async () => {
    const client = createAuditClient({ ...BASE_CONFIG, provider: 'aliyun' });
    const result = await client.auditText('任意内容');

    expect(client.providerId).toBe('aliyun');
    expect(result.suggestion).toBe('review');
    expect(result.violations[0]).toMatchObject({
      type: 'other',
      keyword: 'aliyun',
    });
    expect(result.violations[0]?.context).toContain('强制转人工复核');
  });
});

describe('ContentAuditService', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('records the active provider instead of the bootstrap fallback provider', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-audit-'));
    const service = new ContentAuditService(tempDir, BASE_CONFIG);
    service.setModelClient(createMockModelClient());

    const audit = await service.auditChapter('novel-1', '1', '普通安全文本');

    expect(audit.provider).toBe('ai');
    expect(audit.status).toBe('pass');
  });
});

function createMockModelClient(): ModelClient {
  return {
    provider: 'openai',
    model: 'mock-model',
    async chat(): Promise<ModelResponse> {
      return {
        content: '{"assessments":[]}',
        model: 'mock-model',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    },
    async chatStream(): Promise<ModelResponse> {
      return {
        content: '',
        model: 'mock-model',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    },
  };
}
