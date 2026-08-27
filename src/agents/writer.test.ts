import { describe, expect, it } from 'vitest';

import { WriterAgent } from './writer.js';
import type { AgentContext } from './types.js';

class TestableWriterAgent extends WriterAgent {
  async loadPromptFor(context: AgentContext): Promise<string> {
    this.getModelOptions(context);
    return this.loadPromptTemplate();
  }

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
    constitutionTags: [],
    ...overrides,
  };
}

describe('WriterAgent prompt selection', () => {
  it('uses the sweet writer prompt as the romance fallback when no constitution tag is set', async () => {
    const agent = new TestableWriterAgent();

    const prompt = await agent.loadPromptFor(createContext({
      genre: 'romance',
      constitutionTags: [],
    }));

    expect(prompt).toContain('你是一位专写甜宠文的资深作者');
  });

  it('keeps the career writer prompt when romance explicitly carries female-career', async () => {
    const agent = new TestableWriterAgent();

    const prompt = await agent.loadPromptFor(createContext({
      genre: 'romance',
      constitutionTags: ['female-career'],
    }));

    expect(prompt).toContain('你是一位专写职场/大女主/事业线小说的资深作者');
  });

  it('delivers the reader contract directly to the writer prompt', () => {
    const agent = new TestableWriterAgent();
    const message = agent.build(createContext({
      readerDeliveryContract: '读者交付合同：必须有当面冲突和公开表态。',
    }));

    expect(message).toContain('读者交付合同：必须有当面冲突和公开表态。');
  });
});
