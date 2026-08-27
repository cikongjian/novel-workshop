/**
 * 场景类型分类器（纯规则实现，不调用 LLM）。
 *
 * 用途：识别章节中每一段的场景类型，让套路化检测器、节奏分析器等可以
 * 按场景类型分别统计——战斗场景的"握拳+呼吸一滞"是套路，告别场景的
 * "眼眶微红"也是套路，但它们不应该跨场景比较。
 *
 * 8 种场景类型：
 * - combat      战斗场景（动作词密度高）
 * - dialogue    对话场景（对话标点占比高，动作描写少）
 * - reflection  内心独白（心理活动词，对话少）
 * - farewell    告别场景（离开/分别类词）
 * - encounter   相遇场景（遇见/出现类词）
 * - description 环境描写（环境词密度高）
 * - tension     紧张对峙（对峙/沉默/压迫类词）
 * - narrative   叙事过渡（以上都不符合的纯叙事推进）
 *
 * 分类逻辑：
 * 1. 对每个段落计算各场景的匹配分数（密度或占比）
 * 2. 在达到各自阈值的场景中，取分数最高的场景类型
 * 3. 若所有场景分数均低于阈值，归为 narrative
 */

export type SceneType =
  | 'combat'
  | 'dialogue'
  | 'reflection'
  | 'farewell'
  | 'encounter'
  | 'description'
  | 'tension'
  | 'narrative';

export type SceneSegment = {
  sceneType: SceneType;
  startParagraph: number;
  endParagraph: number;
  text: string;
};

export type ChapterSceneProfile = {
  segments: SceneSegment[];
  /** 各场景在章节中的字符占比（0-1） */
  sceneDistribution: Record<SceneType, number>;
  dominantScene: SceneType;
  /** 场景切换次数（相邻段落的场景类型变化次数） */
  transitionCount: number;
};

/** 对话标点配对："" 「」 『』 */
const DIALOGUE_PAIR_RE =
  /\u201c[\s\S]*?\u201d|\u300c[\s\S]*?\u300d|\u300e[\s\S]*?\u300f/g;

/** 各场景关键词（dialogue 走对话标点占比路径，无关键词） */
const SCENE_KEYWORDS: Record<Exclude<SceneType, 'narrative' | 'dialogue'>, string[]> = {
  combat: ['拳', '掌', '剑', '刀', '枪', '踢', '打', '攻', '防', '闪', '避', '冲', '杀'],
  reflection: ['想', '觉得', '认为', '思索', '回忆', '不禁'],
  farewell: ['离开', '再见', '走了', '远去', '消失', '分别', '告别', '不舍'],
  encounter: ['遇见', '看到', '出现', '走来', '迎面', '碰见', '相遇'],
  description: ['阳光', '月光', '风', '雨', '雪', '雾', '天空', '大地', '山', '水'],
  tension: ['盯着', '对峙', '僵持', '沉默', '气氛', '压迫', '危险', '杀意'],
};

/**
 * 各场景的密度阈值：
 * - combat / description：要求关键词饱和度高（避免零星词误判）
 * - dialogue：要求对话标点占比高
 * - reflection / farewell / encounter / tension：关键词出现即可命中
 */
const SCENE_DENSITY_THRESHOLD: Record<Exclude<SceneType, 'narrative'>, number> = {
  combat: 0.025,
  dialogue: 0.4,
  reflection: 0.012,
  farewell: 0.01,
  encounter: 0.012,
  description: 0.025,
  tension: 0.012,
};

const NON_NARRATIVE_SCENES: Exclude<SceneType, 'narrative'>[] = [
  'combat',
  'dialogue',
  'reflection',
  'farewell',
  'encounter',
  'description',
  'tension',
];

const ALL_SCENES: SceneType[] = [...NON_NARRATIVE_SCENES, 'narrative'];

/** 统计关键词在文本中的出现次数（按字符匹配，可重叠计算多次） */
function countKeywordOccurrences(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (kw.length === 0) continue;
    let idx = 0;
    while ((idx = text.indexOf(kw, idx)) !== -1) {
      count++;
      idx += kw.length;
    }
  }
  return count;
}

/** 计算关键词密度（出现次数 / 段落长度） */
function computeKeywordDensity(text: string, keywords: string[]): number {
  const len = text.length;
  if (len === 0) return 0;
  return countKeywordOccurrences(text, keywords) / len;
}

