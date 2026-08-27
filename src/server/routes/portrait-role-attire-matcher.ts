import {
  getDefaultRoleAttireEntry,
  resolveRoleAttireConflictGroup,
  resolveRoleAttireEraScopes,
  resolveRoleAttirePriority,
} from './portrait-role-attire-data.js';
import type {
  RoleAttireEntry,
  RoleAttireMatch,
  RoleConflictGroup,
  RoleEraScope,
} from './portrait-role-attire-types.js';

function normalizeSignal(signal: string): string {
  return signal.toLowerCase();
}

function inferPreferredEraScopes(signal: string): RoleEraScope[] {
  const preferred: RoleEraScope[] = [];
  const normalized = signal.toLowerCase();

  if (/(太子|皇帝|王爷|丞相|尚书|锦衣卫|宫廷|王朝|都督|节度使|将军|掌柜|女官|宫女)/.test(normalized)
    || /(dynasty|imperial|court|royal|chancellor|minister|jinyiwei)/.test(normalized)) {
    preferred.push('ancient-cn');
  }
  if (/(修仙|仙门|宗门|道门|掌门|长老|弟子|江湖|灵力|渡劫)/.test(normalized)
    || /(xianxia|wuxia|cultivat|daoist|immortal sect)/.test(normalized)) {
    preferred.push('xianxia');
  }
  if (/(现代|都市|职场|总裁|医生|律师|警察|学生|校园|公司)/.test(normalized)
    || /(modern|urban|office|ceo|doctor|lawyer|police|student)/.test(normalized)) {
    preferred.push('modern');
  }
  if (/(星际|机甲|赛博|未来|太空|联邦|舰队)/.test(normalized)
    || /(sci[- ]?fi|cyberpunk|space|future|mecha|federation)/.test(normalized)) {
    preferred.push('sci-fi');
  }
  if (/(骑士|领主|伯爵|公爵|男爵|城堡|教廷|十字军|吟游诗人|中世纪|主教|教士)/.test(normalized)
    || /(knight|lord|duke|baron|castle|medieval|gothic|crusade|feudal|bishop|priest)/.test(normalized)) {
    preferred.push('western-medieval');
  }
  if (/(希腊|罗马|元老|执政官|斯巴达|角斗士|法老|埃及|雅典|庞贝)/.test(normalized)
    || /(greek|roman|senate|consul|sparta|gladiator|pharaoh|egypt|athen|antiquity|toga|centurion)/.test(normalized)) {
    preferred.push('western-antiquity');
  }
  if (/(洪荒|上古|远古|神话|三皇|五帝|部落|图腾|伏羲|女娲|神农|轩辕|蚩尤|神裔)/.test(normalized)
    || /(primordial|mythic|deity|tribal|shamanic|totem|prehistoric|pantheon)/.test(normalized)) {
    preferred.push('ancient-myth');
  }
  if (/(幕府|武士|大名|浪人|忍者|艺伎|将军|日本战国|江户|和服|阴阳师|妖怪)/.test(normalized)
    || /(samurai|daimyo|ronin|ninja|geisha|shogun|edo|sengoku|kimono)/.test(normalized)) {
    preferred.push('japanese-feudal');
  }
  if (/(末世|废土|末日|幸存者|避难所|辐射|变异|荒原|求生|丧尸)/.test(normalized)
    || /(post[- ]?apocalyptic|wasteland|survivor|fallout|doomsday|ruins|scavenger|mutant)/.test(normalized)) {
    preferred.push('post-apocalyptic');
  }

  return preferred;
}

function calcEraBonus(
  preferredEras: RoleEraScope[],
  candidateEras: RoleEraScope[],
): { bonus: number; matched: boolean } {
  if (preferredEras.length === 0 || candidateEras.includes('generic')) {
    return { bonus: 0, matched: false };
  }

  const directMatch = preferredEras.some(era => candidateEras.includes(era));
  if (directMatch) {
    return { bonus: 180, matched: true };
  }

  const semiCompatiblePairs: Array<[RoleEraScope, RoleEraScope]> = [
    ['ancient-cn', 'xianxia'],
    ['xianxia', 'ancient-cn'],
    ['ancient-cn', 'ancient-myth'],
    ['ancient-myth', 'ancient-cn'],
    ['western-medieval', 'western-antiquity'],
    ['western-antiquity', 'western-medieval'],
    ['western-medieval', 'ancient-myth'],
    ['ancient-myth', 'western-medieval'],
    ['japanese-feudal', 'ancient-cn'],
    ['ancient-cn', 'japanese-feudal'],
  ];
  const semiCompatible = semiCompatiblePairs.some(
    ([from, to]) => preferredEras.includes(from) && candidateEras.includes(to),
  );
  if (semiCompatible) {
    return { bonus: 80, matched: false };
  }

  return { bonus: -90, matched: false };
}

