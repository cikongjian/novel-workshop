import { describe, expect, it } from 'vitest';
import {
  buildCreativeChatSystemPrompt,
  buildExpandIdeaMessages,
  buildExpandIdeaSystemPrompt,
  isChatTimeoutLikeError,
  summarizeChatMessage,
} from './chat-support.js';

describe('chat support', () => {
  it('summarizes long chat messages and recognizes timeout-like errors', () => {
    expect(summarizeChatMessage('  这 是 一段   很长的消息  ', 6)).toBe('这 是 一段...');
    expect(isChatTimeoutLikeError(new Error('Gateway Timeout'))).toBe(true);
    expect(isChatTimeoutLikeError(new Error('validation failed'))).toBe(false);
  });

  it('builds chat prompts and expand-idea messages', () => {
    const systemPrompt = buildCreativeChatSystemPrompt({
      novel: { title: '赤焰长歌', genre: '玄幻', synopsis: '宗门旧案重启' },
      characters: [{ name: '陆焰', role: '主角', personality: '冷静' }],
      worldEntries: [{ name: '赤焰宗', category: 'faction', description: '火系宗门势力' }],
    });
    expect(systemPrompt).toContain('当前关联的小说：《赤焰长歌》');
    expect(systemPrompt).toContain('陆焰（主角）');
    expect(systemPrompt).toContain('赤焰宗（faction）');

    const expandPrompt = buildExpandIdeaSystemPrompt('direction');
    expect(expandPrompt).toContain('创作方向');

    const messages = buildExpandIdeaMessages({
      systemPrompt: expandPrompt,
      novelContext: '小说：《赤焰长歌》',
      text: '让主角在雨夜回山',
    });
    expect(messages[0].content).toContain('---');
    expect(messages[1].content).toBe('让主角在雨夜回山');
  });
});
