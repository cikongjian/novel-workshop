import { describe, expect, it } from 'vitest';
import {
  inspectEditorTitleCandidate,
  resolveAdoptableChapterTitle,
} from './chapter-title-background-service.js';

describe('inspectEditorTitleCandidate', () => {
  it('accepts complete editor titles', () => {
    expect(inspectEditorTitleCandidate('黑风崖的青鳞蟒', []).accepted).toBe(true);
  });

  it('routes incomplete editor titles to the dedicated title generator', () => {
    const repeated = inspectEditorTitleCandidate('灶台前的反击前', []);
    const incomplete = inspectEditorTitleCandidate('周元在黑风崖灵药区开张卖', []);

    expect(repeated.accepted).toBe(false);
    expect(repeated.reasons).toContain('标题尾词重复');
    expect(incomplete.accepted).toBe(false);
    expect(incomplete.reasons).toContain('标题疑似残句');
  });
});

describe('resolveAdoptableChapterTitle', () => {
  it('uses a deterministic content fallback when the generated title is mechanical', () => {
    const resolution = resolveAdoptableChapterTitle({
      currentTitle: '资源复审会议上',
      candidateTitle: '全栈接口覆盖测试结果出炉',
      candidateSource: 'title-generator',
      auditInput: {
        genre: 'modern',
        constitutionTags: ['female-career'],
        fullContent: '客户当场交出签字权。林知把验收单推回桌面，要求项目负责人公开确认责任边界。',
      },
      outline: '# 全栈接口覆盖测试结果出炉',
      content: '客户当场交出签字权。林知把验收单推回桌面，要求项目负责人公开确认责任边界。',
      chapterNumber: 9,
    });

    expect(resolution.decision.accept).toBe(true);
    expect(resolution.source).toBe('fallback');
    expect(resolution.title).toBe('客户当场交出签字权');
  });
});
