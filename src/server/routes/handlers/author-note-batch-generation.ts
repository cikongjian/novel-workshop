import { randomUUID } from 'node:crypto';
import type { AgentContext, AgentEvent } from '../../../agents/types.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';
import type { GenerateDeps } from './types.js';
import type { AuthorNoteBatchTarget } from './author-note-batch-types.js';
import {
  clearAuthorNoteBatch,
  registerAuthorNoteBatch,
} from './author-note-batch-job-state.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

const CHAPTER_INPUT_MAX_CHARS = 2000;
const READER_FEEDBACK_MAX_CHARS = 500;
const NEXT_OUTLINE_MAX_CHARS = 200;
const MAX_AUTHOR_NOTES = 20;

type AuthorNoteBatchAgent = NonNullable<NonNullable<GenerateDeps['agents']> extends Map<string, infer T> ? T : never>;

type AuthorNoteSourceChapter = {
  chapterNumber: number;
  content: string;
  authorNotes?: string[];
  agentComments?: Array<{ agentRole: string; comment: string }>;
};

type OutlineChapterSummary = {
  chapterNumber: number;
  summary?: string;
};

export function buildAuthorNoteGenerationContext(params: {
  novelId: string;
  novel: { title: string; genre?: string; synopsis?: string };
  chapter: AuthorNoteSourceChapter;
  item: AuthorNoteBatchTarget;
  outlineChapters: OutlineChapterSummary[];
  userDirection: string;
  maxWords?: number;
}): {
  context: AgentContext;
  existingNotes: string[];
} {
  const { chapter, item, maxWords, novel, novelId, outlineChapters, userDirection } = params;
  const truncatedContent = chapter.content.length > CHAPTER_INPUT_MAX_CHARS
    ? `${chapter.content.slice(0, CHAPTER_INPUT_MAX_CHARS)}…`
    : chapter.content;

  const readerComment = chapter.agentComments?.find(comment => comment.agentRole === 'reader');
  const readerHint = readerComment
    ? `参考读者评价：${readerComment.comment.slice(0, READER_FEEDBACK_MAX_CHARS)}`
    : '';

  const nextOutline = outlineChapters.find(outline => outline.chapterNumber === item.chapterNumber + 1);
  const nextChapterHint = nextOutline?.summary
    ? nextOutline.summary.slice(0, NEXT_OUTLINE_MAX_CHARS)
    : '';

  const directionParts: string[] = [];
  if (userDirection) directionParts.push(userDirection);
  if (maxWords) directionParts.push(`字数要求：约 ${maxWords} 字`);
  if (readerHint) directionParts.push(readerHint);
  const combinedDirection = directionParts.join('\n');
  const existingNotes = chapter.authorNotes ?? [];

  return {
    context: {
      novelId,
      genre: novel.genre || '',
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis || '',
      chapterNumber: item.chapterNumber,
      inputText: truncatedContent,
      outlineContext: nextChapterHint || undefined,
      chapterKeyType: item.keyType,
      userDirection: combinedDirection || undefined,
      existingAuthorNotes: existingNotes.length > 0 ? existingNotes : undefined,
    },
    existingNotes,
  };
}

async function loadOutlineChapters(
  deps: GenerateDeps,
  novelId: string,
): Promise<OutlineChapterSummary[]> {
  try {
    const outline = await deps.novelManager.getOutline(novelId);
    return outline.chapters ?? [];
  } catch {
    return [];
  }
}

function emitAuthorNoteAgentEvent(
  deps: GenerateDeps,
  params: {
    type: 'agent:start' | 'agent:chunk' | 'agent:complete';
    novelId: string;
    chapterNumber: number;
    data: string;
  },
): void {
  deps.broadcast({
    type: params.type,
    agentRole: 'author-note-writer',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    data: params.data,
    timestamp: new Date().toISOString(),
  } as AgentEvent);
}