function scoreCandidate(
  matchedKeywords: string[],
  priority: number,
  eraBonus: number,
): number {
  const keywordLengthScore = matchedKeywords.reduce((sum, keyword) => sum + keyword.length, 0);
  const keywordCountScore = matchedKeywords.length * 40;
  const priorityScore = priority * 8;
  return keywordLengthScore + keywordCountScore + priorityScore + eraBonus;
}

export function matchRoleAttireEntryWithIndex(
  signal: string,
  roleAttireIndex: RoleAttireEntry[],
): RoleAttireMatch {
  const normalizedSignal = normalizeSignal(signal);
  const preferredEras = inferPreferredEraScopes(normalizedSignal);

  const rawCandidates: Array<{
    entry: RoleAttireEntry;
    matchedKeywords: string[];
    priority: number;
    score: number;
    eraMatched: boolean;
    conflictGroup: RoleConflictGroup;
  }> = [];

  for (const entry of roleAttireIndex) {
    const matchedKeywords = entry.keywords.filter(keyword =>
      normalizedSignal.includes(keyword.toLowerCase()),
    );
    if (matchedKeywords.length === 0) {
      continue;
    }

    const priority = resolveRoleAttirePriority(entry);
    const { bonus, matched } = calcEraBonus(preferredEras, resolveRoleAttireEraScopes(entry));
    const score = scoreCandidate(matchedKeywords, priority, bonus);
    rawCandidates.push({
      entry,
      matchedKeywords,
      priority,
      score,
      eraMatched: matched,
      conflictGroup: resolveRoleAttireConflictGroup(entry),
    });
  }

  if (rawCandidates.length === 0) {
    const defaultEntry = getDefaultRoleAttireEntry();
    return {
      entry: defaultEntry,
      matched: false,
      matchedKeywords: [],
      score: 0,
      priority: resolveRoleAttirePriority(defaultEntry),
      preferredEras,
      resolutionReason: preferredEras.length > 0
        ? `未命中身份词典关键词，按${preferredEras.join('/')}时代走通用服饰`
        : '未命中身份词典关键词，使用通用服饰',
      candidates: [],
    };
  }

  rawCandidates.sort((left, right) => right.score - left.score);
  let winner = rawCandidates[0];
  let resolutionReason = `按关键词命中与优先级选择：${winner.entry.label}`;

  if (rawCandidates.length > 1) {
    const runnerUp = rawCandidates[1];
    const closeScore = Math.abs(winner.score - runnerUp.score) <= 30;
    const conflict = winner.conflictGroup !== runnerUp.conflictGroup;
    if (closeScore && conflict) {
      if (!winner.eraMatched && runnerUp.eraMatched) {
        winner = runnerUp;
        resolutionReason = `冲突时按时代匹配优先，选择：${winner.entry.label}`;
      } else if (winner.priority < runnerUp.priority && winner.eraMatched === runnerUp.eraMatched) {
        winner = runnerUp;
        resolutionReason = `冲突时按词典优先级，选择：${winner.entry.label}`;
      } else {
        resolutionReason = `冲突已比较（时代/优先级），最终选择：${winner.entry.label}`;
      }
    }
  }

  return {
    entry: winner.entry,
    matched: true,
    matchedKeywords: winner.matchedKeywords,
    score: winner.score,
    priority: winner.priority,
    preferredEras,
    resolutionReason,
    candidates: rawCandidates.slice(0, 5).map(item => ({
      id: item.entry.id,
      label: item.entry.label,
      category: item.entry.category,
      score: item.score,
      priority: item.priority,
      eraMatched: item.eraMatched,
      matchedKeywords: item.matchedKeywords,
    })),
  };
}
