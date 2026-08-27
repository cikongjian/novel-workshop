import { describe, expect, it, vi } from 'vitest';
import type { NovelAgent } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import { createAgentExecutor } from './agent-executor.js';

const model = {
  provider: 'custom-openai',
  model: 'slow-model',
  chat: vi.fn(),
  chatStream: vi.fn(),
} as unknown as ModelClient;

describe('createAgentExecutor heartbeat', () => {
  it('reports lifecycle heartbeats even when the agent does not stream chunks', async () => {
    const agent: NovelAgent = {
      role: 'writing-assistant',
      name: 'test',
      description: 'test',
      execute: vi.fn(async () => ({
        agentRole: 'writing-assistant' as const,
        content: '有效输出',
        timestamp: new Date().toISOString(),
      })),
    };
    const heartbeats: string[] = [];
    const executor = createAgentExecutor(new Map([['writing-assistant', agent]]), {
      novelId: 'novel-1',
      chapterNumber: 3,
      runId: 'run-1',
      model,
      onHeartbeat: stage => heartbeats.push(stage),
    });

    await executor.runAgent('writing-assistant', {
      novelId: 'novel-1',
      genre: 'modern',
      novelTitle: '测试小说',
      novelSynopsis: '测试简介',
    });

    expect(heartbeats).toEqual(expect.arrayContaining([
      'agent:writing-assistant:start',
      'agent:writing-assistant:attempt:1',
      'agent:writing-assistant:response',
      'agent:writing-assistant:complete',
    ]));
  });
});
