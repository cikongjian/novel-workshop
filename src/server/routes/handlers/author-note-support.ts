import type { AgentContext, AgentEvent, AgentRole, NovelAgent } from '../../../agents/types.js';
import type { ModelClient } from '../../../models/types.js';
import type { Chapter } from '../../../novel/types.js';
import type { GenerateDeps } from './types.js';
import { sanitizeAuthorNote } from '../../../utils/author-note-sanitizer.js';
export { sanitizeAuthorNote } from '../../../utils/author-note-sanitizer.js';

/** 发送给 Agent 的正文截断上限 */
const CHAPTER_INPUT_MAX_CHARS = 2000;
/** 读者反馈截断上限 */
const READER_FEEDBACK_MAX_CHARS = 500;
/** 下章大纲提示截断上限 */
const NEXT_OUTLINE_MAX_CHARS = 200;
/** 每章最多保留的作者有话说条数 */
const MAX_AUTHOR_NOTES = 20;

const AUTHOR_NOTE_AGENT_ROLE: Extract<AgentRole, 'author-note-writer'> = 'author-note-writer';
function truncateText(input: string, maxChars: number): string {
  return input.length > maxChars ? `${input.slice(0, maxChars)}…` : input;
}

export function buildAuthorNoteContext(params: {
  novel: {
    id: string;
    genre?: string;
    title: string;
    synopsis?: string;
  };
  chapter: Pick<Chapter, 'content' | 'agentComments' | 'authorNotes'>;
  chapterNumber: number;
  nextOutlineSummary?: string;
  userDirection?: string;
}): AgentContext {
  const readerComment = params.chapter.agentComments?.find((comment) => comment.agentRole === 'reader');
  const readerHint = readerComment
    ? `参考读者评价：${truncateText(readerComment.comment, READER_FEEDBACK_MAX_CHARS)}`
    : '';

  return {
    novelId: params.novel.id,
    genre: params.novel.genre || '',
    novelTitle: params.novel.title,
    novelSynopsis: params.novel.synopsis || '',
    chapterNumber: params.chapterNumber,
    inputText: truncateText(params.chapter.content, CHAPTER_INPUT_MAX_CHARS),
    outlineContext: params.nextOutlineSummary
      ? truncateText(params.nextOutlineSummary, NEXT_OUTLINE_MAX_CHARS)
      : undefined,
    userDirection: [readerHint, params.userDirection?.trim() ?? ''].filter(Boolean).join('\n') || undefined,
    existingAuthorNotes: (params.chapter.authorNotes?.length ?? 0) > 0 ? params.chapter.authorNotes : undefined,
  };
}

function buildAuthorNoteEvent(params: {
  type: AgentEvent['type'];
  novelId: string;
  chapterNumber: number;
  data: string;
}): AgentEvent {
  return {
    type: params.type,
    agentRole: AUTHOR_NOTE_AGENT_ROLE,
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    data: params.data,
    timestamp: new Date().toISOString(),
  };
}

export async function generateAuthorNote(params: {
  agent: NovelAgent;
  client: ModelClient;
  context: AgentContext;
  novelId: string;
  chapterNumber: number;
  broadcast: GenerateDeps['broadcast'];
}): Promise<string> {
  params.broadcast(buildAuthorNoteEvent({
    type: 'agent:start',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    data: '',
  }));

  const output = await params.agent.execute(params.context, params.client, (chunk) => {
    params.broadcast(buildAuthorNoteEvent({
      type: 'agent:chunk',
      novelId: params.novelId,
      chapterNumber: params.chapterNumber,
      data: chunk,
    }));
  });

  const authorNote = sanitizeAuthorNote(output.content);
  params.broadcast(buildAuthorNoteEvent({
    type: 'agent:complete',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    data: authorNote,
  }));

  return authorNote;
}

export function appendAuthorNote(existingNotes: string[] | undefined, authorNote: string): string[] {
  return [...(existingNotes ?? []), authorNote].slice(-MAX_AUTHOR_NOTES);
}

export function resolveAuthorNoteDeletion(params: {
  existingNotes: string[] | undefined;
  index?: number;
}): { updatedNotes: string[]; error?: string } {
  const existingNotes = params.existingNotes ?? [];
  if (params.index == null) {
    return { updatedNotes: [] };
  }
  if (Number.isNaN(params.index) || params.index < 0 || params.index >= existingNotes.length) {
    return {
      updatedNotes: existingNotes,
      error: '索引越界',
    };
  }
  return {
    updatedNotes: existingNotes.filter((_, idx) => idx !== params.index),
  };
}

export async function persistAuthorNote(params: {
  novelManager: GenerateDeps['novelManager'];
  novelId: string;
  chapter: Chapter;
  authorNote: string;
}): Promise<string[]> {
  const updatedNotes = appendAuthorNote(params.chapter.authorNotes, params.authorNote);
  await params.novelManager.saveChapter(params.novelId, {
    ...params.chapter,
    authorNotes: updatedNotes,
    updatedAt: new Date().toISOString(),
  });
  return updatedNotes;
}

export async function persistAuthorNoteDeletion(params: {
  novelManager: GenerateDeps['novelManager'];
  novelId: string;
  chapter: Chapter;
  updatedNotes: string[];
}): Promise<void> {
  await params.novelManager.saveChapter(params.novelId, {
    ...params.chapter,
    authorNotes: params.updatedNotes,
    updatedAt: new Date().toISOString(),
  });
}
