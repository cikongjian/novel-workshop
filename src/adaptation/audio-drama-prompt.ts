import type { NovelGenre } from '../novel/types.js';

type AudioDramaRewriteLevel = 'conservative' | 'balanced' | 'dramatic';
type AudioDramaDialogueIntensity = 'low' | 'medium' | 'high';

export type AudioDramaPromptProfile = {
  genre: NovelGenre | 'unknown';
  genreLabel: string;
  styleTag: string;
  promptVersion: 'v1';
};

type GenrePromptPreset = {
  label: string;
  styleTag: string;
  rules: string[];
};

const DEFAULT_PRESET: GenrePromptPreset = {
  label: '通用',
  styleTag: 'general-story',
  rules: [
    '优先保留章节关键事件与推进顺序。',
    '对白要服务冲突与动机，不要空泛寒暄。',
    '台词短句优先，单句尽量不超过25字。',
  ],
};

const GENRE_PRESETS: Record<NovelGenre, GenrePromptPreset> = {
  fantasy: {
    label: '玄幻/奇幻',
    styleTag: 'fantasy-epic',
    rules: [
      '台词中适度体现世界观术语，但避免堆砌设定名词。',
      '强调宿命、代价、力量边界等冲突感。',
      '关键对白保持古风或庄重语感，但不要过度文白夹杂。',
    ],
  },
  mystery: {
    label: '悬疑/推理',
    styleTag: 'mystery-thriller',
    rules: [
      '对白要制造信息差与试探感，避免一次性说透。',
      '优先使用可验证细节，减少抽象情绪空话。',
      '节奏上保留留白与停顿，让听众有推理空间。',
    ],
  },
  modern: {
    label: '都市/现代',
    styleTag: 'modern-drama',
    rules: [
      '语言口语化、生活化，避免过度书面表达。',
      '冲突聚焦关系与现实压力（职场、家庭、选择）。',
      '对白应贴近真实交流节奏，减少长段独白。',
    ],
  },
  scifi: {
    label: '科幻',
    styleTag: 'sci-fi-cinematic',
    rules: [
      '技术名词应简洁可听懂，必要时用一句解释。',
      '对话体现任务目标、系统约束与风险判断。',
      '情绪与理性并行，避免只讲设定不讲人。',
    ],
  },
  historical: {
    label: '历史',
    styleTag: 'historical-serious',
    rules: [
      '用词尽量符合时代语感，避免现代网络语。',
      '人物立场应体现身份、礼制与时代压力。',
      '保留历史事件逻辑，不制造穿越式认知。',
    ],
  },
  romance: {
    label: '言情',
    styleTag: 'romance-emotional',
    rules: [
      '对白强调情绪拉扯、误解与关系推进。',
      '冲突不只靠吵架，加入克制和试探。',
      '关键台词要有记忆点，但避免滥用鸡汤句式。',
    ],
  },
  custom: {
    label: '自定义',
    styleTag: 'custom-hybrid',
    rules: [
      '在保证剧情不偏航的前提下突出作品独特语感。',
      '对白围绕角色目标，不要偏离当前场景任务。',
      '避免模板化句式，保留原作个性。',
    ],
  },
};

function resolvePreset(genre?: string): { genre: NovelGenre | 'unknown'; preset: GenrePromptPreset } {
  if (!genre) {
    return { genre: 'unknown', preset: DEFAULT_PRESET };
  }
  if (genre in GENRE_PRESETS) {
    const key = genre as NovelGenre;
    return { genre: key, preset: GENRE_PRESETS[key] };
  }
  return { genre: 'unknown', preset: DEFAULT_PRESET };
}

function buildRewriteLevelHint(level: AudioDramaRewriteLevel): string {
  if (level === 'conservative') {
    return '改写力度=保守：只做轻度对白增强，尽量贴近原文句意。';
  }
  if (level === 'dramatic') {
    return '改写力度=戏剧化：允许提高冲突强度与情绪张力，但不改变关键事件。';
  }
  return '改写力度=平衡：在忠实原文与可听性之间取中间值。';
}

function buildDialogueIntensityHint(intensity: AudioDramaDialogueIntensity): string {
  if (intensity === 'low') return '对白密度=低：保留更多叙述信息，适度增加对白。';
  if (intensity === 'high') return '对白密度=高：优先将可转化叙述改成角色互动对白。';
  return '对白密度=中：旁白与对白平衡。';
}

export function buildAudioDramaPromptPack(params: {
  genre?: string;
  rewriteLevel: AudioDramaRewriteLevel;
  dialogueIntensity: AudioDramaDialogueIntensity;
}): {
  profile: AudioDramaPromptProfile;
  lines: string[];
} {
  const { genre, preset } = resolvePreset(params.genre);
  const profile: AudioDramaPromptProfile = {
    genre,
    genreLabel: preset.label,
    styleTag: preset.styleTag,
    promptVersion: 'v1',
  };

  const lines: string[] = [
    `题材风格：${preset.label}（${preset.styleTag}）`,
    buildRewriteLevelHint(params.rewriteLevel),
    buildDialogueIntensityHint(params.dialogueIntensity),
    '题材规则：',
    ...preset.rules.map((rule) => `- ${rule}`),
  ];

  return { profile, lines };
}
