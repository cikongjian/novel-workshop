/**
 * 跨章节连贯性门禁
 *
 * 对比前一章事实与当前章节内容，检测时间/空间/物品/资源/时间线矛盾。
 */
import type { CharacterProfile, ChapterFact } from '../novel/types.js';
import type { ResourceLedger, CharacterMatrix } from '../novel/story-state-types.js';
import {
  getCharacterNameVariants,
  inferCharacterIdentitySpeechRule,
  resolveCharacterBySpeakerName,
} from './character-identity-rules.js';

export type ContinuityGateMode = 'off' | 'warn' | 'strict';

export type ContinuityFinding = {
  code: 'time-contradiction' | 'location-teleport' | 'item-inconsistency'
      | 'character-position-jump' | 'timeline-regression'
      | 'self-reference-role-mismatch' | 'self-talk'
      | 'identity-self-address-mismatch' | 'identity-address-mismatch'
      | 'resource-inconsistency' | 'information-leak';
  level: 'warn' | 'error';
  message: string;
};

export type ContinuityGateReport = {
  gateMode: ContinuityGateMode;
  findings: ContinuityFinding[];
  passed: boolean;
  summary: string;
};

// 时间段顺序映射（用于检测时间倒退）
const TIME_ORDER: Record<string, number> = {
  '凌晨': 1, '丑时（凌晨）': 1, '寅时（凌晨）': 2,
  '黎明': 3,
  '清晨': 4, '卯时（清晨）': 4,
  '上午': 5, '辰时（上午）': 5, '巳时（上午）': 6,
  '正午': 7, '午时（正午）': 7,
  '午后': 8, '未时（午后）': 8,
  '下午': 9, '申时（下午）': 9,
  '傍晚': 10, '酉时（傍晚）': 10,
  '夜晚': 11, '戌时（夜晚）': 11,
  '深夜': 12, '亥时（深夜）': 12, '子时（深夜）': 13,
};

// 时间跳跃关键词（出现则允许时间不连续）
const TIME_SKIP_KEYWORDS = [
  '翌日', '次日', '第二天', '隔天', '数日后', '几天后',
  '三天后', '半月后', '一月后', '数月后', '一年后',
  '过了', '已是', '转眼', '不知不觉',
];

// 移动关键词（出现则允许位置变化）
const MOVEMENT_KEYWORDS = [
  '赶往', '前往', '来到', '抵达', '到达', '回到',
  '离开', '出发', '启程', '飞往', '奔向', '走向',
  '一路', '途中', '路上', '行至', '驱车', '骑马',
];

/**
 * 评估连贯性门禁
 */