async function processAuthorNoteBatchItem(params: {
  deps: GenerateDeps;
  novelId: string;
  novel: { title: string; genre?: string; synopsis?: string };
  item: AuthorNoteBatchTarget;
  outlineChapters: OutlineChapterSummary[];
  userDirection: string;
  maxWords?: number;
  agent: AuthorNoteBatchAgent;
  activeModelClient: GenerateDeps['modelClient'];
}): Promise<boolean> {
  const { activeModelClient, agent, deps, item, maxWords, novel, novelId, outlineChapters, userDirection } = params;
  const chapter = await deps.novelManager.getChapter(novelId, item.chapterNumber);
  if (!chapter?.content) {
    return false;
  }

  const { context, existingNotes } = buildAuthorNoteGenerationContext({
    novelId,
    novel,
    chapter,
    item,
    outlineChapters,
    userDirection,
    maxWords,
  });

  emitAuthorNoteAgentEvent(deps, {
    type: 'agent:start',
    novelId,
    chapterNumber: item.chapterNumber,
    data: '',
  });

  const output = await agent.execute(context, activeModelClient, chunk => {
    emitAuthorNoteAgentEvent(deps, {
      type: 'agent:chunk',
      novelId,
      chapterNumber: item.chapterNumber,
      data: chunk,
    });
  });

  const authorNote = output.content.trim();
  emitAuthorNoteAgentEvent(deps, {
    type: 'agent:complete',
    novelId,
    chapterNumber: item.chapterNumber,
    data: authorNote,
  });

  const updatedNotes = [...existingNotes, authorNote].slice(-MAX_AUTHOR_NOTES);
  await deps.novelManager.saveChapter(novelId, {
    ...chapter,
    authorNotes: updatedNotes,
    updatedAt: new Date().toISOString(),
  });

  return true;
}

export async function startAuthorNoteBatchGeneration(
  deps: GenerateDeps,
  params: {
    novelId: string;
    novel: { title: string; genre?: string; synopsis?: string };
    toGenerate: AuthorNoteBatchTarget[];
    userDirection: string;
    maxWords?: number;
    agent: AuthorNoteBatchAgent;
    activeModelClient: GenerateDeps['modelClient'];
    usageContext?: ReturnType<typeof getAiUsageContext>;
  },
): Promise<{ batchId: string; total: number }> {
  const { novelId, novel, toGenerate, userDirection, maxWords, agent, activeModelClient, usageContext } = params;
  const batchId = randomUUID();
  const controller = new AbortController();
  registerAuthorNoteBatch(novelId, controller);

  deps.broadcastJson?.({
    type: 'batch-author-notes',
    event: 'start',
    payload: { batchId, novelId, total: toGenerate.length },
  });

  let generated = 0;
  let failed = 0;

  const run = async () => {
    const outlineChapters = await loadOutlineChapters(deps, novelId);

    try {
      for (let i = 0; i < toGenerate.length; i += 1) {
        if (controller.signal.aborted) break;

        const item = toGenerate[i];
        deps.broadcastJson?.({
          type: 'batch-author-notes',
          event: 'progress',
          payload: {
            batchId,
            novelId,
            current: i + 1,
            total: toGenerate.length,
            chapterNumber: item.chapterNumber,
          },
        });

        try {
          const completed = await processAuthorNoteBatchItem({
            deps,
            novelId,
            novel,
            item,
            outlineChapters,
            userDirection,
            maxWords,
            agent,
            activeModelClient,
          });
          if (!completed) {
            failed += 1;
            continue;
          }

          generated += 1;
          deps.broadcastJson?.({
            type: 'batch-author-notes',
            event: 'item-complete',
            payload: {
              batchId,
              novelId,
              chapterNumber: item.chapterNumber,
              current: i + 1,
              total: toGenerate.length,
            },
          });
        } catch (err) {
          failed += 1;
          console.error(
            `[batch-author-notes] 第${item.chapterNumber}章生成失败:`,
            safeErrorMessage(err, String(err)),
          );
        }
      }
    } finally {
      clearAuthorNoteBatch(novelId);
      deps.broadcastJson?.({
        type: 'batch-author-notes',
        event: 'complete',
        payload: { batchId, novelId, generated, failed },
      });
    }
  };

  void runWithAiUsageContextAsync(
    usageContext ?? {
      scope: 'http',
      operationKey: 'generate.author-note-batch',
      operationLabel: '批量作者有话说',
      operationRegistered: true,
      novelId,
    },
    run,
  );

  return { batchId, total: toGenerate.length };
}
