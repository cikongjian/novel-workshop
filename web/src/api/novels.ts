import { http } from './http';
import { getDeployBase } from '../utils/deploy-path';
import type {
  NovelMetadata,
  NovelGenre,
  OutlineData,
  NovelConstitution,
  ConstitutionVersionHistory,
} from '../types';
import {
  clearNovelUserApiBinding,
  syncNovelCollectionBindings,
  syncNovelUserApiBinding,
} from '../utils/user-api-local';

export type ShuangwenAudience = 'male' | 'female';
export type ShuangwenPreviewResponse = {
  mode: 'preview' | 'apply' | 'create';
  novelId?: string;
  resolved: { genre: string; audience: ShuangwenAudience };
  blueprint: unknown;
  outline: OutlineData;
  marketing: { raw: string; parsed: boolean; payload?: unknown };
  sampleChapter?: {
    chapterNumber: number;
    title: string;
    draftText: string;
    polishedText: string;
    editorNotes: string;
  };
};

export type ShuangwenCreateAsyncResponse = {
  mode: 'create-async';
  taskId: string;
  novelId: string;
  resolved: { genre: string; audience: ShuangwenAudience };
  persisted: boolean;
  persistDetails?: Record<string, unknown>;
};

export type ShuangwenApplyResponse = ShuangwenPreviewResponse & {
  persisted: boolean;
  persistDetails?: Record<string, unknown>;
};

export type ShuangwenGateReport = {
  hookGate: { passed: boolean; findings: string[]; summary: string };
  cycleGate: { passed: boolean; findings: string[]; summary: string };
  forbiddenGate: { passed: boolean; findings: string[]; summary: string };
};

export type ShuangwenChapterResponse = {
  mode: 'generate-chapter';
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  readerFeedback: string;
  shuangwenGateReport?: ShuangwenGateReport;
  qualityReport?: { passed: boolean; findings: string[]; summary: string };
  autoRevision?: { triggered: boolean; rounds: number; initialScore: number; finalScore: number };
};

export type ShuangwenChapterAcceptedResponse = {
  status: 'accepted';
  mode: 'generate-chapter';
  novelId: string;
  chapterNumber: number;
  message: string;
  billingBypassed?: boolean;
  modelAccessSource?: string;
};

export type ShuangwenChapterGenerateResponse =
  | ShuangwenChapterResponse
  | ShuangwenChapterAcceptedResponse;

export function isShuangwenChapterAccepted(
  response: ShuangwenChapterGenerateResponse,
): response is ShuangwenChapterAcceptedResponse {
  return 'status' in response && response.status === 'accepted';
}

export async function fetchNovels(): Promise<NovelMetadata[]> {
  const { data } = await http.get<NovelMetadata[]>('/novels');
  syncNovelCollectionBindings(data);
  return data;
}

export async function fetchNovelSummaries(): Promise<NovelMetadata[]> {
  const { data } = await http.get<NovelMetadata[]>('/novels', {
    params: { view: 'summary' },
  });
  syncNovelCollectionBindings(data);
  return data;
}

export type NovelBindingSummary = Pick<
  NovelMetadata,
  'id' | 'syncId' | 'title' | 'genre' | 'status' | 'synopsis' | 'description' | 'chapterCount' | 'ownerId' | 'createdAt' | 'updatedAt'
> & {
  modelConfig?: Pick<
    NonNullable<NovelMetadata['modelConfig']>,
    'provider' | 'source' | 'userApiProfileId' | 'userApiProfileStorageMode' | 'userApiProfileName' | 'model' | 'temperature'
  >;
};

export async function fetchNovelBindingSummaries(): Promise<NovelBindingSummary[]> {
  const { data } = await http.get<NovelBindingSummary[]>('/novels', {
    params: { view: 'binding' },
  });
  syncNovelCollectionBindings(data);
  return data;
}

export async function fetchNovel(id: string): Promise<NovelMetadata> {
  const { data } = await http.get<NovelMetadata>(`/novels/${id}`);
  syncNovelUserApiBinding(data);
  return data;
}

export async function createNovel(params: {
  title: string;
  genre: NovelGenre;
  synopsis?: string;
  description?: string;
  constitutionTags?: string[];
}): Promise<NovelMetadata> {
  const { data } = await http.post<NovelMetadata>('/novels', params);
  syncNovelUserApiBinding(data);
  return data;
}

export async function previewShuangwen(params: {
  novelId?: string;
  genre: NovelGenre;
  seedIdea?: string;
  titleHint?: string;
  synopsisHint?: string;
  targetChapters?: number;
  outlineChapters?: number;
  includeMarketing?: boolean;
  sampleChapter?: boolean;
  maxWordCount?: number;
  temperatureOverride?: number;
}): Promise<ShuangwenPreviewResponse> {
  const { data } = await http.post<ShuangwenPreviewResponse>('/shuangwen/preview', params, { timeout: 5 * 60_000 });
  return data;
}