export function evaluateContinuityGate(params: {
  prevFact: ChapterFact;
  currentContent: string;
  currentFact: ChapterFact;
  gateMode: ContinuityGateMode;
  characters?: CharacterProfile[];
  enableIdentitySelfAddress?: boolean;
  enableIdentityAddress?: boolean;
  resourceLedger?: ResourceLedger;
  currentChapter?: number;
  characterMatrix?: CharacterMatrix;
}): ContinuityGateReport {
  const {
    prevFact,
    currentContent,
    currentFact,
    gateMode,
    characters = [],
    enableIdentitySelfAddress = true,
    enableIdentityAddress = true,
    resourceLedger,
    currentChapter,
    characterMatrix,
  } = params;
  const findings: ContinuityFinding[] = [];
  const isStrict = gateMode === 'strict';

  // 1. 时间连贯性检查
  checkTimeContradiction(prevFact, currentFact, currentContent, findings, isStrict);

  // 2. 空间连贯性检查（角色位置跳跃）
  checkLocationTeleport(prevFact, currentFact, currentContent, findings, isStrict);

  // 3. 物品追踪检查
  checkItemInconsistency(prevFact, currentFact, findings, isStrict);

  // 4. 时间线回退检查
  checkTimelineRegression(prevFact, currentFact, findings, isStrict);

  // 5. 章节内指代/称谓冲突（轻量启发式）
  checkIntraChapterCoreference(currentContent, currentFact, findings);

  // 6. 身份-自称错位检查（如亲王说”朕”）
  if (enableIdentitySelfAddress) {
    checkIdentitySelfAddressMismatch(currentContent, characters, findings, isStrict);
  }
  // 7. 身份-他称错位检查（如把亲王叫”陛下”）
  if (enableIdentityAddress) {
    checkIdentityAddressMismatch(currentContent, characters, findings, isStrict);
  }

  // 8. 资源一致性检查
  if (resourceLedger && currentChapter) {
    checkResourceInconsistency(currentContent, resourceLedger, currentChapter, findings, isStrict);
  }

  // 9. 信息泄露检查
  if (characterMatrix && characters.length > 0) {
    checkInformationLeak(currentContent, characterMatrix, characters, findings, isStrict);
  }

  const errorCount = findings.filter(f => f.level === 'error').length;
  const warnCount = findings.filter(f => f.level === 'warn').length;
  const passed = isStrict ? errorCount === 0 : true;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} 个错误`);
  if (warnCount > 0) parts.push(`${warnCount} 个警告`);
  const summary = parts.length > 0
    ? `连贯性检查：${parts.join('，')}`
    : '连贯性检查通过';

  return { gateMode, findings, passed, summary };
}

/**
 * 构建连贯性门禁修复提示（strict 模式下传给 Editor）
 */
export function buildContinuityGateFixHints(report: ContinuityGateReport): string {
  if (report.findings.length === 0) return '';

  const lines: string[] = [
    '以下是连贯性门禁检测到的矛盾，请对正文做最小必要改写修复：',
    '',
  ];

  for (const finding of report.findings) {
    const prefix = finding.level === 'error' ? '【错误】' : '【警告】';
    lines.push(`${prefix} ${finding.message}`);
  }

  if (report.findings.some(finding => finding.code === 'identity-self-address-mismatch')) {
    lines.push('');
    lines.push('【身份称谓修复】');
    lines.push('- 校正台词自称：非帝王角色禁止使用“朕”，按角色档案改为“本王/臣/我”等。');
    lines.push('- 若出现爵位或官职，相关敬称与语气需与身份一致。');
  }
  if (report.findings.some(finding => finding.code === 'identity-address-mismatch')) {
    lines.push('');
    lines.push('【身份敬称修复】');
    lines.push('- 校正他人敬称：按角色身份使用陛下/殿下/娘娘/王爷/将军/大人等，不跨身份混用。');
    lines.push('- 同一句中若出现“人名+敬称”冲突，优先保留与角色档案一致的称呼。');
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 保持主剧情节奏与段落结构，不做整章重写。');
  lines.push('- 添加必要的过渡描写（如时间流逝、场景转换）来消除矛盾。');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"。');
  return lines.join('\n');
}

// ==================== 内部检查函数 ====================

function checkTimeContradiction(
  prev: ChapterFact,
  current: ChapterFact,
  content: string,
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  if (!prev.timeOfDay || !current.timeOfDay) return;

  const prevOrder = TIME_ORDER[prev.timeOfDay];
  const currentOrder = TIME_ORDER[current.timeOfDay];
  if (prevOrder === undefined || currentOrder === undefined) return;

  // 上章结尾是夜晚/深夜，本章开头是白天 → 需要有时间跳跃说明
  if (prevOrder >= 11 && currentOrder <= 7) {
    const hasTimeSkip = TIME_SKIP_KEYWORDS.some(kw => content.includes(kw));
    if (!hasTimeSkip) {
      findings.push({
        code: 'time-contradiction',
        level: isStrict ? 'error' : 'warn',
        message: `上章结尾为"${prev.timeOfDay}"，本章出现"${current.timeOfDay}"，但未发现时间跳跃描写（如"翌日""次日"等）`,
      });
    }
  }
}

function checkLocationTeleport(
  prev: ChapterFact,
  current: ChapterFact,
  content: string,
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  for (const prevPos of prev.characterPositions) {
    const currentPos = current.characterPositions.find(
      p => p.characterId === prevPos.characterId,
    );
    if (!currentPos || currentPos.location === prevPos.location) continue;

    // 角色位置发生变化，检查是否有移动描写
    const hasMovement = MOVEMENT_KEYWORDS.some(kw => content.includes(kw));
    const hasCharNameNearMovement = MOVEMENT_KEYWORDS.some(kw => {
      const idx = content.indexOf(kw);
      if (idx === -1) return false;
      const nearby = content.slice(Math.max(0, idx - 30), idx + 30);
      return nearby.includes(prevPos.characterName);
    });

    if (!hasMovement && !hasCharNameNearMovement) {
      findings.push({
        code: 'location-teleport',
        level: isStrict ? 'error' : 'warn',
        message: `角色"${prevPos.characterName}"上章在"${prevPos.location}"，本章出现在"${currentPos.location}"，但未发现移动描写`,
      });
    }
  }
}

function checkItemInconsistency(
  prev: ChapterFact,
  current: ChapterFact,
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  for (const prevItem of prev.items) {
    if (prevItem.status !== 'destroyed' && prevItem.status !== 'lost') continue;

    const currentItem = current.items.find(i => i.name === prevItem.name);
    if (!currentItem) continue;

    // 上章已毁/已失的物品在本章被使用或获得
    if (currentItem.status === 'obtained' || currentItem.status === 'used') {
      const verb = prevItem.status === 'destroyed' ? '已被毁灭' : '已经丢失';
      findings.push({
        code: 'item-inconsistency',
        level: isStrict ? 'error' : 'warn',
        message: `物品"${prevItem.name}"在前章${verb}，但本章出现了"${currentItem.status === 'obtained' ? '获得' : '使用'}"该物品`,
      });
    }
  }
}

function checkTimelineRegression(
  prev: ChapterFact,
  current: ChapterFact,
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  if (!prev.timelineMarker || !current.timelineMarker) return;

  const prevDay = extractDayNumber(prev.timelineMarker);
  const currentDay = extractDayNumber(current.timelineMarker);
  if (prevDay === null || currentDay === null) return;

  if (currentDay < prevDay) {
    findings.push({
      code: 'timeline-regression',
      level: isStrict ? 'error' : 'warn',
      message: `时间线倒退：上章标记为"${prev.timelineMarker}"（约第${prevDay}天），本章标记为"${current.timelineMarker}"（约第${currentDay}天）`,
    });
  }
}

const INTRA_ROLE_WORDS = [
  '奴才',
  '下人',
  '家丁',
  '仆人',
  '仆役',
  '随从',
  '跟班',
  '狗腿子',
  '小厮',
  '丫鬟',
  '奴婢',
];

const INTRA_SPEECH_VERBS = [
  '说',
  '问',
  '喊',
  '叫',
  '骂',
  '嘀咕',
  '心想',
  '暗想',
  '想着',
];
const SPEAKER_DIALOGUE_RE = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09:\n]+?)\s*[\)\uFF09][^“”"\n]{0,24}[“"]([^“”"\n]{1,140})/g;
const REPORTED_SPEECH_HINT_RE = /(说|道|讲|问|喊|提到|提及|称|叫|口称|口中|学着|模仿|复述|引用|听见|转述)$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkIntraChapterCoreference(
  content: string,
  currentFact: ChapterFact,
  findings: ContinuityFinding[],
): void {
  const text = (content ?? '').trim();
  if (!text) return;

  const names = Array.from(new Set(
    (currentFact.characterPositions ?? [])
      .map(p => p.characterName)
      .filter(Boolean),
  )).filter(name => name.length >= 2 && name.length <= 8);

  if (names.length === 0) return;

  const roleAlt = INTRA_ROLE_WORDS.map(escapeRegExp).join('|');
  const verbAlt = INTRA_SPEECH_VERBS.map(escapeRegExp).join('|');

  for (const name of names) {
    const safeName = escapeRegExp(name);

    const selfTalk = new RegExp(`${safeName}\\s*对\\s*${safeName}\\s*说`, 'g');
    if (selfTalk.test(text)) {
      findings.push({
        code: 'self-talk',
        level: 'warn',
        message: `疑似自指/指代错误：出现“${name}对${name}说…”，可能把人名写重复了。`,
      });
    }

    const speakerRe = new RegExp(`(^|[^\\u4e00-\\u9fff])(${safeName})\\s*(?:${verbAlt})\\s*[：:]`, 'g');
    const selfRoleRe = new RegExp(`[“"‘']?\\s*${safeName}\\s*(?:这|那|这个|那个|本|此)?\\s*(?:${roleAlt})`, 'g');

    let speakerMatch: RegExpExecArray | null;
    while ((speakerMatch = speakerRe.exec(text)) !== null) {
      const idx = speakerMatch.index + speakerMatch[0].length;
      const windowText = text.slice(idx, idx + 160);
      if (!windowText) continue;
      if (!selfRoleRe.test(windowText)) continue;

      findings.push({
        code: 'self-reference-role-mismatch',
        level: 'warn',
        message: `疑似逻辑冲突：${name}发言后紧接着出现“${name}…${INTRA_ROLE_WORDS.join('/')}”式称呼，可能把“他/那/某人”的名字写成了说话人的名字。`,
      });
      break;
    }
  }
}

