/**
 * 设定基线（创作宪法）类型定义
 *
 * 不可漂移的设定骨架：从简介/宪章/前 N 章 world+character 提取，
 * 人工确认冻结后，作为漂移检测的对比基准 + Writer 的强约束上下文。
 * 存储：data/novels/{id}/truth-files/setting-baseline.json
 */

export type SettingBaselineStatus = 'pending' | 'confirmed';

/** 核心力量体系骨架（如"霸体 N 重"），禁止被替换为另一套体系 */
export type BaselinePowerSystem = {
  name: string;
  description: string;
};

/** 世界观框架骨架 */
export type BaselineWorldFrame = {
  /** 时空/地理框架一句话（如"万域大地，诸侯割据，无上界介入"） */
  summary: string;
  /** 核心势力/阵营名 */
  factions: string[];
};

/** 核心角色定位骨架（禁止核心人设被改写） */
export type BaselineCharacterCore = {
  name: string;
  role: string;
  /** 一句话核心人设（如"草根孤儿，铁血霸主，北境斥候出身"） */
  identity: string;
};

/** 作者确认的世界正史；只约束提及时的事实，不要求每章全部出现。 */
export type BaselineWorldRule = {
  name: string;
  category: 'geography' | 'history' | 'faction' | 'power' | 'culture' | 'rule' | 'other';
  description: string;
  constraints: string[];
  consequences: string[];
};

export type SettingBaseline = {
  version: 1;
  novelId: string;
  status: SettingBaselineStatus;
  /** 冻结时所基于的章节号（记录用） */
  frozenAtChapter?: number;
  createdAt: string;
  confirmedAt?: string;
  /** 题材（用于漂移词表选择） */
  genre: string;
  /** 核心力量体系（禁止被替换为另一套体系） */
  powerSystems: BaselinePowerSystem[];
  /** 世界观框架 */
  worldFrame: BaselineWorldFrame;
  /** 核心角色定位（禁止核心人设被改写） */
  characterCores: BaselineCharacterCore[];
  /** 世界圣经确认的正史边界；可选以兼容旧版基线文件。 */
  canonicalWorldEntries?: BaselineWorldRule[];
  /** 核心剧情承诺（从简介/promise-contract 提取） */
  promises: string[];
  /** 反漂移条款（复用 promise-contract 的 antiDriftHint） */
  antiDriftClause: string;
  /** 明确禁止的漂移方向（如"上界神明/跨界传送/坐标-碎片-覆写系统"） */
  forbiddenDirections: string[];
  /** 提取源说明（用哪些章节/world/character 提取的） */
  sourceSummary: string;
};