export async function createShuangwenAsync(params: {
  genre: NovelGenre;
  seedIdea?: string;
  titleHint?: string;
  synopsisHint?: string;
  title?: string;
  synopsis?: string;
  constitutionTags?: string[];
  targetChapters?: number;
  outlineChapters?: number;
  includeMarketing?: boolean;
  sampleChapter?: boolean;
  maxWordCount?: number;
  temperatureOverride?: number;
  overwriteChapter1?: boolean;
  createChapterShells?: boolean;
}): Promise<ShuangwenCreateAsyncResponse> {
  const { data } = await http.post<ShuangwenCreateAsyncResponse>('/shuangwen/create-async', params, { timeout: 60_000 });
  return data;
}

export async function applyShuangwen(params: {
  novelId: string;
  genre?: NovelGenre;
  audience?: ShuangwenAudience;
  seedIdea?: string;
  titleHint?: string;
  synopsisHint?: string;
  targetChapters?: number;
  outlineChapters?: number;
  includeMarketing?: boolean;
  sampleChapter?: boolean;
  maxWordCount?: number;
  overwriteMeta?: boolean;
  overwriteChapter1?: boolean;
  createChapterShells?: boolean;
}): Promise<ShuangwenApplyResponse> {
  const { data } = await http.post<ShuangwenApplyResponse>('/shuangwen/apply', params, { timeout: 10 * 60_000 });
  return data;
}

export async function generateShuangwenChapter(params: {
  novelId: string;
  chapterNumber: number;
  userDirection?: string;
  maxWordCount?: number;
  hookGateMode?: 'off' | 'warn' | 'strict';
  cycleGateMode?: 'off' | 'warn' | 'strict';
  forbiddenGateMode?: 'off' | 'warn' | 'strict';
  scoreThreshold?: number;
  maxRevisionRounds?: number;
}): Promise<ShuangwenChapterGenerateResponse> {
  const { data } = await http.post<ShuangwenChapterGenerateResponse>('/shuangwen/generate-chapter', params, { timeout: 60_000 });
  return data;
}

export async function updateNovel(
  id: string,
  params: Partial<Pick<NovelMetadata, 'title' | 'genre' | 'synopsis' | 'description' | 'status' | 'targetChapters' | 'titleGuidance' | 'startupPlatformProfile' | 'edgeNarratorVoice' | 'tags' | 'constitutionTags'>> & {
    modelConfig?: NovelMetadata['modelConfig'] | null;
    embeddingConfig?: NovelMetadata['embeddingConfig'] | null;
  },
): Promise<NovelMetadata> {
  const { data } = await http.put<NovelMetadata>(`/novels/${id}`, params);
  syncNovelUserApiBinding(data);
  return data;
}

export async function deleteNovel(id: string): Promise<void> {
  await http.delete(`/novels/${id}`);
  clearNovelUserApiBinding(id);
}

export async function fetchTrash(): Promise<(NovelMetadata & { deletedAt?: string })[]> {
  const { data } = await http.get('/novels/trash/list');
  return data;
}

export async function restoreNovel(id: string): Promise<NovelMetadata> {
  const { data } = await http.post(`/novels/trash/${id}/restore`);
  return data;
}

export async function permanentDeleteNovel(id: string): Promise<void> {
  await http.delete(`/novels/trash/${id}`);
}

/**
 * 获取封面图片 URL
 * @param id 小说 ID
 * @param version 版本号（用于 cache busting）
 * @param thumbWidth 缩略图宽度 (200|400|600|800)，不传则返回原图
 */
export function getCoverUrl(id: string, version?: string | number, thumbWidth?: number): string {
  const params = new URLSearchParams();
  if (version !== undefined && version !== null && `${version}`.length > 0) {
    params.set('v', String(version));
  }
  if (thumbWidth) {
    params.set('w', String(thumbWidth));
  }
  const qs = params.toString();
  const base = getDeployBase();
  return `${base}/api/novels/cover/${id}${qs ? `?${qs}` : ''}`;
}

function assertValidNovelId(id: string, action: string): string {
  const normalized = id?.trim() ?? '';
  if (!normalized || normalized === 'undefined') {
    throw new Error(`${action}失败：当前作品尚未就绪`);
  }
  return normalized;
}

export async function uploadCover(id: string, file: File, generated = false): Promise<NovelMetadata> {
  const novelId = assertValidNovelId(id, '上传封面');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const { data } = await http.post(`/novels/cover/${novelId}`, {
    data: base64,
    mimeType: file.type,
    generated,
  });
  return data;
}

export async function deleteCover(id: string): Promise<NovelMetadata> {
  const novelId = assertValidNovelId(id, '删除封面');
  const { data } = await http.delete(`/novels/cover/${novelId}`);
  return data;
}

