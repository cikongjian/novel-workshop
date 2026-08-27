/**
 * 作家分 API
 */
import { http } from './http';

export interface WriterScoreDimensions {
  bili: number;
  pinzhi: number;
  renqi: number;
  duoyuan: number;
}

export interface WriterScoreResult {
  userId: string;
  score: number;
  level: number;
  levelName: string;
  dimensions: WriterScoreDimensions;
  burstScore: number;
  comboDays: number;
  comboMultiplier: number;
  calculatedAt: string;
}

/** 获取当前用户的作家分 */
export async function fetchMyWriterScore(): Promise<WriterScoreResult> {
  const { data } = await http.get('/writer-scores/my');
  return data as WriterScoreResult;
}

/** 根据 userId 查询作家分（公开） */
export async function fetchWriterScore(userId: string): Promise<WriterScoreResult> {
  const { data } = await http.get(`/writer-scores/${encodeURIComponent(userId)}`);
  return data as WriterScoreResult;
}