function checkIdentitySelfAddressMismatch(
  content: string,
  characters: CharacterProfile[],
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  if (characters.length === 0) return;
  const text = (content ?? '').trim();
  if (!text) return;

  const mismatchMap = new Map<string, {
    name: string;
    identityLabel: string;
    hits: Set<string>;
    preferred: Set<string>;
  }>();
  let match: RegExpExecArray | null;
  while ((match = SPEAKER_DIALOGUE_RE.exec(text)) !== null) {
    const speakerName = (match[1] ?? '').trim();
    const dialogue = (match[2] ?? '').trim();
    if (!speakerName || !dialogue) continue;

    const character = resolveCharacterBySpeakerName(characters, speakerName);
    if (!character) continue;

    const rule = inferCharacterIdentitySpeechRule(character);
    if (!rule || rule.forbiddenSelfRefs.length === 0) continue;

    const hitTokens = rule.forbiddenSelfRefs.filter(token => hasLikelySelfReference(dialogue, token));
    if (hitTokens.length === 0) continue;

    const existing = mismatchMap.get(character.id) ?? {
      name: character.name,
      identityLabel: rule.identityLabel,
      hits: new Set<string>(),
      preferred: new Set<string>(),
    };
    for (const token of hitTokens) {
      existing.hits.add(token);
    }
    for (const token of rule.preferredSelfRefs) {
      if (!token.includes('（')) {
        existing.preferred.add(token);
      }
    }
    mismatchMap.set(character.id, existing);
  }

  for (const mismatch of mismatchMap.values()) {
    const suggestion = mismatch.preferred.size > 0
      ? `建议改为：${[...mismatch.preferred].join(' / ')}`
      : '请改为符合身份的自称';
    findings.push({
      code: 'identity-self-address-mismatch',
      level: isStrict ? 'error' : 'warn',
      message: `角色“${mismatch.name}”（${mismatch.identityLabel}）台词出现禁用自称：${[...mismatch.hits].join('、')}。${suggestion}。`,
    });
  }
}

