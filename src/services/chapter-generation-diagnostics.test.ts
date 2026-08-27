import { describe, expect, it } from 'vitest';
import {
  buildAgentTrace,
  buildTitleTrace,
  mergeChapterDiagnostics,
} from './chapter-generation-diagnostics.js';

describe('chapter generation diagnostics', () => {
  it('builds lightweight agent trace from output metadata', () => {
    const timestamp = new Date().toISOString();
    const trace = buildAgentTrace([
      {
        agentRole: 'writer',
        content: '正文',
        timestamp,
        metadata: {
          inputChars: 1200,
          systemPromptChars: 3000,
          outputChars: 800,
          inputTokens: 400,
          outputTokens: 260,
          provider: 'deepseek',
          model: 'DeepSeek-v4-flash',
          skillIds: ['opening-hook'],
          droppedByBudget: 1,
          latencyMs: 1500,
        },
      },
    ]);

    expect(trace).toEqual([
      expect.objectContaining({
        agentRole: 'writer',
        inputChars: 1200,
        systemPromptChars: 3000,
        outputChars: 800,
        inputTokens: 400,
        outputTokens: 260,
        provider: 'deepseek',
        model: 'DeepSeek-v4-flash',
        skillIds: ['opening-hook'],
        droppedByBudget: 1,
        latencyMs: 1500,
        timestamp,
      }),
    ]);
  });

  it('merges title trace without dropping existing diagnostics', () => {
    const updatedAt = new Date().toISOString();
    const existing = mergeChapterDiagnostics(undefined, {
      agentTrace: [],
    }, updatedAt);

    const titleTrace = buildTitleTrace({
      candidateTitle: '退婚书砸上门',
      adopted: true,
      currentScore: 42,
      generatedScore: 78,
      fullContent: '章节正文'.repeat(100),
      recentTitles: ['城门口的羞辱'],
      provider: 'deepseek',
      model: 'DeepSeek-v4-flash',
      source: 'fallback',
      updatedAt,
    });

    const merged = mergeChapterDiagnostics(existing, { titleTrace }, updatedAt);

    expect(merged?.agentTrace).toEqual([]);
    expect(merged?.titleTrace).toEqual(expect.objectContaining({
      candidateTitle: '退婚书砸上门',
      fullContentChars: 400,
      recentTitles: ['城门口的羞辱'],
      generatedScore: 78,
      source: 'fallback',
    }));
  });
});
