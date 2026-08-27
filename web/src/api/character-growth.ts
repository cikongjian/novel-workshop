import { http } from './http';
import type { CharacterEvent } from './characters';

/** 角色情绪状态（对齐后端 CharacterEmotionState） */
export interface CharacterEmotionState {
  primary: string;
  intensity: number;
  trigger?: string;
}

/** 角色对某对象的信任变化 */
export interface CharacterTrustChange {
  targetId: string;
  delta: number;
  reason: string;
}

/** 状态快照的段落证据 */
export interface CharacterStateEvidence {
  paragraphIdx: number;
  reason: string;
}

/** 逐章角色状态快照（对齐后端 CharacterStateSnapshot，src/novel/types.ts:446） */
export interface CharacterStateSnapshot {
  id: string;
  novelId: string;
  characterId: string;
  chapterNumber: number;
  emotionState: CharacterEmotionState;
  goalProgress: number;
  stress: number;
  trustChanges: CharacterTrustChange[];
  beliefShift: string;
  evidence: CharacterStateEvidence[];
  /** 是否包含关键事件（死亡/突破/背叛等） */
  isCritical: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 角色金句（标志性台词，带评分） */
export interface CharacterQuote {
  text: string;
  chapter: number;
  score: number;
}

/** 角色高光场面（关键章节片段） */
export interface CharacterScene {
  text: string;
  chapter: number;
}

/** 名交锋回合中的一句台词 */
export interface RelationExchangeLine {
  speakerId: string;
  text: string;
}

/** 名交锋回合 */
export interface RelationExchangeCard {
  lines: RelationExchangeLine[];
  chapter: number;
}

/** 人物关系卡 */
export interface RelationCard {
  otherId: string;
  otherName: string;
  otherRole: string;
  /** 关系性质：宿敌/盟友/同行者/过客 */
  label: string;
  encounters: number;
  coAppearances: number;
  lastChapter: number;
  bestExchange?: RelationExchangeCard;
}

/** 角色成长数据：逐章快照 + 事件记忆链 + 金句 + 高光 + 关系 */
export interface CharacterGrowthData {
  snapshots: CharacterStateSnapshot[];
  events: CharacterEvent[];
  quotes: CharacterQuote[];
  scenes: CharacterScene[];
  relations: RelationCard[];
}

/** 拉取角色成长数据（情绪/压力曲线 + 大事记时间线的数据源） */
export async function fetchCharacterGrowth(
  novelId: string,
  characterId: string,
): Promise<CharacterGrowthData> {
  const { data } = await http.get<CharacterGrowthData>(
    `/novels/${novelId}/characters/${characterId}/growth`,
  );
  return data;
}
