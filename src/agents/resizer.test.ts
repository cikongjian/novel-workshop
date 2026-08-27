import { describe, expect, it } from 'vitest';
import type { AgentContext } from './types.js';
import { ResizerAgent } from './resizer.js';

class TestResizerAgent extends ResizerAgent {
  build(context: AgentContext): string {
    return this.buildUserMessage(context);
  }
}

describe('ResizerAgent', () => {
  it('includes the source text and hard no-rewrite constraints', () => {
    const agent = new TestResizerAgent();
    const message = agent.build({
      novelId: 'novel-1',
      novelTitle: '钢铁雄城：我用机枪守国门',
      genre: '历史脑洞',
      novelSynopsis: '陈宇流放北荒，用科技树求生守城。',
      inputText: '陈宇站在北荒城头，盯着残破的土墙和流民。',
      resizeMode: 'compress',
      originalWordCount: 4200,
      maxWordCount: 4000,
    });

    expect(message).toContain('当前章节原文');
    expect(message).toContain('陈宇站在北荒城头');
    expect(message).toContain('不得另起炉灶生成新故事');
    expect(message).toContain('若原文与标题存在张力，优先保留原文事实');
  });

  it('rejects resize requests without source text', () => {
    const agent = new TestResizerAgent();

    expect(() => agent.build({
      novelId: 'novel-1',
      novelTitle: '测试书名',
      genre: '测试',
      novelSynopsis: '测试简介',
      resizeMode: 'compress',
      maxWordCount: 3000,
    })).toThrow('resizer requires inputText');
  });
});
