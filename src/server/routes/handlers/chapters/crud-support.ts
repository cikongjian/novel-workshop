import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { Chapter } from '../../../../novel/types.js';
import type { StoryStateManager } from '../../../../novel/story-state-manager.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { VoteService } from '../../../../services/vote-service.js';
import { extractAndCreateMissingSpeakers } from '../../../../novel/speaker-extractor.js';
import { NovelPaths } from '../../../../novel/novel-paths.js';
import { cleanupDeletedChapterArtifacts } from '../../../../novel/chapter-derived-cleanup.js';

type ChapterStatus = Chapter['status'];

export type ChapterUpdateInput = {
  content?: string;
  title?: string;
  status?: ChapterStatus;
};

export function parseChapterNumberParam(rawValue: string): {
  chapterNumber?: number;
  error?: string;
} {
  const chapterNumber = Number.parseInt(rawValue, 10);
  if (Number.isNaN(chapterNumber) || chapterNumber < 1) {
    return { error: '章节编号必须为正整数' };
  }
  return { chapterNumber };
}

export function isNotFoundLikeError(message: string): boolean {
  return message.includes('不存在') || message.includes('not found');
}

export async function prepareChapterForSave(params: {
  novelManager: Pick<NovelManager, 'getChapter' | 'archiveChapterVersion'>;
  novelId: string;
  chapterNumber: number;
  data: ChapterUpdateInput;
  now?: string;
}): Promise<{
  chapter: Chapter;
  contentChanged: boolean;
  titleChanged: boolean;
}> {
  const existingChapter = await params.novelManager.getChapter(params.novelId, params.chapterNumber);
  const timestamp = params.now ?? new Date().toISOString();

  if (!existingChapter) {
    return {
      chapter: {
        novelId: params.novelId,
        chapterNumber: params.chapterNumber,
        title: params.data.title ?? '',
        summary: '',
        content: params.data.content ?? '',
        wordCount: params.data.content?.length ?? 0,
        status: params.data.status ?? 'outlined',
        agentComments: [],
        revisionCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      contentChanged: false,
      titleChanged: false,
    };
  }

  const contentChanged = params.data.content !== undefined && params.data.content !== existingChapter.content;
  const titleChanged = params.data.title !== undefined && params.data.title !== existingChapter.title;

  if (contentChanged) {
    await params.novelManager.archiveChapterVersion(params.novelId, params.chapterNumber, 'manual-save');
  }

  const chapter: Chapter = {
    ...existingChapter,
    content: params.data.content ?? existingChapter.content,
    wordCount: params.data.content !== undefined ? params.data.content.length : existingChapter.wordCount,
    title: params.data.title ?? existingChapter.title,
    status: params.data.status ?? (contentChanged ? 'drafted' : existingChapter.status),
    updatedAt: timestamp,
  };

  return {
    chapter,
    contentChanged,
    titleChanged,
  };
}

export function triggerMissingSpeakerIndexing(params: {
  novelManager: NovelManager;
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
}): void {
  if (!params.chapterContent) {
    return;
  }
  extractAndCreateMissingSpeakers(
    params.novelManager,
    params.novelId,
    params.chapterNumber,
    params.chapterContent,
  ).catch(() => { /* 不影响主流程 */ });
}

export async function syncPublishedChapterVisibility(params: {
  bookStoreManager?: Pick<BookStoreManager, 'hideChapterIfModified' | 'forceHideChapter'>;
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  contentChanged: boolean;
  titleChanged: boolean;
  hashContent: (content: string) => string;
}): Promise<void> {
  if ((!params.contentChanged && !params.titleChanged) || !params.bookStoreManager) {
    return;
  }

  if (params.contentChanged && params.chapterContent) {
    await params.bookStoreManager.hideChapterIfModified(
      params.novelId,
      params.chapterNumber,
      params.hashContent(params.chapterContent),
    );
    return;
  }

  if (params.titleChanged) {
    await params.bookStoreManager.forceHideChapter(params.novelId, params.chapterNumber);
  }
}

export async function removeDeletedChapterArtifacts(params: {
  novelManager: Pick<NovelManager, 'getDataDir'>;
  storyStateManager?: Pick<StoryStateManager, 'removeChapterArtifacts'>;
  novelMemory?: Pick<NovelMemory,
  'removeEntity'
  | 'clearCategory'
  | 'clearRetrievalLogs'>;
  voteService?: Pick<VoteService, 'deleteByChapter'>;
  novelId: string;
  chapterNumber: number;
}): Promise<void> {
  const paths = new NovelPaths(params.novelManager.getDataDir());
  await cleanupDeletedChapterArtifacts(paths, params.novelId, params.chapterNumber);

  await Promise.all([
    params.storyStateManager?.removeChapterArtifacts(params.novelId, params.chapterNumber),
    (async () => {
      if (!params.novelMemory) return;
      const chapterEntityId = params.chapterNumber.toString();
      await Promise.all([
        params.novelMemory.removeEntity(params.novelId, 'chapter', chapterEntityId),
        params.novelMemory.removeEntity(params.novelId, 'fact', chapterEntityId),
        params.novelMemory.removeEntity(params.novelId, 'digest', chapterEntityId),
        params.novelMemory.clearCategory(params.novelId, 'arc'),
        params.novelMemory.clearCategory(params.novelId, 'thread'),
        params.novelMemory.clearCategory(params.novelId, 'character_state'),
      ]);
      params.novelMemory.clearRetrievalLogs(params.novelId);
    })(),
    (async () => {
      if (!params.voteService) return;
      try {
        params.voteService.deleteByChapter(params.novelId, params.chapterNumber.toString());
      } catch {
        // 投票数据清理失败不影响主流程
      }
    })(),
  ]);
}
