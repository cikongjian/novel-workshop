import { describe, expect, it } from 'vitest';

import { buildCastSessionPrompt } from './propose-route-support.js';

describe('cast session propose route support', () => {
  it('builds a prompt with conversation, slots, and dedupe context', () => {
    const prompt = buildCastSessionPrompt({
      conversation: [
        { role: 'user', content: '我要一个强势主角和反派。' },
        { role: 'assistant', content: '明白，我会补充关键盟友。' },
      ],
      focus: 'roles-and-power',
      maxCharacters: 4,
      novel: {
        title: '九霄行',
        genre: '玄幻',
        synopsis: '少年卷入天命争锋',
      },
      existingNames: ['林昼'],
      pendingNames: ['顾遥'],
      slots: [
        { key: '主角', role: 'protagonist', required: true, expectedCount: 1 },
        { key: '核心反派', role: 'antagonist', required: true, expectedCount: 1 },
      ],
    });

    expect(prompt).toContain('小说标题: 九霄行');
    expect(prompt).toContain('用户: 我要一个强势主角和反派。');
    expect(prompt).toContain('AI: 明白，我会补充关键盟友。');
    expect(prompt).toContain('已有角色(仅供避重): 林昼');
    expect(prompt).toContain('候选池待确认角色(仅供参考): 顾遥');
    expect(prompt).toContain('- 主角 | role=protagonist | required=yes | expectedCount=1');
  });
});
