/**
 * 剧情投票 API
 */
import { http } from './http';

export interface VoteOption {
  id: string;
  text: string;
}

/**
 * 富信息投票选项（互动小说模式下由 AI 生成）。
 * 与后端 EnrichedVoteOption 对齐，展示走向标题、梗概、风险等级、影响预测。
 */
export interface EnrichedVoteOption extends VoteOption {
  /** 走向标题（简短一句话） */
  title?: string;
  /** 走向梗概（2-3 句描述） */
  synopsis?: string;
  /** 风险等级（low/medium/high） */
  riskLevel?: 'low' | 'medium' | 'high';
  /** 影响预测（对后续剧情的影响） */
  impactPrediction?: string;
}

export interface VotePoint {
  id: string;
  novelId: string;
  chapterId: string;
  question: string;
  options: VoteOption[];
  /** 富信息选项（互动小说模式下由 AI 生成，可能不存在） */
  enrichedOptions?: EnrichedVoteOption[];
  deadline: number;
  status: 'open' | 'closed';
  winnerOptionId?: string;
  adopted?: boolean;
  createdAt: number;
  createdBy: string;
}

export interface VoteStats {
  totalVotes: number;
  optionStats: { optionId: string; count: number; percentage: number }[];
}

export interface VotePointWithStats extends VotePoint {
  stats: VoteStats;
  myVote: string | null;
}

/** 按章节获取投票点（读者 + 作者） */
export async function fetchVoteByChapter(novelId: string, chapterId: string): Promise<VotePointWithStats | null> {
  const res = await http.get(`/plot-votes/by-chapter/${novelId}/${chapterId}`);
  return res.data;
}

/** 按小说列出所有投票点（作者） */
export async function fetchVotesByNovel(novelId: string): Promise<VotePointWithStats[]> {
  const res = await http.get(`/plot-votes/by-novel/${novelId}`);
  return res.data;
}

/** 创建投票点（作者） */
export async function createVotePoint(params: {
  novelId: string;
  chapterId: string;
  question: string;
  options: string[];
  deadlineHours: number;
}): Promise<VotePoint> {
  const res = await http.post('/plot-votes', params);
  return res.data;
}

/** 更新投票点（作者） */
export async function updateVotePoint(
  id: string,
  updates: { question?: string; options?: string[]; deadlineHours?: number },
): Promise<VotePoint> {
  const res = await http.put(`/plot-votes/${id}`, updates);
  return res.data;
}

/** 删除投票点（作者） */
export async function deleteVotePoint(id: string): Promise<void> {
  await http.delete(`/plot-votes/${id}`);
}

/** 手动关闭投票（作者） */
export async function closeVotePoint(id: string): Promise<VotePoint> {
  const res = await http.post(`/plot-votes/${id}/close`);
  return res.data;
}

/** 采纳/不采纳（作者） */
export async function adoptVotePoint(id: string, adopted: boolean): Promise<VotePoint> {
  const res = await http.post(`/plot-votes/${id}/adopt`, { adopted });
  return res.data;
}

/** 读者投票 */
export async function castVote(votePointId: string, optionId: string): Promise<void> {
  await http.post(`/plot-votes/${votePointId}/vote`, { optionId });
}

/** AI 生成投票选项 */
export async function generateVoteOptions(
  novelId: string,
  chapterId: string,
): Promise<{ question: string; options: string[] }> {
  const res = await http.post('/plot-votes/ai-options', { novelId, chapterId });
  return res.data;
}
