/**
 * 设定基线快照生成
 *
 * 从 synopsis + 前 N 章（漂移前）的 world/character + promise-contract
 * 提取不可漂移的设定骨架。默认漂移负面清单覆盖常见系统化术语体系。
 */
import type { CharacterProfile, WorldEntry } from '../../novel/types.js';
import type {
  SettingBaseline,
  BaselinePowerSystem,
  BaselineWorldFrame,
  BaselineCharacterCore,
  BaselineWorldRule,
} from './types.js';

/** 默认禁止的漂移方向（系统化/IT 化术语体系，除非显式开启相应题材） */
export const DEFAULT_FORBIDDEN_DRIFT_DIRECTIONS = [
  '上界神明 / 天界秩序 / 神罚降临（除非 seedIdea 明确为神话题材）',
  '跨界传送门 / 传送阵坐标网络（除非明确为科幻/无限流题材）',
  '坐标-碎片-覆写-加密段-锚点 这类系统化/数据库化术语体系',
  '把战斗/传承写成"浮现字迹 / 系统日志"式的说明书体',
];

const POWER_CATEGORY = 'power';
const FACTION_CATEGORY = 'faction';
const MAX_POWER_SYSTEMS = 4;
const MAX_FACTIONS = 6;
const MAX_CHARACTER_CORES = 8;
const MAX_CANONICAL_WORLD_ENTRIES = 24;

/** 结构化输入（不依赖 Novel/PromiseContract 完整类型，降低耦合） */
export type BuildSettingBaselineInput = {
  novel: {
    id: string;
    genre?: string;
    title?: string;
    synopsis?: string;
    tags?: string[];
  };
  worldEntries: WorldEntry[];
  characters: CharacterProfile[];
  /** 复用 promise-contract 的 antiDriftHint（可选） */
  promiseContract?: {
    summary?: string;
    antiDriftHint?: string;
  };
  /** 用于提取的章节范围（如 "1-8"），仅做记录 */
  fromChapters?: string;
  /** 是否允许神话题材的上界线（默认 false） */
  allowMythicUpgrades?: boolean;
};

function pickPowerSystems(entries: WorldEntry[]): BaselinePowerSystem[] {
  return entries
    .filter((e) => e.category === POWER_CATEGORY && !e.tags.includes('auto-generated'))
    .slice(0, MAX_POWER_SYSTEMS)
    .map((e) => ({
      name: e.name,
      description: (e.description || '').slice(0, 160),
    }));
}

function pickWorldFrame(entries: WorldEntry[], synopsis: string): BaselineWorldFrame {
  const factions = entries
    .filter((e) => e.category === FACTION_CATEGORY)
    .slice(0, MAX_FACTIONS)
    .map((e) => e.name);
  return {
    summary: (synopsis || '').slice(0, 280),
    factions,
  };
}

function pickCharacterCores(characters: CharacterProfile[]): BaselineCharacterCore[] {
  return characters
    .slice(0, MAX_CHARACTER_CORES)
    .map((c) => ({
      name: c.name,
      role: c.role,
      identity: [c.personality, c.motivation].filter(Boolean).join('；').slice(0, 160),
    }));
}

function pickCanonicalWorldEntries(entries: WorldEntry[]): BaselineWorldRule[] {
  return entries
    .filter(entry => entry.baseline === true || entry.tags.includes('approved'))
    .slice(0, MAX_CANONICAL_WORLD_ENTRIES)
    .map(entry => ({
      name: entry.name,
      category: entry.category,
      description: (entry.description || '').slice(0, 180),
      constraints: (entry.constraints ?? []).slice(0, 3),
      consequences: (entry.consequences ?? []).slice(0, 3),
    }));
}

export function buildSettingBaseline(input: BuildSettingBaselineInput): SettingBaseline {
  const { novel, worldEntries, characters, promiseContract, fromChapters, allowMythicUpgrades } = input;
  const powerSystems = pickPowerSystems(worldEntries);
  const worldFrame = pickWorldFrame(worldEntries, novel.synopsis || '');
  const characterCores = pickCharacterCores(characters);
  const canonicalWorldEntries = pickCanonicalWorldEntries(worldEntries);

  const promises: string[] = [];
  if (novel.synopsis) promises.push(novel.synopsis.slice(0, 200));
  if (promiseContract?.summary) promises.push(promiseContract.summary);

  const antiDriftClause = promiseContract?.antiDriftHint
    ? promiseContract.antiDriftHint
    : `本作为「${novel.genre || '未分类'}」题材，核心设定不得漂移。`;

  const forbiddenDirections = allowMythicUpgrades
    ? DEFAULT_FORBIDDEN_DRIFT_DIRECTIONS.filter((d) => !d.includes('上界神明'))
    : DEFAULT_FORBIDDEN_DRIFT_DIRECTIONS.slice();

  return {
    version: 1,
    novelId: novel.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    genre: novel.genre || '',
    powerSystems,
    worldFrame,
    characterCores,
    canonicalWorldEntries,
    promises,
    antiDriftClause,
    forbiddenDirections,
    sourceSummary: fromChapters
      ? `从第 ${fromChapters} 章及之前的世界/角色设定提取`
      : '从初始 world/character 设定提取',
  };
}
