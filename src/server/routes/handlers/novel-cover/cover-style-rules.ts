export type CoverVisualStyleKey =
  | 'cinematic-realistic'
  | 'ink-wash'
  | 'oil-painting'
  | 'anime'
  | 'concept-art'
  | 'dark-fantasy'
  | 'watercolor'
  | 'comic-pop'
  | 'vintage-poster'
  | 'ukiyo-e'
  | 'minimal-vector';

export type CoverFormatKey =
  | 'standard'
  | 'movie-poster'
  | 'editorial'
  | 'scroll-art'
  | 'triptych'
  | 'comic-cover'
  | 'tarot-card'
  | 'shadow-play'
  | 'stained-glass'
  | 'album-art';

export type CoverEraKey =
  | 'cn-imperial'
  | 'cn-fantasy'
  | 'western-medieval'
  | 'western-antiquity'
  | 'ancient-myth'
  | 'japanese-feudal'
  | 'modern-urban'
  | 'sci-fi'
  | 'post-apocalyptic';

export type CoverMoodKey =
  | 'warm-gold'
  | 'cool-noir'
  | 'vibrant-clash'
  | 'earthy-natural'
  | 'pastel-dream'
  | 'mono-ink'
  | 'royal-crimson'
  | 'ethereal-glow';

export interface CoverStyleOption {
  key: string;
  label: string;
}

export interface CoverVisualStyleOption extends CoverStyleOption {
  key: CoverVisualStyleKey;
  anchor: string;
}

export interface CoverFormatOption extends CoverStyleOption {
  key: CoverFormatKey;
  anchor: string;
}

export interface CoverEraOption extends CoverStyleOption {
  key: CoverEraKey;
  prompt: string;
}

export interface CoverMoodOption extends CoverStyleOption {
  key: CoverMoodKey;
  palette: string;
}

// ==================== 视觉画风规则 ====================

export const COVER_VISUAL_STYLE_RULES: CoverVisualStyleOption[] = [
  {
    key: 'cinematic-realistic',
    label: '写实电影',
    anchor: '电影级写实封面，真实光影质感，浅景深，镜头感渲染',
  },
  {
    key: 'ink-wash',
    label: '水墨意境',
    anchor: '中国水墨画风格，流动的笔触，宣纸纹理，简约留白构图',
  },
  {
    key: 'oil-painting',
    label: '古典油画',
    anchor: '古典油画质感，厚重的画布笔触，巴洛克明暗对比，画廊级品质',
  },
  {
    key: 'anime',
    label: '二次元插画',
    anchor: '日系动漫画风，平涂上色，明快的纯色块，干净的线稿，动态构图',
  },
  {
    key: 'concept-art',
    label: '概念厚涂',
    anchor: '高端概念原画，半写实厚涂，游戏美术品质，戏剧化氛围',
  },
  {
    key: 'dark-fantasy',
    label: '暗黑奇幻',
    anchor: '暗黑奇幻风封面，哥特氛围，低饱和度暗色调，阴郁戏剧光',
  },
  {
    key: 'watercolor',
    label: '水彩诗意',
    anchor: '水彩插画风格，柔和湿画晕染，水彩纸纹理，轻盈通透的情感表达',
  },
  {
    key: 'comic-pop',
    label: '漫画波普',
    anchor: '美式漫画封面，粗黑墨水轮廓线，本戴网点，高饱和鲜艳色块',
  },
  {
    key: 'vintage-poster',
    label: '复古海报',
    anchor: '复古海报艺术，世纪中期平面设计，柔和复古配色，丝印质感',
  },
  {
    key: 'ukiyo-e',
    label: '浮世绘',
    anchor: '日本浮世绘木版画，平面色块，粗轮廓线，和风传统美学，和纸质感',
  },
  {
    key: 'minimal-vector',
    label: '极简矢量',
    anchor: '极简矢量艺术，平面几何图形，大量留白，图标化的简约表达',
  },
];

// ==================== 呈现形式规则 ====================

