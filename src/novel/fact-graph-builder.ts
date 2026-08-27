/**
 * 事实图谱构建器
 *
 * 从章节正文中基于规则提取角色出场、物品状态、地点访问、
 * 时间线事件和角色状态变化等事实，并合并到事实图谱中。
 */
import { randomUUID } from 'node:crypto';
import type {
  FactGraph,
  CharacterAppearance,
  ItemStatusEntry,
  LocationVisit,
  TimelineEvent,
  CharacterStateChange,
  FactEvent,
} from './fact-graph-types.js';
import type {
  ChapterFactExtractionInput,
  ExtractedFacts,
} from './fact-graph-builder-types.js';
import { buildFactEvents } from './fact-graph-events.js';
import { createAttribution, inferAttributionFromContext } from './fact-attribution.js';
import {
  extractActionFromSentence,
  extractLocationFromSentence,
  FLASHBACK_CUES,
  findNearestCharacter,
  inferMentionType,
  inferStateCertainty,
  isBetterAppearance,
  mentionConfidence,
  REFERENCE_CUES,
  sourceTypeFromMention,
  splitSentences,
} from './fact-graph-semantics.js';

export type { ChapterFactExtractionInput, ExtractedFacts } from './fact-graph-builder-types.js';

// ==================== 关键词表 ====================

const ITEM_VERBS: { verbs: RegExp; status: ItemStatusEntry['status'] }[] = [
  { verbs: /获得|得到|拿到|取得|收到|捡起|拔出/, status: 'obtained' },
  { verbs: /使用|用了|挥动|举起|拿起|祭出/, status: 'used' },
  { verbs: /丢失|失去|遗落|掉落/, status: 'lost' },
  { verbs: /毁坏|碎裂|断裂|粉碎|销毁|焚毁/, status: 'destroyed' },
  { verbs: /交给|递给|送给|赠予|转交/, status: 'transferred' },
];


const TIME_MARKER_PATTERNS: RegExp[] = [
  /第([一二三四五六七八九十百千\d]+)天/,
  /翌日|次日|第二天|隔天/,
  /三天后/,
  /数日后|几天后/,
  /半月后/,
  /一月后|一个月后/,
  /黎明|拂晓|破晓/,
  /黄昏|傍晚|日落/,
  /午时|正午|中午/,
  /[一二三四五六七八九十\d]+日后/,
  /[一二三四五六七八九十\d]+年后/,
];

const RESURRECTION_STATE_RE = /复活|死而复生|起死回生|被[^。！？\n]{0,12}救活|重新苏醒/u;
const EXPLICIT_DEATH_STATE_RE = /(?:当场|确认|已经|已然|最终|就此)?(?:身亡|毙命|丧命|殒命|气绝|咽气|断气|身死)|(?:确认|已经|已然|当场)死亡|(?<!找|封|堵|冻|饿|渴|吓|笑|忙|愁|累|埋|压)死(?:了|去|透|掉)|殉(?:职|难|道)/u;
const INHERITED_DEATH_SUBJECT_CUES = /瞪大眼|踉跄|后退|倒下|倒地|倒在|跪倒|吐血|喷血|中(?:剑|刀|枪|毒)|受创|重伤|捂住|挣扎|抽搐|呼吸|喉咙|胸口|身体/u;
const STATE_CLAUSE_BOUNDARY_RE = /[，,；;：:]/u;

const STATE_PATTERNS: { pattern: RegExp; state: CharacterStateChange['newState'] }[] = [
  { pattern: RESURRECTION_STATE_RE, state: 'alive' },
  { pattern: /(?:抽搐|身体|倒地|倒下|倒在)[^。！？\n]{0,16}(?:不动了|没了动静|再无动静)/, state: 'dead' },
  { pattern: EXPLICIT_DEATH_STATE_RE, state: 'dead' },
  { pattern: /受伤|中毒|重伤|负伤/, state: 'injured' },
  { pattern: /痊愈|恢复|治愈|伤愈/, state: 'healed' },
  { pattern: /失踪|消失|不知所踪/, state: 'missing' },
  { pattern: /被囚|入狱|关押|囚禁/, state: 'imprisoned' },
  { pattern: /突破|进阶|升级|觉醒/, state: 'powerup' },
];

const CN_NUM_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  百: 100, 千: 1000,
};

function parseCnNumber(s: string): number | undefined {
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  if (s.length === 1) return CN_NUM_MAP[s];
  // simple two-char: 十X, X十, X十X
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const v = CN_NUM_MAP[s[i]];
    if (v === undefined) return undefined;
    if (v === 10 || v === 100 || v === 1000) {
      result = (result || 1) * v;
    } else {
      result += v;
    }
  }
  return result || undefined;
}