function checkIdentityAddressMismatch(
  content: string,
  characters: CharacterProfile[],
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  if (characters.length === 0) return;
  const text = (content ?? '').trim();
  if (!text) return;

  const mismatchMap = new Map<string, {
    name: string;
    identityLabel: string;
    hits: Set<string>;
    preferred: Set<string>;
  }>();

  for (const character of characters) {
    const rule = inferCharacterIdentitySpeechRule(character);
    if (!rule || rule.forbiddenAddressByOthers.length === 0) continue;

    const variants = getCharacterNameVariants(character)
      .map(escapeRegExp)
      .filter(Boolean);
    if (variants.length === 0) continue;
    const nameAlt = variants.join('|');

    for (const forbidden of rule.forbiddenAddressByOthers) {
      const forbiddenSafe = escapeRegExp(forbidden);
      const nearName = new RegExp(`(?:${nameAlt})[^。！？；;\\n]{0,3}${forbiddenSafe}|${forbiddenSafe}[^。！？；;\\n]{0,3}(?:${nameAlt})`, 'g');
      if (!nearName.test(text)) continue;

      const existing = mismatchMap.get(character.id) ?? {
        name: character.name,
        identityLabel: rule.identityLabel,
        hits: new Set<string>(),
        preferred: new Set<string>(),
      };
      existing.hits.add(forbidden);
      for (const suggestion of rule.preferredAddressByOthers) {
        existing.preferred.add(suggestion);
      }
      mismatchMap.set(character.id, existing);
    }
  }

  for (const mismatch of mismatchMap.values()) {
    const suggestion = mismatch.preferred.size > 0
      ? `建议改称：${[...mismatch.preferred].join(' / ')}`
      : '请改为符合身份的敬称';
    findings.push({
      code: 'identity-address-mismatch',
      level: isStrict ? 'error' : 'warn',
      message: `角色“${mismatch.name}”（${mismatch.identityLabel}）出现称呼错位：${[...mismatch.hits].join('、')}。${suggestion}。`,
    });
  }
}

