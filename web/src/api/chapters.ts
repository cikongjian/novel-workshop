import { http, AI_TIMEOUT } from './http';
import type { Chapter, ChapterSummary, ChapterPacing } from '../types';

export type ChapterQualityTrendItem = {
  chapterNumber: number;
  title: string;
  status: Chapter['status'];
  wordCount: number;
  stylePreset: string;
  overallScore: number;
  structureScore: number;
  styleScore: number;
  emotionScore: number;
  findingsCount: number;
  passed: boolean;
  summary: string;
};

export type ChapterQualityTrendResponse = {
  novelId: string;
  items: ChapterQualityTrendItem[];
  summary: {
    count: number;
    passCount: number;
    avgOverall: number;
    avgStructure: number;
    avgStyle: number;
    avgEmotion: number;
  };
  generatedAt: string;
};

export type ChapterPageOrder = 'asc' | 'desc';

export type ChapterPageResponse = {
  items: ChapterSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type CleanQuoteUsageItem = {
  chapterNumber: number;
  title: string;
  replacements: number;
  beforeSample: string;
  afterSample: string;
  examples: Array<{
    id: string;
    before: string;
    after: string;
    quoteText?: string;
    recommended?: boolean;
  }>;
};

export type CleanQuoteUsageResponse = {
  novelId: string;
  applied: boolean;
  targetCount: number;
  totalScanned: number;
  affectedChapters: number;
  totalReplacements: number;
  truncated: boolean;
  summary: string;
  items: CleanQuoteUsageItem[];
};

export type CleanDialogueBracketUsageItem = {
  chapterNumber: number;
  title: string;
  replacements: number;
  beforeSample: string;
  afterSample: string;
  examples: Array<{
    id: string;
    before: string;
    after: string;
    tagText?: string;
    recommended?: boolean;
    patternType?: 'prefix' | 'suffix';
    lineNumber?: number;
    columnNumber?: number;
    paragraphNumber?: number;
  }>;
};

export type CleanDialogueBracketTransformMode = 'clean' | 'rewrite' | 'ai-rewrite';

export type CleanDialogueBracketUsageResponse = {
  novelId: string;
  applied: boolean;
  transformMode: CleanDialogueBracketTransformMode;
  targetCount: number;
  totalScanned: number;
  affectedChapters: number;
  totalReplacements: number;
  truncated: boolean;
  summary: string;
  items: CleanDialogueBracketUsageItem[];
};

export type ChapterVersionMeta = {
  version: number;
  title: string;
  wordCount: number;
  status: string;
  readerScore?: number;
  revisionCount: number;
  source: string;
  createdAt: string;
};

export type DiffLine = {
  type: 'equal' | 'add' | 'remove';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

export async function fetchChapters(novelId: string): Promise<ChapterSummary[]> {
  const { data } = await http.get<ChapterSummary[]>(`/novels/${novelId}/chapters`);
  return data;
}

export async function fetchChapterPage(
  novelId: string,
  params: { page: number; pageSize: number; order?: ChapterPageOrder },
): Promise<ChapterPageResponse> {
  const { data } = await http.get<ChapterPageResponse>(`/novels/${novelId}/chapters`, { params });
  return data;
}

export async function fetchChapter(
  novelId: string,
  num: number,
  options?: { signal?: AbortSignal },
): Promise<Chapter> {
  const { data } = await http.get<Chapter>(`/novels/${novelId}/chapters/${num}`, {
    signal: options?.signal,
  });
  return data;
}

export async function fetchChapterPacing(novelId: string): Promise<ChapterPacing[]> {
  const { data } = await http.get<ChapterPacing[]>(`/novels/${novelId}/chapters/pacing`);
  return data;
}

export async function fetchChapterQualityTrend(
  novelId: string,
  params?: { from?: number; to?: number; limit?: number; failedOnly?: boolean },
): Promise<ChapterQualityTrendResponse> {
  const { data } = await http.get<ChapterQualityTrendResponse>(`/novels/${novelId}/chapters/quality-trend`, { params });
  return data;
}

export async function previewCleanQuoteUsage(
  novelId: string,
  params?: {
    fromChapter?: number;
    toChapter?: number;
    chapterNumbers?: number[];
    maxPreview?: number;
  },
): Promise<CleanQuoteUsageResponse> {
  const { data } = await http.post<CleanQuoteUsageResponse>(
    `/novels/${novelId}/chapters/clean-quote-usage-preview`,
    params ?? {},
  );
  return data;
}

export async function applyCleanQuoteUsage(
  novelId: string,
  params?: {
    fromChapter?: number;
    toChapter?: number;
    chapterNumbers?: number[];
    selectedEdits?: Array<{
      chapterNumber: number;
      editIds: string[];
    }>;
    rejectedQuoteTexts?: string[];
    maxPreview?: number;
  },
): Promise<CleanQuoteUsageResponse> {
  const { data } = await http.post<CleanQuoteUsageResponse>(
    `/novels/${novelId}/chapters/apply-clean-quote-usage`,
    params ?? {},
  );
  return data;
}

export async function previewCleanDialogueBracketUsage(
  novelId: string,
  params?: {
    fromChapter?: number;
    toChapter?: number;
    chapterNumbers?: number[];
    maxPreview?: number;
    transformMode?: CleanDialogueBracketTransformMode;
  },
): Promise<CleanDialogueBracketUsageResponse> {
  const { data } = await http.post<CleanDialogueBracketUsageResponse>(
    `/novels/${novelId}/chapters/clean-dialogue-bracket-preview`,
    params ?? {},
  );
  return data;
}

export async function applyCleanDialogueBracketUsage(
  novelId: string,
  params: {
    fromChapter?: number;
    toChapter?: number;
    chapterNumbers?: number[];
    selectedEdits: Array<{
      chapterNumber: number;
      editIds: string[];
    }>;
    maxPreview?: number;
    transformMode?: CleanDialogueBracketTransformMode;
  },
): Promise<CleanDialogueBracketUsageResponse> {
  const { data } = await http.post<CleanDialogueBracketUsageResponse>(
    `/novels/${novelId}/chapters/apply-clean-dialogue-bracket`,
    params,
    { timeout: AI_TIMEOUT },
  );
  return data;
}

export async function updateChapter(
  novelId: string,
  num: number,
  params: { content?: string; title?: string; status?: string },
): Promise<Chapter> {
  const { data } = await http.put<Chapter>(`/novels/${novelId}/chapters/${num}`, params);
  return data;
}

export async function deleteChapter(novelId: string, num: number): Promise<void> {
  await http.delete(`/novels/${novelId}/chapters/${num}`);
}

export async function swapChapters(
  novelId: string,
  chapterA: number,
  chapterB: number,
): Promise<Chapter[]> {
  const { data } = await http.post<Chapter[]>(`/novels/${novelId}/chapters/swap`, {
    chapterA,
    chapterB,
  });
  return data;
}

export async function backfillChapterTitles(
  novelId: string,
  params?: { force?: boolean; fromChapter?: number; toChapter?: number },
): Promise<{ updated: number; total: number; results: Array<{ chapterNumber: number; title: string; success: boolean }>; message: string }> {
  const { data } = await http.post(`/novels/${novelId}/chapters/backfill-titles`, params || {}, { timeout: AI_TIMEOUT });
  return data;
}

export async function generateChapterTitle(
  novelId: string,
  chapterNumber: number,
): Promise<{
  chapterNumber: number;
  title: string;
  adopted: boolean;
  candidateTitle: string;
  candidateScore: number;
  message: string;
  reasons: string[];
}> {
  const { data } = await http.post(
    `/novels/${novelId}/chapters/${chapterNumber}/generate-title`,
    {},
    { timeout: AI_TIMEOUT },
  );
  return data;
}

export async function fetchChapterVersions(novelId: string, chapterNumber: number): Promise<{
  novelId: string;
  chapterNumber: number;
  versions: ChapterVersionMeta[];
}> {
  const { data } = await http.get(`/novels/${novelId}/chapters/${chapterNumber}/versions`);
  return data;
}

export async function fetchChapterDiff(novelId: string, chapterNumber: number, v1: number, v2: number): Promise<{
  v1: number;
  v2: number;
  diff: DiffLine[];
  summary: { added: number; removed: number; unchanged: number };
}> {
  const { data } = await http.get(`/novels/${novelId}/chapters/${chapterNumber}/versions/diff`, { params: { v1, v2 } });
  return data;
}

export async function rollbackChapter(novelId: string, chapterNumber: number, version: number): Promise<Record<string, unknown>> {
  const { data } = await http.post(`/novels/${novelId}/chapters/${chapterNumber}/versions/rollback`, { version });
  return data;
}

// ==================== 生成状态轮询（移动端替代 WebSocket）====================

export interface GenerationStatusResponse {
  isGenerating: boolean;
  chapterNumber: number | null;
  activeAgents: string[];
  agentStatuses: Record<string, 'active' | 'done' | 'error'>;
  writingAssistantOutput: string;
  lastCompletedChapter: number | null;
  lastCompletedAt: number | null;
  lastFailedChapter: number | null;
  lastFailedAt: number | null;
  lastFailureMessage: string;
  metadataUpdatedAt: number | null;
}

export async function fetchNovelGenerationStatus(novelId: string): Promise<GenerationStatusResponse> {
  const { data } = await http.get(`/novels/${novelId}/chapters/generation-status`);
  return data;
}
