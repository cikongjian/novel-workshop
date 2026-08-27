import { http } from './http';

// ==================== 批量章节摘要 ====================

export type BatchDigestParams = {
  novelId: string;
  chapterNumbers?: number[];
};

export type BatchDigestResult = {
  ok: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ chapterNumber: number; ok: boolean; error?: string }>;
};

export async function batchDigest(params: BatchDigestParams): Promise<BatchDigestResult> {
  const { data } = await http.post<BatchDigestResult>(
    '/generate/batch-digest',
    params,
    { timeout: 600_000 },
  );
  return data;
}

// ==================== 故事状态回填 ====================

export async function backfillStoryState(novelId: string, startChapter?: number): Promise<{ success: boolean; message: string }> {
  const { data } = await http.post<{ success: boolean; message: string }>(
    `/series/story-state/${novelId}/backfill`,
    { startChapter: startChapter ?? 1 },
    { timeout: 600_000 },
  );
  return data;
}

export async function fetchStoryState(novelId: string): Promise<any> {
  const { data } = await http.get(`/series/story-state/${novelId}`);
  return data;
}