// ==================== 主提取函数 ====================

export function extractFactsFromChapter(input: ChapterFactExtractionInput): ExtractedFacts {
  const { chapterContent, chapterNumber, characterNames } = input;
  const sentences = splitSentences(chapterContent);

  const characterAppearances = extractCharacterAppearances(sentences, chapterNumber, characterNames);
  const itemTimeline = extractItemTimeline(sentences, chapterNumber);
  const locationVisits = extractLocationVisits(sentences, chapterNumber, characterNames, characterAppearances);
  const timelineEvents = extractTimelineEvents(sentences, chapterNumber, characterNames);
  const characterStateChanges = extractCharacterStateChanges(sentences, chapterNumber, characterNames);
  const factEvents = buildFactEvents({
    characterAppearances,
    itemTimeline,
    locationVisits,
    timelineEvents,
    characterStateChanges,
    factEvents: [],
  });

  return { characterAppearances, itemTimeline, locationVisits, timelineEvents, characterStateChanges, factEvents };
}

// ==================== 角色出场提取 ====================

function extractCharacterAppearances(
  sentences: string[],
  chapterNumber: number,
  characterNames: string[],
): CharacterAppearance[] {
  const appearances = new Map<string, CharacterAppearance>();

  for (const name of characterNames) {
    for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
      const sentence = sentences[sentenceIndex];
      if (!sentence.includes(name)) continue;

      const mentionType = inferMentionType(sentence, name);
      const candidate: CharacterAppearance = {
        characterName: name,
        chapterNumber,
        location: extractLocationFromSentence(sentence),
        action: extractActionFromSentence(sentence, name, mentionType),
        mentionType,
        confidence: mentionConfidence(mentionType),
        evidence: sentence.trim().slice(0, 120),
        sentenceIndex,
      };

      if (isBetterAppearance(candidate, appearances.get(name))) {
        appearances.set(name, candidate);
      }
    }
  }
  return [...appearances.values()];
}

// ==================== 物品状态提取 ====================

function extractItemTimeline(sentences: string[], chapterNumber: number): ItemStatusEntry[] {
  const items: ItemStatusEntry[] = [];

  for (const sentence of sentences) {
    for (const { verbs, status } of ITEM_VERBS) {
      const verbMatch = sentence.match(verbs);
      if (!verbMatch) continue;

      let itemName = '';
      if (status === 'destroyed') {
        // noun before verb: X被毁坏
        const m = sentence.match(new RegExp(`([^\\s，。！？「『""]{2,8})[被]?(?:${verbs.source})`));
        if (m) itemName = m[1];
      } else if (status === 'transferred') {
        // verb + item + 给 + person, or person + 将 + item + verb
        const m = sentence.match(new RegExp(`将?[「『""]?([^\\s，。！？「『""]{2,8})[」』""]?(?:${verbs.source})`));
        if (m) itemName = m[1];
      } else {
        // verb + item
        const m = sentence.match(new RegExp(`(?:${verbs.source})[了]?[「『""]?([^\\s，。！？「『""]{2,8})[」』""]?`));
        if (m) itemName = m[1];
      }

      if (itemName && !items.some(i => i.itemName === itemName && i.status === status)) {
        items.push({ itemName, status, holderName: '', chapterNumber, detail: sentence.trim().slice(0, 50) });
      }
    }
  }
  return items.slice(0, 15);
}

// ==================== 地点访问提取 ====================

/**
 * 明显不是物理地点的词汇（抽象概念、身体部位、度量描述等）。
 * 用于过滤正则误提取的非地点结果。
 */
const NON_LOCATION_FILTER = /^(虚空|虚无|空中|半空|天空|脑海|梦境|意识|心中|记忆|回忆|幻境|冥想|体内|丹田|脑中|眼中|耳边|手中|怀中|口中|身上|背上|肩上|胸口|掌心|指尖|眼前|面前|身后|身边|身旁|脚下|头顶|心底|心头|一旁|那件|每隔|其间|过程|同时|瞬间|刹那|此刻|期间|黑暗|光芒|阳光|火焰|水中|血泊|泥泞)$/;

/** 包含数量词/度量词的模式，通常不是地点名 */
const MEASURE_PATTERN = /[一二三四五六七八九十百千万\d]+[尺丈里米步寸升斤两个只条根块片座]|每隔/;

/** 纯数字或中文数字词，不是地名（如"三十"其实是"三十里外"的截断） */
const PURE_NUMBER = /^[一二三四五六七八九十百千万零两\d]+$/;

