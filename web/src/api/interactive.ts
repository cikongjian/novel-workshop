/**
 * 互动小说 API 封装
 */
import { http } from './http';

/** 互动小说推进阶段 */
export type InteractivePhase =
  | 'idle'
  | 'generating'
  | 'publishing'
  | 'vote_open'
  | 'vote_closing'
  | 'advancing'
  | 'stalled';

/** 单轮互动历史记录 */
export interface InteractiveRoundHistory {
  round: number;
  startChapter: number;
  chapterCount: number;
  question: string;
  winningDirection: string;
  totalVotes: number;
  outcome: 'completed' | 'stalled' | 'manual';
  finishedAt: number;
}

/** 互动小说配置 */
export interface InteractiveConfig {
  enabled: boolean;
  chaptersPerRound: number;
  voteDurationHours: number;
  minVotesToAdvance: number;
  paused: boolean;
  phase: InteractivePhase;
  currentRound: number;
  currentRoundStartChapter: number;
  currentVoteDeadline?: number;
  currentVotePointId?: string;
  lastWinningDirection?: string;
  history: InteractiveRoundHistory[];
}

/** 查询互动配置 */
export async function fetchInteractiveConfig(novelId: string): Promise<InteractiveConfig | null> {
  const res = await http.get(`/interactive/${novelId}/interactive`);
  return res.data?.config ?? null;
}

/** 开启互动模式 */
export async function enableInteractive(
  novelId: string,
  params?: { chaptersPerRound?: number; voteDurationHours?: number; minVotesToAdvance?: number },
): Promise<InteractiveConfig> {
  const res = await http.post(`/interactive/${novelId}/interactive/enable`, params ?? {});
  return res.data.config;
}

/** 关闭互动模式 */
export async function disableInteractive(novelId: string): Promise<void> {
  await http.post(`/interactive/${novelId}/interactive/disable`);
}

/** 更新互动参数 */
export async function updateInteractiveConfig(
  novelId: string,
  params: { chaptersPerRound?: number; voteDurationHours?: number; minVotesToAdvance?: number },
): Promise<InteractiveConfig> {
  const res = await http.put(`/interactive/${novelId}/interactive/config`, params);
  return res.data.config;
}

/** 暂停自动推进 */
export async function pauseInteractive(novelId: string): Promise<InteractiveConfig> {
  const res = await http.post(`/interactive/${novelId}/interactive/pause`);
  return res.data.config;
}

/** 恢复自动推进 */
export async function resumeInteractive(novelId: string): Promise<InteractiveConfig> {
  const res = await http.post(`/interactive/${novelId}/interactive/resume`);
  return res.data.config;
}

/** 手动采纳投票结果 */
export async function adoptVoteResult(
  novelId: string,
  votePointId: string,
): Promise<{ winningDirection: string }> {
  const res = await http.post(`/interactive/${novelId}/interactive/adopt-vote`, { votePointId });
  return res.data;
}

/** 启动第一轮互动连载（从 idle 阶段进入 generating） */
export async function startInteractive(novelId: string): Promise<InteractiveConfig> {
  const res = await http.post(`/interactive/${novelId}/interactive/start`);
  return res.data.config;
}
