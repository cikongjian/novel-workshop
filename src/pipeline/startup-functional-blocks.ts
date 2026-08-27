import { randomUUID } from 'node:crypto';
import type { Scene } from '../novel/types.js';
import type { ChapterPromiseCard } from './chapter-promise-card.js';
import type { PromiseContract } from './promise-contract.js';
import { buildTopicProfileBlocks } from './startup-topic-functional-blocks.js';

type StartupFunctionalScenePlanParams = {
  chapterNumber: number;
  outlineText: string;
  novelTitle: string;
  novelSynopsis: string;
  promiseContract: PromiseContract;
  chapterPromiseCard: ChapterPromiseCard;
  maxWordCount?: number;
};

type FunctionalBlockBlueprint = {
  title: string;
  summary: string;
  location: string;
  tension: number;
  notes?: string;
};

export type StartupFunctionalScenePlan = {
  sceneMode: true;
  scenePlan: string;
  scenes: Scene[];
};

const OUTLINE_ANCHOR_BLOCKLIST = [
  /开头类型/u,
  /场景列表/u,
  /结构自检/u,
  /紧张度曲线/u,
  /伏笔规划/u,
  /情绪高潮/u,
  /章节结尾钩子/u,
  /字数预算/u,
  /平台范式/u,
  /内容要点/u,
  /出场角色/u,
  /转场/u,
  /过桥钩子/u,
  /章节主题/u,
  /地理的叙事功能/u,
  /适用规则/u,
  /势力动态/u,
  /背景知识/u,
  /一致性检查/u,
  /新增设定建议/u,
];