function isPlausibleLocation(name: string): boolean {
  if (NON_LOCATION_FILTER.test(name)) return false;
  if (MEASURE_PATTERN.test(name)) return false;
  if (PURE_NUMBER.test(name)) return false;
  // 纯数字或太短（单字）不太可能是地名
  if (name.length <= 1) return false;
  return true;
}

function extractLocationVisits(
  sentences: string[],
  chapterNumber: number,
  characterNames: string[],
  appearances: CharacterAppearance[],
): LocationVisit[] {
  const visits: LocationVisit[] = [];
  const activeCharacters = new Map(
    appearances
      .filter(appearance => appearance.mentionType === 'onstage' || appearance.mentionType === 'dialogue')
      .map(appearance => [appearance.characterName, appearance]),
  );

  for (const sentence of sentences) {
    // Match arrival patterns: 来到|到达|... + location
    const arrivalRe = new RegExp(
      `(来到|到达|抵达|进入|走进|踏入|回到)[了]?[「『""]?([^\\s，。！？「『""]{2,10})[」』""]?`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = arrivalRe.exec(sentence)) !== null) {
      const arrivalMethod = m[1];
      const location = m[2];
      if (!isPlausibleLocation(location)) continue;
      // find which character is in this sentence
      const charName = findNearestCharacter(sentence, characterNames, m.index);
      if (charName && activeCharacters.has(charName) && !visits.some(v => v.characterName === charName && v.location === location)) {
        visits.push({ characterName: charName, location, chapterNumber, arrivalMethod });
      }
    }

    // Match "在...中/里/内/上" patterns
    const atRe = /在([^\s，。！？]{2,10})[中里内上]/g;
    while ((m = atRe.exec(sentence)) !== null) {
      const location = m[1];
      if (!isPlausibleLocation(location)) continue;
      const charName = findNearestCharacter(sentence, characterNames, m.index);
      if (charName && activeCharacters.has(charName) && !visits.some(v => v.characterName === charName && v.location === location)) {
        visits.push({ characterName: charName, location, chapterNumber, arrivalMethod: '' });
      }
    }
  }
  return visits;
}

// ==================== 里程碑自动分类 ====================

type MilestoneType = 'plot_twist' | 'character_death' | 'revelation' | 'power_shift'
  | 'alliance_change' | 'world_change' | 'betrayal' | 'reunion';

const MILESTONE_PATTERNS: { pattern: RegExp; type: MilestoneType }[] = [
  { pattern: /死|殒命|身亡|牺牲|阵亡|陨落/, type: 'character_death' },
  { pattern: /背叛|叛变|反水|谋反/, type: 'betrayal' },
  { pattern: /真相|揭露|揭穿|身份/, type: 'revelation' },
  { pattern: /突破|觉醒|进阶|晋级|飞升/, type: 'power_shift' },
  { pattern: /结盟|联盟|同盟|破裂|开战/, type: 'alliance_change' },
  { pattern: /重逢|团聚|归来|回归/, type: 'reunion' },
  { pattern: /反转|逆转|意外/, type: 'plot_twist' },
  { pattern: /规则|法则|变更|毁灭|覆灭/, type: 'world_change' },
];