function hasLikelySelfReference(dialogue: string, token: string): boolean {
  if (!dialogue || !token) return false;
  const escaped = escapeRegExp(token);
  const re = new RegExp(escaped, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(dialogue)) !== null) {
    const idx = match.index;
    const prefix = dialogue.slice(Math.max(0, idx - 6), idx).trim();
    if (prefix && REPORTED_SPEECH_HINT_RE.test(prefix)) continue;
    return true;
  }
  return false;
}

// ==================== 工具函数 ====================

const CN_NUM: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '百': 100, '千': 1000,
};

function extractDayNumber(marker: string): number | null {
  // 匹配 "第X天" 或 "X日"
  const match = marker.match(/第?([一二三四五六七八九十百千\d]+)[天日]/);
  if (!match) return null;

  const raw = match[1];
  // 纯数字
  const num = Number.parseInt(raw, 10);
  if (Number.isFinite(num)) return num;

  // 中文数字转换（简单处理）
  if (raw.length === 1) return CN_NUM[raw] ?? null;
  if (raw === '十') return 10;
  if (raw.startsWith('十')) return 10 + (CN_NUM[raw[1]] ?? 0);
  if (raw.endsWith('十')) return (CN_NUM[raw[0]] ?? 0) * 10;
  if (raw.includes('十')) {
    const parts = raw.split('十');
    return (CN_NUM[parts[0]] ?? 0) * 10 + (CN_NUM[parts[1]] ?? 0);
  }
  return CN_NUM[raw] ?? null;
}

/**
 * 检查资源一致性（物品使用、耐久度、数量）
 */