export const COVER_FORMAT_RULES: CoverFormatOption[] = [
  {
    key: 'standard',
    label: '标准网文封面',
    anchor: '竖版 2:3 构图，一个主要视觉焦点，上方三分之一为标题安全区，清晰可读的轮廓',
  },
  {
    key: 'movie-poster',
    label: '电影海报',
    anchor: '电影海报构图，戏剧化的文案排版位，角色与场景层次均衡，宽银幕感',
  },
  {
    key: 'editorial',
    label: '出版精装',
    anchor: '精装书护封构图，克制的排版空间，优雅的留白，典藏版质感',
  },
  {
    key: 'scroll-art',
    label: '卷轴画',
    anchor: '古画卷轴构图，立轴或横卷布局，绢帛装裱质感，题跋盖章留白空间',
  },
  {
    key: 'triptych',
    label: '三联画',
    anchor: '三联画构图，三屏分割叙事，统一的视觉语言，祭坛画式框架',
  },
  {
    key: 'comic-cover',
    label: '漫画封面',
    anchor: '动态漫画封面构图，动作造型框架，醒目标题位置，期刊号角标',
  },
  {
    key: 'tarot-card',
    label: '塔罗牌',
    anchor: '塔罗牌构图，象征性边框与装饰，神秘学美学，仪式感布局',
  },
  {
    key: 'shadow-play',
    label: '皮影戏',
    anchor: '中国皮影戏美学，镂空剪影层次，暖黄背光，传统戏台框架感',
  },
  {
    key: 'stained-glass',
    label: '彩窗叙事',
    anchor: '教堂彩窗玻璃构图，铅条分割色块，透光彩色面板，哥特拱形框架',
  },
  {
    key: 'album-art',
    label: '专辑封面',
    anchor: '音乐专辑封面构图，标志性的极简中心符号，文化时代感情绪',
  },
];

// ==================== 年代氛围规则 ====================

export const COVER_ERA_RULES: CoverEraOption[] = [
  {
    key: 'cn-imperial',
    label: '中式王朝',
    prompt: '中国古代王朝背景，宫廷建筑，汉服丝绸，朱红与金色视觉体系',
  },
  {
    key: 'cn-fantasy',
    label: '仙侠玄幻',
    prompt: '仙侠修真世界观，悬空山岳，灵气流动，仙门美学，飘逸叠层衣袍',
  },
  {
    key: 'western-medieval',
    label: '西方中世纪',
    prompt: '欧洲中世纪背景，城堡尖塔，哥特教堂，封建纹章，骑士铠甲',
  },
  {
    key: 'western-antiquity',
    label: '古典古代',
    prompt: '古希腊罗马古典时代，大理石柱与神殿，披肩长袍，月桂花环',
  },
  {
    key: 'ancient-myth',
    label: '上古神话',
    prompt: '上古神话世界，部落图腾与符文，远古神祇图像，原始洪荒气势，元素之力',
  },
  {
    key: 'japanese-feudal',
    label: '日本幕府',
    prompt: '日本封建时代背景，武士铠甲，樱花，鸟居，江户木版画美学',
  },
  {
    key: 'modern-urban',
    label: '现代都市',
    prompt: '现代都市背景，霓虹灯光，玻璃摩天楼，雨夜反光街道，当代氛围',
  },
  {
    key: 'sci-fi',
    label: '科幻未来',
    prompt: '科幻未来世界，赛博朋克城景，全息投影，太空站，未来载具',
  },
  {
    key: 'post-apocalyptic',
    label: '末世废土',
    prompt: '末日废土背景，废墟城市，锈蚀金属结构，拾荒生存装备，崩塌的文明',
  },
];

// ==================== 色调情绪规则 ====================

export const COVER_MOOD_RULES: CoverMoodOption[] = [
  {
    key: 'warm-gold',
    label: '金秋暖阳',
    palette: '暖金色、琥珀色、陶土色、奶油色，柔和的橙色光晕',
  },
  {
    key: 'cool-noir',
    label: '冷蓝暗夜',
    palette: '冷海军蓝、石板蓝、银色、柔和青灰，深阴影',
  },
  {
    key: 'vibrant-clash',
    label: '霓虹对冲',
    palette: '霓虹洋红、电光青、酸性黄、深紫罗兰，高饱和度',
  },
  {
    key: 'earthy-natural',
    label: '大地自然',
    palette: '橄榄绿、锈棕色、沙色、苔绿色、树皮色，自然有机暖调',
  },
  {
    key: 'pastel-dream',
    label: '粉彩梦境',
    palette: '薰衣草紫、薄荷绿、蜜桃粉、婴儿蓝、柔和象牙白，柔美渐变',
  },
  {
    key: 'mono-ink',
    label: '水墨单色',
    palette: '墨黑、宣纸白、炭灰、陈年褐色，极简色彩',
  },
  {
    key: 'royal-crimson',
    label: '暗红宫廷',
    palette: '深绯红、暗金色、乌木色、天鹅绒酒红，帝王对比',
  },
  {
    key: 'ethereal-glow',
    label: '圣光空灵',
    palette: '珍珠白、淡金色、天蓝、柔和银色，发光的光晕感',
  },
];
