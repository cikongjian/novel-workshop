import { describe, expect, it } from 'vitest';
import type { AgentContext } from './types.js';
import { OutlineAgent } from './outline.js';

class ExposedOutlineAgent extends OutlineAgent {
  build(context: AgentContext): string {
    return this.buildUserMessage(context);
  }
}

describe('outline world context', () => {
  it('injects canon constraints before scene planning', () => {
    const prompt = new ExposedOutlineAgent().build({
      novelId: 'novel-1',
      novelTitle: '测试小说',
      novelSynopsis: '测试简介',
      genre: 'fantasy',
      chapterNumber: 3,
      worldContext: '宵禁规则：日落后城门必须关闭；违规者会被巡夜司扣押。',
    });

    expect(prompt).toContain('世界正史与行动边界');
    expect(prompt).toContain('日落后城门必须关闭');
    expect(prompt).toContain('不得为了制造冲突而临时废除');
  });
});