function normalizeLine(line: string): string {
  return line
    .replace(/^[-*•\s]+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .trim();
}

function sanitizeAnchor(line: string): string {
  return line
    .replace(/^场景\d+[:：]\s*/u, '')
    .replace(/^[A-Za-z]+\d*[:：]\s*/u, '')
    .replace(/[（(][^)）]{0,24}[)）]\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulAnchor(line: string): boolean {
  if (line.length < 10 || line.length > 42) return false;
  if (/^[：:]+$/u.test(line)) return false;
  if (/^(地点|目标|冲突|信息增量|结尾钩子|节拍|紧张度|视觉|听觉|嗅觉)/u.test(line)) return false;
  if (OUTLINE_ANCHOR_BLOCKLIST.some(pattern => pattern.test(line))) return false;
  return true;
}

function pickOutlineAnchors(outlineText: string, limit: number): string[] {
  const lines = outlineText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)
    .map(sanitizeAnchor)
    .filter((line) => !/^第\s*\d+\s*章/u.test(line))
    .filter(isUsefulAnchor);

  return [...new Set(lines)].slice(0, limit);
}

function buildAnchorHint(anchor: string | undefined): string {
  return anchor ? `重点参考节点：${anchor}。` : '';
}

function buildWordTargets(totalWords: number, sceneCount: number): number[] {
  const safeTotal = Math.max(totalWords, sceneCount * 420);
  const ratios = sceneCount === 2 ? [0.52, 0.48] : [0.34, 0.33, 0.33];
  const targets = ratios.slice(0, sceneCount).map((ratio) => Math.max(420, Math.round(safeTotal * ratio)));
  const delta = safeTotal - targets.reduce((sum, value) => sum + value, 0);
  targets[targets.length - 1] += delta;
  return targets;
}

function appendNote(base: string | undefined, extra: string): string {
  const normalizedBase = base?.trim();
  if (!normalizedBase) return extra;
  if (normalizedBase.includes(extra)) return normalizedBase;
  return `${normalizedBase} ${extra}`.trim();
}

function buildFoodBlocks(
  anchors: string[],
  card: ChapterPromiseCard,
  sceneCount: number,
): FunctionalBlockBlueprint[] {
  const blocks: FunctionalBlockBlueprint[] = [
    {
      title: '开局先活下来',
      summary: `主角先把眼前困境转成真实动作，不要长时间停在受苦和回忆，必须尽快把“做吃食/开火/摆摊/求生”的第一步做出来。${buildAnchorHint(anchors[0])}`.trim(),
      location: '灶边 / 庙里 / 摊前 / 厨房',
      tension: 7,
      notes: '第一块就要出现食物制作或求生动作，不能只写挨饿、委屈和回忆。',
    },
    {
      title: '香味把人拽进场',
      summary: `让食物的味道、卖相或手艺在公开场景里产生反应，把人流、围观、试吃或关键对象引到主角面前。优先兑现：${card.requiredScene.label}。${buildAnchorHint(anchors[1])}`.trim(),
      location: '门口 / 官道 / 村口 / 集市',
      tension: 8,
      notes: '这一块要有别人闻到、看到、被馋到的公开反馈，不允许再缩回纯内心戏。',
    },
    {
      title: '第一笔回报落地',
      summary: `当章必须把“${card.requiredPayoff.label}”落成真实结果，例如第一笔成交、第一句公认的夸赞、第一份机会或第一层口碑扩散，并用“${card.preferredEndingFocus[0] ?? '更大机会'}”收尾。${buildAnchorHint(anchors[2])}`.trim(),
      location: '摊前 / 路边 / 人群边缘',
      tension: 7,
      notes: '不能只停在“有人注意到”，必须让结果真正落地。',
    },
  ];

  return blocks.slice(0, sceneCount);
}

function buildRomanceBlocks(
  anchors: string[],
  card: ChapterPromiseCard,
  sceneCount: number,
): FunctionalBlockBlueprint[] {
  const blocks: FunctionalBlockBlueprint[] = [
    {
      title: '同场碰撞，火花起势',
      summary: `先把主角的现实压力和关系对象放进同一场戏里，要求尽快见面、尽快碰撞、尽快形成拉扯，不许长时间分头描写或各自盘算。${buildAnchorHint(anchors[0])}`.trim(),
      location: '宴会 / 电梯 / 门口 / 车里 / 聚会现场',
      tension: 8,
      notes: '首块必须让关系主角同场并产生正面互动，不要把对手一直留在手机、照片、文件或回忆里。',
    },
    {
      title: '被迫同框，关系失衡',
      summary: `把上一场的碰撞推进成真正绑定：公开同框、被迫合作、同居规则确认、签字领证都可以，但必须出现不可回退的关系动作。优先兑现：${card.requiredScene.label}。${buildAnchorHint(anchors[1])}`.trim(),
      location: '门口 / 车里 / 家门前 / 包厢 / 民政局',
      tension: 9,
      notes: '这一块必须从对峙推进到关系绑定，禁止重复上一块的互呛；默认先写同框、靠近、站位变化，不要无条件滑向项目谈判。',
    },
    {
      title: '私域升温，第一次失守',
      summary: `绑定落地后立刻换场到同居、家人、媒体或私下独处场景，给一次可见的关系回报，让读者看见偏袒、护短、吃醋、靠近、失控在意，或其他“${card.preferredEndingFocus[0] ?? '关系推进'}”信号，并用关系下一步收尾。${buildAnchorHint(anchors[2])}`.trim(),
      location: '家里 / 车里 / 走廊 / 家人面前 / 夜间独处处',
      tension: 7,
      notes: '第三块禁止重复签协议、民政局、谈判桌，必须切到绑定后的新场景；章尾禁止把账户、空壳公司、资金链、幕后调查写成主钩子，关系回报必须落地。',
    },
  ];

  return blocks.slice(0, sceneCount);
}

function buildShowbizBlocks(
  anchors: string[],
  card: ChapterPromiseCard,
  sceneCount: number,
): FunctionalBlockBlueprint[] {
  const blocks: FunctionalBlockBlueprint[] = [
    {
      title: '公开舞台上的资源危机',
      summary: `开场直接落到片场、试镜、直播、热搜、定妆或节目组这类公开主场景，让主角遭遇资源压制或身份危机。${buildAnchorHint(anchors[0])}`.trim(),
      location: '片场 / 试镜间 / 直播间 / 热搜现场',
      tension: 8,
      notes: '不要先沉到后台调查、办公室密谈或长篇回忆。',
    },
    {
      title: '公开反击而非幕后空转',
      summary: `主角必须在公开战场上做出有效动作，把“${card.requiredPayoff.label}”往前推，而不是把篇幅吃在私下谈条件。${buildAnchorHint(anchors[1])}`.trim(),
      location: '镜头前 / 导演组 / 围观人群 / 直播间',
      tension: 9,
      notes: '反击要尽量发生在公众可见处，幕后戏只能做辅戏。',
    },
    {
      title: '第一轮结果与更大钩子',
      summary: `当章必须交出一轮看得见的结果，例如角色保住、热搜起爆、站队变化、资源回正，再用“${card.preferredEndingFocus[0] ?? '更大机会'}”收尾。${buildAnchorHint(anchors[2])}`.trim(),
      location: '片场出口 / 热搜榜单 / 粉圈舆论场',
      tension: 8,
      notes: '章尾要先写结果，再挂下一步更大的机会或风险。',
    },
  ];

  return blocks.slice(0, sceneCount);
}

function buildSurvivalBlocks(
  anchors: string[],
  card: ChapterPromiseCard,
  sceneCount: number,
): FunctionalBlockBlueprint[] {
  const blocks: FunctionalBlockBlueprint[] = [
    {
      title: '绝境里撬出生路',
      summary: `先把主角压进高压生存处境，死亡倒计时、资源缺口和唯一逃生尝试必须快速成立，并且本块只负责把异界入口/资源窗口撬开，不要提前把交易、到账、加固全部写完。${buildAnchorHint(anchors[0])}`.trim(),
      location: '车厢 / 庇护所 / 牢房 / 末日据点边缘',
      tension: 8,
      notes: '第一块必须只落到“发现入口并决定进入”，禁止提前写完交易、贡献点到账、据点升级。',
    },
    {
      title: '第一笔资源换回来',
      summary: `让主角在资源窗口里完成一次短平快交易或搜刮，把“${card.requiredPayoff.label}”的第一口资源带回来，并立刻验证它在主场景里的价值。${buildAnchorHint(anchors[1])}`.trim(),
      location: '废土营地 / 交易点 / 副本边缘 / 资源点',
      tension: 8,
      notes: '这一块只写异界快速换货、带回验证和第一次公开兑换，不要重讲绝境开局。',
    },
    {
      title: '把资源变成活路',
      summary: `当章必须把带回来的资源落成生存条件升级，例如到账、净水、武器、加固、补给或临时盟友，再用“${card.preferredEndingFocus[0] ?? '更大生存窗口'}”收尾。${buildAnchorHint(anchors[2])}`.trim(),
      location: '车厢 / 庇护所内部 / 据点通道',
      tension: 7,
      notes: '第三块禁止重新从被推进车厢写起，必须承接“资源已带回”后的新局面，写改善、交易余波和更近的新威胁。',
    },
  ];

  return blocks.slice(0, sceneCount);
}

function buildGenericBlocks(
  anchors: string[],
  card: ChapterPromiseCard,
  sceneCount: number,
): FunctionalBlockBlueprint[] {
  const blocks: FunctionalBlockBlueprint[] = [
    {
      title: '触发事件点火',
      summary: `开场先让主角碰上本章必须处理的现实麻烦，目标要明确，动作要马上开始。${buildAnchorHint(anchors[0])}`.trim(),
      location: '',
      tension: 7,
      notes: '第一块先起火，不要让背景说明压过事件。',
    },
    {
      title: '正面交锋与决定',
      summary: `安排主角与关键阻力同场碰撞，并把局面推进到不可回退的选择。优先兑现：${card.requiredScene.label}。${buildAnchorHint(anchors[1])}`.trim(),
      location: '',
      tension: 8,
      notes: '中块必须有对抗和决定，不能只有观察和猜测。',
    },
    {
      title: '当章回报落袋',
      summary: `本章必须把“${card.requiredPayoff.label}”落成看得见的结果，再用“${card.preferredEndingFocus[0] ?? '下一步抉择'}”收尾。${buildAnchorHint(anchors[2])}`.trim(),
      location: '',
      tension: 7,
      notes: '章尾先给结果，再留钩子。',
    },
  ];

  return blocks.slice(0, sceneCount);
}

function buildBlueprints(params: StartupFunctionalScenePlanParams, anchors: string[], sceneCount: number): FunctionalBlockBlueprint[] {
  switch (params.chapterPromiseCard.genreFocus) {
    case 'food':
      return buildFoodBlocks(anchors, params.chapterPromiseCard, sceneCount);
    case 'romance':
      return buildRomanceBlocks(anchors, params.chapterPromiseCard, sceneCount);
    case 'showbiz':
      return buildShowbizBlocks(anchors, params.chapterPromiseCard, sceneCount);
    case 'survival':
      return buildSurvivalBlocks(anchors, params.chapterPromiseCard, sceneCount);
    default:
      return buildTopicProfileBlocks(anchors, params.chapterPromiseCard, sceneCount)
        ?? buildGenericBlocks(anchors, params.chapterPromiseCard, sceneCount);
  }
}

export function buildStartupFunctionalScenePlan(
  params: StartupFunctionalScenePlanParams,
): StartupFunctionalScenePlan | null {
  if (params.chapterNumber > 3 || params.chapterPromiseCard.phase !== 'startup') {
    return null;
  }

  const sceneCount = params.maxWordCount && params.maxWordCount <= 1800 ? 2 : 3;
  const targetWords = buildWordTargets(params.maxWordCount ?? 2400, sceneCount);
  const anchors = pickOutlineAnchors(params.outlineText, sceneCount);
  const blueprints = buildBlueprints(params, anchors, sceneCount);
  const now = new Date().toISOString();

  const scenes: Scene[] = blueprints.map((block, index) => ({
    id: randomUUID(),
    sceneNumber: index + 1,
    title: block.title,
    summary: block.summary,
    characters: [],
    location: block.location,
    tension: block.tension,
    wordTarget: targetWords[index] ?? 0,
    wordCount: 0,
    content: '',
    status: 'planned',
    notes: block.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }));

  for (let index = 0; index < scenes.length; index += 1) {
    if (index > 0) {
      scenes[index].notes = appendNote(
        scenes[index].notes,
        '本场必须新增一个推进维度，优先从身份、关系、利益、规则、代价、下一步行动里至少换一个，不要重复上一场同类型冲突。',
      );
    }
    if (index === scenes.length - 1) {
      scenes[index].notes = appendNote(
        scenes[index].notes,
        '章末钩子要落在具体的人、事、任务、到来、发现、邀约或交易上，不要只留空泛气氛。',
      );
    }
  }

  const scenePlan = scenes.map((scene) => [
    `场景${scene.sceneNumber}：${scene.title}`,
    `- 功能：${scene.summary}`,
    `- 地点建议：${scene.location || '沿用大纲主场景'}`,
    `- 张力目标：${scene.tension}/10`,
    `- 目标字数：${scene.wordTarget} 字`,
    scene.notes ? `- 执行提醒：${scene.notes}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  return {
    sceneMode: true,
    scenePlan,
    scenes,
  };
}

/** Minimum character count for a paragraph to be eligible for dedup. */
const DEDUP_MIN_CHARS = 10;
/** Number of trailing paragraphs from the previous scene to compare against. */
const SEAM_ZONE_PARAGRAPHS = 6;
/** Character-overlap ratio above which two paragraphs are considered duplicates. */
const FUZZY_OVERLAP_THRESHOLD = 0.55;
/** Stricter threshold when matching against earlier non-tail paragraphs. */
const FULL_HISTORY_OVERLAP_THRESHOLD = 0.74;

/**
 * Compute the ratio of shared unique characters between two strings.
 * Returns a value in [0, 1] where 1 means identical character sets.
 */
function charOverlapRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const ch of setA) {
    if (setB.has(ch)) shared++;
  }
  const smaller = Math.min(setA.size, setB.size);
  return smaller === 0 ? 0 : shared / smaller;
}

export function assembleSceneContents(scenes: Scene[]): string {
  const normalizeParagraph = (text: string): string => text
    .replace(/\s+/g, '')
    .replace(/[，。！？；：、”””'`~\-—…,.!?;:()（）【】《》]/g, '')
    .trim();

  const splitParagraphs = (text: string): string[] => text
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  /**
   * Remove leading paragraphs of `currentText` that duplicate the tail of
   * `previousText`. Supports both exact substring match and fuzzy
   * character-overlap match to catch same-meaning rewrites.
   */
  const trimLeadingDuplicateParagraphs = (currentText: string, previousText: string): string => {
    const paragraphs = splitParagraphs(currentText);
    if (paragraphs.length <= 1 || !previousText.trim()) {
      return currentText.trim();
    }

    // Build the “seam zone” — last N paragraphs of the previous scene
    const prevParagraphs = splitParagraphs(previousText);
    const seamZone = prevParagraphs
      .slice(-SEAM_ZONE_PARAGRAPHS)
      .map(normalizeParagraph)
      .filter((p) => p.length >= DEDUP_MIN_CHARS);
    const fullHistory = prevParagraphs
      .map(normalizeParagraph)
      .filter((p) => p.length >= DEDUP_MIN_CHARS);

    if (seamZone.length === 0 && fullHistory.length === 0) return currentText.trim();

    const previousNormalized = normalizeParagraph(previousText);
    let removeUntil = 0;

    for (let index = 0; index < paragraphs.length; index += 1) {
      const normalized = normalizeParagraph(paragraphs[index] ?? '');
      if (normalized.length < DEDUP_MIN_CHARS) break;

      // Check 1: exact substring match (original logic)
      const exactMatch = previousNormalized.includes(normalized);

      // Check 2: fuzzy overlap with any seam-zone paragraph
      let fuzzyMatch = false;
      if (!exactMatch) {
        for (const seamParagraph of seamZone) {
          if (charOverlapRatio(normalized, seamParagraph) >= FUZZY_OVERLAP_THRESHOLD) {
            fuzzyMatch = true;
            break;
          }
        }
      }

      let fullHistoryMatch = false;
      if (!exactMatch && !fuzzyMatch) {
        for (const historyParagraph of fullHistory) {
          if (charOverlapRatio(normalized, historyParagraph) >= FULL_HISTORY_OVERLAP_THRESHOLD) {
            fullHistoryMatch = true;
            break;
          }
        }
      }

      if (!exactMatch && !fuzzyMatch && !fullHistoryMatch) break;
      removeUntil = index + 1;
    }

    if (removeUntil <= 0 || removeUntil >= paragraphs.length) {
      return currentText.trim();
    }

    const trimmed = paragraphs.slice(removeUntil).join('\n\n').trim();
    return trimmed.length >= DEDUP_MIN_CHARS ? trimmed : currentText.trim();
  };

  let assembled = '';
  for (const scene of scenes) {
    const current = scene.content.trim();
    if (!current) continue;
    const sanitized = trimLeadingDuplicateParagraphs(current, assembled);
    if (!sanitized) continue;
    assembled = assembled ? `${assembled}\n\n${sanitized}` : sanitized;
  }
  return assembled.trim();
}
