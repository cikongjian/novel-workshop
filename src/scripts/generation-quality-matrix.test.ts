import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildApiClient,
  collectPublicMetaLeaks,
  collectRolePlaceholderLeaks,
  collectTitleQualityReasons,
  getTargetGenerationFailure,
  isChapterGenerationReady,
} from './generation-quality-matrix.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generation-quality-matrix leak scanners', () => {
  it('reports chapter-number callbacks as public meta leaks', () => {
    expect(collectPublicMetaLeaks('平板翻开第2章拍的照片。')).toContain('第2章');
    expect(collectPublicMetaLeaks('《管路维修手册》第2章贴在舱门旁。')).toEqual([]);
  });

  it('reports leaked character exit markers as public meta', () => {
    expect(collectPublicMetaLeaks('雾瘴卷过来。#(退场:周元)')).toContain('#(退场:周元)');
  });

  it('does not flag normal protagonist possessive narration', () => {
    const leaks = collectRolePlaceholderLeaks('这一章继续推进主角的军政路线，城门换防令压到案上。');

    expect(leaks).toEqual([]);
  });

  it('flags role-label placeholders that read like unfinished generated text', () => {
    const leaks = collectRolePlaceholderLeaks('主角说：“这章必须先拿下城门。”\n女主道：不能再等。');

    expect(leaks).toContain('主角说');
    expect(leaks).toContain('女主道');
  });

  it('reports role-slot placeholders in chapter titles', () => {
    expect(collectTitleQualityReasons('主角在项目成果被下属篡改')).toContain('标题含角色占位词');
    expect(collectTitleQualityReasons('林念夺回项目签字权')).toEqual([]);
  });

  it('uses the captcha-free sync session endpoint for remote token refresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ accessToken: 'remote-token' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const client = await buildApiClient({
      apiBase: 'https://example.com/api',
      username: 'admin',
      password: 'secret',
    } as never);

    expect(client.headers.authorization).toBe('Bearer remote-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/sync/session',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails polling immediately when the target chapter has ended in failure', () => {
    expect(getTargetGenerationFailure({
      isGenerating: false,
      lastFailedChapter: 9,
      lastFailureMessage: '章节生成超时',
    }, 9)).toBe('章节生成超时');
  });

  it('ignores an old failure marker while the target chapter is being retried', () => {
    expect(getTargetGenerationFailure({
      isGenerating: true,
      lastFailedChapter: 9,
      lastFailureMessage: '上一次生成超时',
    }, 9)).toBeNull();
  });

  it('does not treat a save-first draft as a completed chapter', () => {
    expect(isChapterGenerationReady({
      content: '已保存的草稿正文',
      status: 'edited',
      diagnostics: {
        generationLifecycle: {
          mode: 'observe',
          phase: 'draft',
          saveFirstMode: true,
          chapterStatus: 'edited',
          warnings: ['save-first draft persisted; final generation result is not saved yet'],
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
        updatedAt: '2026-07-13T00:00:00.000Z',
      },
    } as never)).toBe(false);
  });

  it('accepts reviewed final-phase and finalized chapters', () => {
    expect(isChapterGenerationReady({
      content: '完整正文',
      status: 'reviewed',
      diagnostics: {
        generationLifecycle: {
          mode: 'observe',
          phase: 'final',
          chapterStatus: 'reviewed',
          warnings: [],
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
        updatedAt: '2026-07-13T00:00:00.000Z',
      },
    } as never)).toBe(true);
    expect(isChapterGenerationReady({
      content: '历史定稿正文',
      status: 'finalized',
    } as never)).toBe(true);
  });
});