function checkResourceInconsistency(
  content: string,
  ledger: ResourceLedger,
  currentChapter: number,
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  const text = (content ?? '').trim();
  if (!text || ledger.entries.length === 0) return;

  for (const entry of ledger.entries) {
    // 检查是否在内容中提到该资源
    const mentioned = text.includes(entry.name);
    if (!mentioned) continue;

    // 检查资源是否已耗尽
    if (entry.quantity <= 0) {
      findings.push({
        code: 'resource-inconsistency',
        level: isStrict ? 'error' : 'warn',
        message: `资源"${entry.name}"数量已为0，但本章内容中仍在使用该资源`,
      });
      continue;
    }

    // 检查耐久度是否已耗尽
    if (entry.durability !== undefined && entry.durability <= 0) {
      findings.push({
        code: 'resource-inconsistency',
        level: isStrict ? 'error' : 'warn',
        message: `资源"${entry.name}"耐久度已为0（已损坏），但本章内容中仍在使用该资源`,
      });
      continue;
    }

    // 检查资源是否在获得之前就被使用
    if (entry.acquiredAt > currentChapter) {
      findings.push({
        code: 'resource-inconsistency',
        level: isStrict ? 'error' : 'warn',
        message: `资源"${entry.name}"在第${entry.acquiredAt}章才获得，但本章（第${currentChapter}章）就已使用`,
      });
    }
  }
}

/**
 * 检查信息泄露（角色引用了不该知道的信息）
 */
function checkInformationLeak(
  content: string,
  matrix: CharacterMatrix,
  characters: CharacterProfile[],
  findings: ContinuityFinding[],
  isStrict: boolean,
): void {
  const text = (content ?? '').trim();
  if (!text || matrix.interactions.length === 0) return;

  // 构建角色名称映射
  const characterMap = new Map<string, CharacterProfile>();
  for (const char of characters) {
    characterMap.set(char.name, char);
    if (char.aliases) {
      for (const alias of char.aliases) {
        characterMap.set(alias, char);
      }
    }
  }

  // 检查每个交互记录中的非对称信息
  for (const interaction of matrix.interactions) {
    for (const asymmetric of interaction.asymmetricKnowledge) {
      const knower = asymmetric.knower;
      const secret = asymmetric.secret;

      // 确定不知道秘密的角色
      const unknower = interaction.characterA === knower
        ? interaction.characterB
        : interaction.characterA;

      // 检查内容中是否有不知情角色引用该秘密的情况
      // 简单启发式：查找"角色名 + 秘密关键词"的模式
      const unknowerChar = characterMap.get(unknower);
      if (!unknowerChar) continue;

      const nameVariants = getCharacterNameVariants(unknowerChar);
      for (const name of nameVariants) {
        // 查找该角色的对话或行为描写
        const dialoguePattern = new RegExp(`${escapeRegExp(name)}[^。！？]{0,20}[说道讲问喊][:：][""]([^""]{1,200})[""]`, 'g');
        let match: RegExpExecArray | null;

        while ((match = dialoguePattern.exec(text)) !== null) {
          const dialogue = match[1];
          // 检查对话中是否包含秘密关键词
          if (dialogue && dialogue.includes(secret)) {
            findings.push({
              code: 'information-leak',
              level: isStrict ? 'error' : 'warn',
              message: `信息泄露：角色"${unknower}"不应知道"${secret}"，但在对话中提及了该信息`,
            });
            break;
          }
        }
      }
    }
  }

  // 检查角色是否引用了未曾相遇角色的信息
  for (const interaction of matrix.interactions) {
    if (!interaction.firstMetAt) {
      // 两个角色尚未相遇
      const charA = interaction.characterA;
      const charB = interaction.characterB;

      // 检查A是否在内容中提到B（或B提到A）
      const mentionPattern = new RegExp(`${escapeRegExp(charA)}[^。！？]{0,50}${escapeRegExp(charB)}|${escapeRegExp(charB)}[^。！？]{0,50}${escapeRegExp(charA)}`, 'g');
      if (mentionPattern.test(text)) {
        findings.push({
          code: 'information-leak',
          level: 'warn',
          message: `角色"${charA}"和"${charB}"尚未相遇，但内容中出现了两者的关联描写`,
        });
      }
    }
  }
}


