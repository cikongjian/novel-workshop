import { resolveTopicBaselineGenre } from './topic-profiles.js';

export type Genre =
  | 'xuanhuan'
  | 'xianxia'
  | 'wuxia'
  | 'qihuan'
  | 'dushi'
  | 'yanqing'
  | 'mouzhi'
  | 'tiyu'
  | 'kehuan'
  | 'lingyi'
  | 'lishi'
  | 'youxi'
  | 'default';

export interface GenreBaseline {
  genre: Genre;
  label: string;
  hook: {
    targetStrength: number;
    weakThreshold: number;
    mediumThreshold: number;
    strongThreshold: number;
    typeWeights: Record<string, number>;
  };
  cost: {
    combatIntensity: number;
    resourceConsumption: number;
  };
  dialogue: {
    minRatio: number;
    maxRatio: number;
    idealRatio: number;
  };
  pacing: {
    avgParagraphLength: number;
    descriptionRatio: number;
    actionRatio: number;
  };
}

export const GENRE_BASELINES: Record<Genre, GenreBaseline> = {
  default: {
    genre: 'default',
    label: '通用',
    hook: {
      targetStrength: 3,
      weakThreshold: 2,
      mediumThreshold: 5,
      strongThreshold: 8,
      typeWeights: { suspense: 1.0, danger: 1.0, anticipation: 1.0, twist: 1.0, emotion: 1.0 },
    },
    cost: {
      combatIntensity: 0.5,
      resourceConsumption: 0.5,
    },
    dialogue: {
      minRatio: 0.1,
      maxRatio: 0.55,
      idealRatio: 0.3,
    },
    pacing: {
      avgParagraphLength: 50,
      descriptionRatio: 0.35,
      actionRatio: 0.08,
    },
  },

  xuanhuan: {
    genre: 'xuanhuan',
    label: '玄幻',
    hook: {
      targetStrength: 4,
      weakThreshold: 2.5,
      mediumThreshold: 6,
      strongThreshold: 10,
      typeWeights: { suspense: 1.2, danger: 1.3, anticipation: 1.0, twist: 1.1, emotion: 0.8 },
    },
    cost: {
      combatIntensity: 0.8,
      resourceConsumption: 0.9,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.5,
      idealRatio: 0.25,
    },
    pacing: {
      avgParagraphLength: 45,
      descriptionRatio: 0.3,
      actionRatio: 0.15,
    },
  },

  xianxia: {
    genre: 'xianxia',
    label: '仙侠',
    hook: {
      targetStrength: 4,
      weakThreshold: 2.5,
      mediumThreshold: 6,
      strongThreshold: 10,
      typeWeights: { suspense: 1.1, danger: 1.2, anticipation: 1.2, twist: 1.2, emotion: 0.9 },
    },
    cost: {
      combatIntensity: 0.75,
      resourceConsumption: 0.95,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.5,
      idealRatio: 0.25,
    },
    pacing: {
      avgParagraphLength: 50,
      descriptionRatio: 0.35,
      actionRatio: 0.12,
    },
  },

  wuxia: {
    genre: 'wuxia',
    label: '武侠',
    hook: {
      targetStrength: 3.5,
      weakThreshold: 2,
      mediumThreshold: 5.5,
      strongThreshold: 9,
      typeWeights: { suspense: 1.0, danger: 1.3, anticipation: 0.9, twist: 1.1, emotion: 1.0 },
    },
    cost: {
      combatIntensity: 0.9,
      resourceConsumption: 0.5,
    },
    dialogue: {
      minRatio: 0.1,
      maxRatio: 0.5,
      idealRatio: 0.28,
    },
    pacing: {
      avgParagraphLength: 45,
      descriptionRatio: 0.3,
      actionRatio: 0.18,
    },
  },

  dushi: {
    genre: 'dushi',
    label: '都市',
    hook: {
      targetStrength: 3,
      weakThreshold: 1.8,
      mediumThreshold: 4.5,
      strongThreshold: 7.5,
      typeWeights: { suspense: 0.9, danger: 0.8, anticipation: 1.2, twist: 1.0, emotion: 1.3 },
    },
    cost: {
      combatIntensity: 0.3,
      resourceConsumption: 0.4,
    },
    dialogue: {
      minRatio: 0.12,
      maxRatio: 0.6,
      idealRatio: 0.35,
    },
    pacing: {
      avgParagraphLength: 40,
      descriptionRatio: 0.25,
      actionRatio: 0.08,
    },
  },

  yanqing: {
    genre: 'yanqing',
    label: '言情',
    hook: {
      targetStrength: 3.5,
      weakThreshold: 2,
      mediumThreshold: 5,
      strongThreshold: 8,
      typeWeights: { suspense: 0.8, danger: 0.6, anticipation: 1.2, twist: 1.0, emotion: 1.5 },
    },
    cost: {
      combatIntensity: 0.2,
      resourceConsumption: 0.3,
    },
    dialogue: {
      minRatio: 0.2,
      maxRatio: 0.65,
      idealRatio: 0.4,
    },
    pacing: {
      avgParagraphLength: 35,
      descriptionRatio: 0.25,
      actionRatio: 0.05,
    },
  },

  mouzhi: {
    genre: 'mouzhi',
    label: '权谋',
    hook: {
      targetStrength: 4,
      weakThreshold: 2.5,
      mediumThreshold: 6,
      strongThreshold: 10,
      typeWeights: { suspense: 1.5, danger: 1.0, anticipation: 1.2, twist: 1.4, emotion: 0.7 },
    },
    cost: {
      combatIntensity: 0.4,
      resourceConsumption: 0.7,
    },
    dialogue: {
      minRatio: 0.1,
      maxRatio: 0.5,
      idealRatio: 0.25,
    },
    pacing: {
      avgParagraphLength: 50,
      descriptionRatio: 0.4,
      actionRatio: 0.06,
    },
  },

  tiyu: {
    genre: 'tiyu',
    label: '体育竞技',
    hook: {
      targetStrength: 3.5,
      weakThreshold: 2,
      mediumThreshold: 5.5,
      strongThreshold: 9,
      typeWeights: { suspense: 0.9, danger: 0.8, anticipation: 1.4, twist: 1.1, emotion: 1.0 },
    },
    cost: {
      combatIntensity: 0.6,
      resourceConsumption: 0.3,
    },
    dialogue: {
      minRatio: 0.05,
      maxRatio: 0.4,
      idealRatio: 0.15,
    },
    pacing: {
      avgParagraphLength: 35,
      descriptionRatio: 0.2,
      actionRatio: 0.25,
    },
  },

  kehuan: {
    genre: 'kehuan',
    label: '科幻',
    hook: {
      targetStrength: 4,
      weakThreshold: 2.5,
      mediumThreshold: 6,
      strongThreshold: 10,
      typeWeights: { suspense: 1.4, danger: 1.1, anticipation: 1.2, twist: 1.3, emotion: 0.8 },
    },
    cost: {
      combatIntensity: 0.5,
      resourceConsumption: 0.6,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.5,
      idealRatio: 0.25,
    },
    pacing: {
      avgParagraphLength: 55,
      descriptionRatio: 0.4,
      actionRatio: 0.1,
    },
  },

  lingyi: {
    genre: 'lingyi',
    label: '灵异',
    hook: {
      targetStrength: 4.5,
      weakThreshold: 3,
      mediumThreshold: 7,
      strongThreshold: 11,
      typeWeights: { suspense: 1.5, danger: 1.4, anticipation: 1.0, twist: 1.2, emotion: 1.1 },
    },
    cost: {
      combatIntensity: 0.3,
      resourceConsumption: 0.3,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.45,
      idealRatio: 0.22,
    },
    pacing: {
      avgParagraphLength: 40,
      descriptionRatio: 0.35,
      actionRatio: 0.06,
    },
  },

  lishi: {
    genre: 'lishi',
    label: '历史',
    hook: {
      targetStrength: 3.5,
      weakThreshold: 2,
      mediumThreshold: 5.5,
      strongThreshold: 9,
      typeWeights: { suspense: 1.2, danger: 1.0, anticipation: 1.1, twist: 1.2, emotion: 0.9 },
    },
    cost: {
      combatIntensity: 0.5,
      resourceConsumption: 0.6,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.5,
      idealRatio: 0.25,
    },
    pacing: {
      avgParagraphLength: 60,
      descriptionRatio: 0.4,
      actionRatio: 0.08,
    },
  },

  youxi: {
    genre: 'youxi',
    label: '游戏',
    hook: {
      targetStrength: 3.5,
      weakThreshold: 2,
      mediumThreshold: 5.5,
      strongThreshold: 9,
      typeWeights: { suspense: 1.1, danger: 1.1, anticipation: 1.3, twist: 1.1, emotion: 0.8 },
    },
    cost: {
      combatIntensity: 0.7,
      resourceConsumption: 0.8,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.5,
      idealRatio: 0.22,
    },
    pacing: {
      avgParagraphLength: 40,
      descriptionRatio: 0.25,
      actionRatio: 0.15,
    },
  },

  qihuan: {
    genre: 'qihuan',
    label: '奇幻',
    hook: {
      targetStrength: 4,
      weakThreshold: 2.5,
      mediumThreshold: 6,
      strongThreshold: 10,
      typeWeights: { suspense: 1.2, danger: 1.2, anticipation: 1.1, twist: 1.2, emotion: 0.9 },
    },
    cost: {
      combatIntensity: 0.7,
      resourceConsumption: 0.7,
    },
    dialogue: {
      minRatio: 0.08,
      maxRatio: 0.5,
      idealRatio: 0.25,
    },
    pacing: {
      avgParagraphLength: 50,
      descriptionRatio: 0.35,
      actionRatio: 0.12,
    },
  },
};