function inferMilestoneType(text: string): MilestoneType | undefined {
  for (const { pattern, type } of MILESTONE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return undefined;
}

// ==================== 时间线事件提取 ====================

function extractTimelineEvents(
  sentences: string[],
  chapterNumber: number,
  characterNames: string[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
    const sentence = sentences[sentenceIndex];
    for (const pattern of TIME_MARKER_PATTERNS) {
      const m = sentence.match(pattern);
      if (!m) continue;

      const timeMarker = m[0];
      // avoid duplicate markers in same chapter
      if (events.some(e => e.timeMarker === timeMarker)) continue;

      let dayNumber: number | undefined;
      const dayMatch = timeMarker.match(/第([一二三四五六七八九十百千\d]+)天/);
      if (dayMatch) dayNumber = parseCnNumber(dayMatch[1]);

      const involved = characterNames.filter(n => sentence.includes(n));
      const location = extractLocationFromSentence(sentence);

      events.push({
        id: randomUUID(),
        chapterNumber,
        timeMarker,
        dayNumber,
        summary: sentence.trim().slice(0, 80),
        involvedCharacterNames: involved,
        location,
        importance: 3,
        isFlashback: FLASHBACK_CUES.test(sentence),
        evidence: sentence.trim().slice(0, 160),
        sentenceIndex,
        attribution: createAttribution(chapterNumber, 'extracted', FLASHBACK_CUES.test(sentence) ? 0.6 : 0.8),
        milestoneType: inferMilestoneType(sentence),
      });
      break; // one event per sentence
    }
  }
  return events.slice(0, 10);
}

// ==================== 角色状态变化提取 ====================

function extractCharacterStateChanges(
  sentences: string[],
  chapterNumber: number,
  characterNames: string[],
): CharacterStateChange[] {
  const changes: CharacterStateChange[] = [];

  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
    const sentence = sentences[sentenceIndex];
    for (const { pattern, state } of STATE_PATTERNS) {
      const match = sentence.match(pattern);
      if (!match || match.index === undefined) continue;
      if (state === 'dead' && RESURRECTION_STATE_RE.test(sentence)) continue;

      const directCharName = state === 'dead'
        ? findCharacterInStateClause(sentence, characterNames, match.index)
        : findNearestCharacter(sentence, characterNames, match.index);
      const inheritedCharName = !directCharName && state === 'dead'
        ? findInheritedDeathSubject(sentences, sentenceIndex, characterNames, sentence)
        : '';
      const charName = directCharName || inheritedCharName;
      if (!charName) continue;
      // avoid duplicate state for same character in same extraction
      if (changes.some(c => c.characterName === charName && c.newState === state)) continue;

      const evidenceText = inheritedCharName
        ? `${sentences[sentenceIndex - 1]}。${sentence}`
        : sentence;
      const mentionType = inferMentionType(evidenceText, charName);
      const explicitStateSource = (state === 'dead' || state === 'alive')
        && mentionType !== 'memory'
        && mentionType !== 'dream'
        && !REFERENCE_CUES.test(evidenceText);
      const inheritedDirectSource = Boolean(inheritedCharName)
        && mentionType !== 'memory'
        && mentionType !== 'dream';
      const sourceType = inheritedDirectSource || explicitStateSource
        ? 'direct'
        : sourceTypeFromMention(mentionType);
      changes.push({
        characterName: charName,
        chapterNumber,
        previousState: '',
        newState: state,
        detail: sentence.trim().slice(0, 60),
        certainty: inferStateCertainty(state, evidenceText, sourceType),
        sourceType,
        evidence: evidenceText.trim().slice(0, 160),
        sentenceIndex,
        attribution: inferAttributionFromContext(chapterNumber, {
          certainty: inferStateCertainty(state, evidenceText, sourceType),
          sourceType,
        }),
      });
    }
  }
  return changes;
}

function findCharacterInStateClause(
  sentence: string,
  characterNames: string[],
  anchorIndex: number,
): string {
  let clauseStart = 0;
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    if (STATE_CLAUSE_BOUNDARY_RE.test(sentence[index] ?? '')) {
      clauseStart = index + 1;
      break;
    }
  }
  let clauseEnd = sentence.length;
  for (let index = anchorIndex; index < sentence.length; index += 1) {
    if (STATE_CLAUSE_BOUNDARY_RE.test(sentence[index] ?? '')) {
      clauseEnd = index;
      break;
    }
  }
  const clause = sentence.slice(clauseStart, clauseEnd);
  return findNearestCharacter(clause, characterNames, anchorIndex - clauseStart);
}

function findInheritedDeathSubject(
  sentences: string[],
  sentenceIndex: number,
  characterNames: string[],
  deathSentence: string,
): string {
  if (sentenceIndex <= 0 || !/(?:不动了|没了动静|再无动静|断气|气绝|咽气|死透)/u.test(deathSentence)) {
    return '';
  }
  const previousSentence = sentences[sentenceIndex - 1] ?? '';
  const mentionedNames = [...new Set(characterNames.filter(name => previousSentence.includes(name)))];
  if (mentionedNames.length !== 1) return '';
  const name = mentionedNames[0]!;
  const subjectContext = previousSentence.slice(previousSentence.lastIndexOf(name) + name.length);
  return INHERITED_DEATH_SUBJECT_CUES.test(subjectContext) ? name : '';
}

// ==================== 图谱合并 ====================

export function mergeFactsIntoGraph(
  graph: FactGraph,
  facts: ExtractedFacts,
  chapterNumber: number,
): FactGraph {
  return {
    ...graph,
    lastUpdatedChapter: Math.max(graph.lastUpdatedChapter, chapterNumber),
    characterAppearances: [...graph.characterAppearances, ...facts.characterAppearances],
    itemTimeline: [...graph.itemTimeline, ...facts.itemTimeline],
    locationVisits: [...graph.locationVisits, ...facts.locationVisits],
    timelineEvents: [...graph.timelineEvents, ...facts.timelineEvents],
    characterStateChanges: [...graph.characterStateChanges, ...facts.characterStateChanges],
    factEvents: [...(graph.factEvents ?? []), ...facts.factEvents],
    updatedAt: new Date().toISOString(),
  };
}
