import { describe, expect, it } from 'vitest';
import { EditorAgent } from './editor.js';
import type { AgentContext } from './types.js';

class TestableEditorAgent extends EditorAgent {
  build(context: AgentContext): string {
    return this.buildUserMessage(context);
  }
}

function createContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    novelId: 'novel-1',
    genre: 'modern',
    novelTitle: '测试小说',
    novelSynopsis: '测试简介',
    chapterNumber: 2,
    ...overrides,
  };
}

describe('EditorAgent context budget', () => {
  it('delivers the reader contract directly to the editor prompt', () => {
    const agent = new TestableEditorAgent();
    const message = agent.build(createContext({
      inputText: '初稿正文',
      readerDeliveryContract: '读者交付合同：必须有当面冲突和公开表态。',
    }));

    expect(message).toContain('读者交付合同：必须有当面冲突和公开表态。');
    expect(message).toContain('必须直接重组相关段落');
  });

  it('keeps draft and high-priority fix hints while trimming low-priority context', () => {
    const agent = new TestableEditorAgent();
    const message = agent.build(createContext({
      inputText: '初稿正文'.repeat(6000),
      worldGateFixHints: '必须修复世界观门禁',
      seriesContext: '系列上下文'.repeat(8000),
      universeContext: '宇宙上下文'.repeat(8000),
    }));

    expect(message).toContain('初稿正文');
    expect(message).toContain('必须修复世界观门禁');
    expect(message).toContain('[上下文预算]');
    expect(message).toContain('seriesContext');
    expect(message).toContain('universeContext');
  });
});