function isGenre(value: string): value is Genre {
  return value in GENRE_BASELINES;
}

function normalizeGenreKey(genre: string): Genre {
  const cleaned = (genre ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (isGenre(cleaned)) return cleaned;
  const topicGenre = resolveTopicBaselineGenre(genre);
  if (topicGenre && isGenre(topicGenre)) return topicGenre;
  if (/玄幻|xuanhuan/.test(genre)) return 'xuanhuan';
  if (/仙侠|修仙|xianxia/.test(genre)) return 'xianxia';
  if (/武侠|wuxia/.test(genre)) return 'wuxia';
  if (/奇幻|fantasy|qihuan/.test(genre)) return 'qihuan';
  if (/都市|现代|urban|modern|dushi/.test(genre)) return 'dushi';
  if (/言情|甜宠|romance|yanqing/.test(genre)) return 'yanqing';
  if (/权谋|朝堂|mouzhi/.test(genre)) return 'mouzhi';
  if (/体育|竞技|sports|tiyu/.test(genre)) return 'tiyu';
  if (/科幻|硬科幻|scifi|sci-fi|kehuan/.test(genre)) return 'kehuan';
  if (/灵异|恐怖|horror|lingyi/.test(genre)) return 'lingyi';
  if (/历史|架空|historical|history|lishi/.test(genre)) return 'lishi';
  if (/游戏|game|youxi/.test(genre)) return 'youxi';
  return 'default';
}

export function getGenreBaseline(genre: string): GenreBaseline {
  const g = normalizeGenreKey(genre);
  return GENRE_BASELINES[g] || GENRE_BASELINES.default;
}

export function getAllGenres(): Array<{ genre: Genre; label: string }> {
  return Object.values(GENRE_BASELINES).map(b => ({ genre: b.genre, label: b.label }));
}