/** 计算对话标点字符占比 */
function computeDialogueDensity(text: string): number {
  const len = text.length;
  if (len === 0) return 0;
  const matches = text.match(DIALOGUE_PAIR_RE) || [];
  const dialogueChars = matches.reduce((sum, m) => sum + m.length, 0);
  return dialogueChars / len;
}

/** 计算段落在某场景下的分数 */
function computeSceneScore(
  text: string,
  scene: Exclude<SceneType, 'narrative'>,
): number {
  if (scene === 'dialogue') {
    return computeDialogueDensity(text);
  }
  return computeKeywordDensity(text, SCENE_KEYWORDS[scene]);
}

/**
 * 对单个段落分类。
 *
 * 在所有达到各自阈值的非 narrative 场景中，取分数最高者；
 * 若全部不达标，归为 narrative。
 */
export function classifyScene(paragraph: string): SceneType {
  const text = paragraph.trim();
  if (text.length === 0) return 'narrative';

  let bestScene: SceneType = 'narrative';
  let bestScore = 0;

  for (const scene of NON_NARRATIVE_SCENES) {
    const score = computeSceneScore(text, scene);
    const threshold = SCENE_DENSITY_THRESHOLD[scene];
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestScene = scene;
    }
  }

  return bestScene;
}

/** 按段落切分章节内容 */
function splitParagraphs(content: string): string[] {
  return content
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/** 创建初始全 0 的场景分布 */
function createEmptyDistribution(): Record<SceneType, number> {
  return {
    combat: 0,
    dialogue: 0,
    reflection: 0,
    farewell: 0,
    encounter: 0,
    description: 0,
    tension: 0,
    narrative: 0,
  };
}

/**
 * 分析整章场景分布。
 *
 * 1. 按段落切分章节
 * 2. 对每个段落分类
 * 3. 合并相邻同类型段落为 segment
 * 4. 按字符数计算各场景占比
 * 5. 取占比最高的场景为主导场景
 * 6. 切换次数 = segment 数 - 1
 */
export function analyzeChapterScenes(content: string): ChapterSceneProfile {
  const paragraphs = splitParagraphs(content);

  if (paragraphs.length === 0) {
    return {
      segments: [],
      sceneDistribution: createEmptyDistribution(),
      dominantScene: 'narrative',
      transitionCount: 0,
    };
  }

  const paragraphScenes: SceneType[] = paragraphs.map(p => classifyScene(p));

  // 合并相邻同类型段落为 segment
  const segments: SceneSegment[] = [];
  let currentType = paragraphScenes[0];
  let currentStart = 0;

  for (let i = 1; i < paragraphs.length; i++) {
    if (paragraphScenes[i] !== currentType) {
      segments.push({
        sceneType: currentType,
        startParagraph: currentStart,
        endParagraph: i - 1,
        text: paragraphs.slice(currentStart, i).join('\n'),
      });
      currentType = paragraphScenes[i];
      currentStart = i;
    }
  }
  segments.push({
    sceneType: currentType,
    startParagraph: currentStart,
    endParagraph: paragraphs.length - 1,
    text: paragraphs.slice(currentStart).join('\n'),
  });

  // 按字符数计算场景分布占比
  const distribution = createEmptyDistribution();
  let totalChars = 0;
  for (const seg of segments) {
    const segChars = seg.text.length;
    distribution[seg.sceneType] += segChars;
    totalChars += segChars;
  }
  if (totalChars > 0) {
    for (const scene of ALL_SCENES) {
      distribution[scene] = Number((distribution[scene] / totalChars).toFixed(4));
    }
  }

  // 主导场景：占比最高者（并列时取遍历顺序中先到的，narrative 放最后兜底）
  let dominantScene: SceneType = 'narrative';
  let maxRatio = -1;
  for (const scene of ALL_SCENES) {
    if (distribution[scene] > maxRatio) {
      maxRatio = distribution[scene];
      dominantScene = scene;
    }
  }

  const transitionCount = Math.max(0, segments.length - 1);

  return {
    segments,
    sceneDistribution: distribution,
    dominantScene,
    transitionCount,
  };
}

/**
 * 获取章节主导场景类型（便捷封装）。
 */
export function getDominantScene(content: string): SceneType {
  return analyzeChapterScenes(content).dominantScene;
}
