import { http, AI_TIMEOUT } from './http';

// ==================== 整本重生 ====================

export type RebirthResponse = {
  newNovelId: string;
  totalChapters: number;
  blueprint: {
    title: string;
    synopsis: string;
    characterCount: number;
    worldEntryCount: number;
    qualityNotes?: string;
    rewriteDirection?: string;
  };
  autoGenerate: boolean;
};

export async function startRebirth(params: {
  novelId: string;
  userDirection?: string;
  autoGenerate?: boolean;
  autoFinalize?: boolean;
  maxWordCount?: number;
}): Promise<RebirthResponse> {
  const { data } = await http.post('/generate/rebirth', params, { timeout: AI_TIMEOUT });
  return data;
}

