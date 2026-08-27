import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAuthorNoteGenerationContext,
} from './author-note-batch-generation.js';
import {
  cancelAuthorNoteBatch,
  clearAuthorNoteBatch,
  hasRunningAuthorNoteBatch,
  registerAuthorNoteBatch,
} from './author-note-batch-job-state.js';

describe('author note batch support', () => {
  beforeEach(() => {
    clearAuthorNoteBatch('novel-a');
  });

  it('tracks running jobs by novel id', () => {
    const controller = new AbortController();

    registerAuthorNoteBatch('novel-a', controller);
    expect(hasRunningAuthorNoteBatch('novel-a')).toBe(true);
    expect(cancelAuthorNoteBatch('novel-a')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(hasRunningAuthorNoteBatch('novel-a')).toBe(false);
  });

  it('builds generation context with outline, reader hint, and note history', () => {
    const { context, existingNotes } = buildAuthorNoteGenerationContext({
      novelId: 'novel-a',
      novel: {
        title: '长夜余烬',
        genre: '玄幻',
        synopsis: '主角在废土中求生。',
      },
      chapter: {
        chapterNumber: 5,
        content: '甲'.repeat(2100),
        authorNotes: ['旧注释'],
        agentComments: [
          {
            agentRole: 'reader',
            comment: '这一章转折不错，但情绪还可以再压深一点。',
          },
        ],
      },
      item: {
        chapterNumber: 5,
        keyType: 'climax',
      },
      outlineChapters: [
        {
          chapterNumber: 6,
          summary: '下一章主角将直面旧日仇敌。',
        },
      ],
      userDirection: '强调宿命感',
      maxWords: 300,
    });

    expect(existingNotes).toEqual(['旧注释']);
    expect(context.inputText?.endsWith('…')).toBe(true);
    expect(context.outlineContext).toBe('下一章主角将直面旧日仇敌。');
    expect(context.userDirection).toContain('强调宿命感');
    expect(context.userDirection).toContain('字数要求：约 300 字');
    expect(context.userDirection).toContain('参考读者评价：这一章转折不错');
    expect(context.existingAuthorNotes).toEqual(['旧注释']);
  });
});