export type NovelCoverPromptResult = {
  prompt: string;
  positivePrompt: string;
  negativePrompt: string;
  promptSource: 'ai' | 'template' | 'manual';
  contextSummary: string;
  recommendedSize: string;
};

export type GenerateNovelCoverResult = {
  novel: NovelMetadata;
  persisted: boolean;
  imagePath: string | null;
  imageUrl: string | null;
  imageDataUrl: string | null;
  requestedSize: string;
  size: string;
  usedFallbackSize: boolean;
  prompt: string;
  positivePrompt: string;
  negativePrompt: string;
  promptSource: 'ai' | 'template' | 'manual';
};

export async function generateNovelCoverPrompt(
  id: string,
  generateText?: boolean,
  authorName?: string,
  styleOverrides?: Record<string, string>,
): Promise<NovelCoverPromptResult> {
  const novelId = assertValidNovelId(id, '生成封面提示词');
  const { data } = await http.post<NovelCoverPromptResult>(`/novels/${novelId}/cover-ai/prompt`, {
    generateText: generateText === true ? true : undefined,
    authorName,
    styleOverrides,
  }, { timeout: 3 * 60_000 });
  return data;
}

export async function generateNovelCover(params: {
  novelId: string;
  prompt?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  size?: string;
  saveResult?: boolean;
  generateText?: boolean;
  authorName?: string;
  styleOverrides?: Record<string, string>;
}): Promise<GenerateNovelCoverResult> {
  const { novelId, ...body } = params;
  const resolvedNovelId = assertValidNovelId(novelId, '生成封面');
  const { data } = await http.post<GenerateNovelCoverResult>(`/novels/${resolvedNovelId}/cover-ai/generate`, body, {
    timeout: 3 * 60_000,
  });
  return data;
}

export type CoverStyleOptions = {
  visualStyleOptions: Array<{ key: string; label: string; summary: string }>;
  formatOptions: Array<{ key: string; label: string; summary: string }>;
  eraOptions: Array<{ key: string; label: string }>;
  moodOptions: Array<{ key: string; label: string }>;
};

export async function fetchCoverStyleOptions(novelId: string): Promise<CoverStyleOptions> {
  const { data } = await http.get<CoverStyleOptions>(`/novels/${novelId}/cover-ai/cover-style-options`);
  return data;
}

export async function exportNovel(
  id: string,
  format: 'markdown' | 'txt' | 'html' | 'epub',
  options?: {
    includeMetadata?: boolean;
    includeToc?: boolean;
    chapterRange?: { from?: number; to?: number };
    stripSpeakerMarkers?: boolean;
  },
): Promise<Blob | { content: string }> {
  if (format === 'epub') {
    const response = await http.post(`/novels/${id}/export`, { format, ...options }, { responseType: 'blob' });
    return response.data as Blob;
  }
  const { data } = await http.post<{ content: string }>(`/novels/${id}/export`, { format, ...options });
  return data;
}

export async function forkNovel(
  id: string,
  fromChapter: number,
  newTitle?: string,
): Promise<NovelMetadata> {
  const { data } = await http.post<NovelMetadata>(`/novels/${id}/fork`, { fromChapter, newTitle }, { timeout: 120_000 });
  return data;
}

export type ConstitutionGenerationTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ConstitutionGenerationTask = {
  taskId: string;
  novelId: string;
  status: ConstitutionGenerationTaskStatus;
  progress: number;
  stage: string;
  message: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
};

// ── 宪章 API ──

export async function fetchConstitution(novelId: string): Promise<NovelConstitution | null> {
  const { data } = await http.get<{ constitution: NovelConstitution | null }>(`/novels/${novelId}/constitution`);
  return data.constitution;
}

export async function fetchConstitutionVersions(novelId: string): Promise<ConstitutionVersionHistory> {
  const { data } = await http.get<ConstitutionVersionHistory>(`/novels/${novelId}/constitution/versions`);
  return data;
}

export async function fetchConstitutionGenerationStatus(novelId: string): Promise<ConstitutionGenerationTask | null> {
  const { data } = await http.get<{ task: ConstitutionGenerationTask | null }>(`/novels/${novelId}/constitution/generation-status`);
  return data.task;
}

export async function generateConstitution(novelId: string): Promise<ConstitutionGenerationTask> {
  const { data } = await http.post<{ task: ConstitutionGenerationTask }>(
    `/novels/${novelId}/constitution/generate`,
    undefined,
    { timeout: 15_000 },
  );
  return data.task;
}

export async function updateConstitution(novelId: string, constitution: NovelConstitution): Promise<NovelConstitution> {
  const { data } = await http.put<{ constitution: NovelConstitution }>(`/novels/${novelId}/constitution`, constitution);
  return data.constitution;
}

export async function rollbackConstitutionVersion(novelId: string, version: number): Promise<NovelConstitution> {
  const { data } = await http.post<{ constitution: NovelConstitution }>(`/novels/${novelId}/constitution/rollback/${version}`);
  return data.constitution;
}
