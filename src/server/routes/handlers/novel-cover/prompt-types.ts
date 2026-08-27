import type {
  CharacterProfile,
  NovelGenre,
  NovelMetadata,
  OutlineData,
} from '../../../../novel/types.js';

export type CoverPromptSource = 'ai' | 'template' | 'manual';

export type CoverPromptPayload = {
  positivePrompt: string;
  negativePrompt: string;
  promptSource: CoverPromptSource;
  contextSummary: string;
  recommendedSize: string;
};

export type CoverPromptContext = {
  novel: NovelMetadata;
  characters: CharacterProfile[];
  outline?: OutlineData;
};

export const DEFAULT_COVER_SIZE = '832x1216';

export const DEFAULT_NEGATIVE_PROMPT = [
  '低质量',
  '模糊',
  '糟糕的人体结构',
  '多余手指',
  '变形的手',
  '水印',
  'logo',
  '裁切的脸',
  '重复的主体',
];

export const TEXT_NEGATIVE_TERMS = ['文字', '字母', '排版'];

export function buildDefaultNegativePrompt(generateText?: boolean): string[] {
  const base = [...DEFAULT_NEGATIVE_PROMPT];
  if (!generateText) {
    base.push(...TEXT_NEGATIVE_TERMS);
  }
  return base;
}

export const COVER_PROMPT_SYSTEM = `你是一个专业的小说封面提示词工程师。
只返回合法的 JSON，格式如下：
{"positivePrompt":"...","negativePrompt":"..."}

正向提示词要求：
- 全部使用中文描述，不要混入任何英文单词
- 商业小说封面插画
- 竖版 2:3 构图
- 单一视觉焦点，轮廓清晰可读
- 上方三分之一留出标题安全区
- 要体现题材、调性、主角气场、冲突感，以及一个象征物
- 电影级光影，精致细节，无UI，无分屏

负向提示词要求：
- 全部使用中文，逗号分隔的短语
- 必须包含：低质量、模糊、糟糕的人体结构、多余手指、水印、logo

不要添加 markdown 代码块或解释。`;

export type { CoverStyleOverrides } from './cover-style-options.js';

export const GENRE_PRESETS: Record<NovelGenre, {
  genreLabel: string;
  visualStyle: string;
  palette: string;
  lighting: string;
  motif: string;
}> = {
  fantasy: {
    genreLabel: '史诗玄幻',
    visualStyle: '华丽电影级奇幻插画',
    palette: '深青色、金色、余烬橙、月夜蓝',
    lighting: '戏剧性的魔法轮廓光',
    motif: '古老符印与神秘能量',
  },
  mystery: {
    genreLabel: '悬疑惊悚',
    visualStyle: '阴郁悬疑封面插画',
    palette: '冷蓝、炭灰、病态琥珀',
    lighting: '黑色电影对比光',
    motif: '线索、阴影、破碎的倒影',
  },
  modern: {
    genreLabel: '都市情感',
    visualStyle: '风格化当代封面插画',
    palette: '霓虹城市光、钢铁灰、温暖肤色',
    lighting: '雨夜电影感灯光',
    motif: '城市天际线、玻璃倒影、情感张力',
  },
  scifi: {
    genreLabel: '科幻未来',
    visualStyle: '高端科幻封面插画',
    palette: '电光青、石墨色、银色、等离子橙',
    lighting: '立体感未来灯光',
    motif: '先进科技、宇宙尺度、简洁界面',
  },
  historical: {
    genreLabel: '历史正剧',
    visualStyle: '典雅年代剧封面绘画',
    palette: '墨黑、朱砂红、翡翠绿、陈年宣纸色',
    lighting: '柔和定向年代光',
    motif: '礼器、宫殿建筑、历史厚重感',
  },
  romance: {
    genreLabel: '浪漫言情',
    visualStyle: '华丽情感封面插画',
    palette: '玫瑰粉、象牙白、暮光蓝、暖金色',
    lighting: '柔美电影感辉光',
    motif: '亲密感、思念、象征性的花或信物',
  },
  custom: {
    genreLabel: '商业小说',
    visualStyle: '精品插画书籍封面',
    palette: '均衡电影感调色',
    lighting: '戏剧性精致光效',
    motif: '一个与故事相关的象征性中心物体',
  },
};
