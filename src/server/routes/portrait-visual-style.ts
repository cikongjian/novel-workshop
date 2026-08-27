import type { PortraitEraKey } from './portrait-style-shared.js';

// ==================== 视觉画风类型 ====================

export type PortraitVisualStyleKey =
  | 'cinematic-realistic'
  | 'ink-wash'
  | 'anime'
  | 'concept-art'
  | '3d-render'
  | 'ethereal-illustration'
  | 'chibi'
  | 'oil-painting'
  | 'watercolor'
  | 'pixel-art'
  | 'comic-pop'
  | 'ukiyo-e'
  | 'dark-fantasy'
  | 'gouache-illustration';

export type PortraitVisualStyleRule = {
  key: PortraitVisualStyleKey;
  label: string;
  summary: string;
  /** 注入正向提示词的前置风格锚点 */
  styleAnchor: string;
  /** 注入正向提示词的后置风格锚点 */
  tailAnchor: string;
  /** 按画风追加的负面提示词 */
  negativeKeywords: string[];
  /** 按画风特有的提示词工程师约束（用于 AI system prompt） */
  aiConstraint: string;
};

export const VISUAL_STYLE_RULES: PortraitVisualStyleRule[] = [
  {
    key: 'cinematic-realistic',
    label: '写实电影',
    summary: '电影级写实光影',
    styleAnchor: 'photorealistic portrait, cinematic lighting, hyperdetailed, 8k masterpiece, professional character design',
    tailAnchor: 'cinematic portrait composition, dramatic atmosphere',
    negativeKeywords: ['anime', 'cartoon', 'chibi', 'stylized', 'flat color'],
    aiConstraint: '必须使用电影级写实风格，避免卡通化、平面化处理。',
  },
  {
    key: 'ink-wash',
    label: '水墨丹青',
    summary: '传统水墨写意',
    styleAnchor: 'traditional Chinese ink wash painting, sumi-e aesthetic, flowing brushwork, minimalist elegance, ink gradients on rice paper, negative space composition',
    tailAnchor: 'graceful ink painting atmosphere, poetic simplicity',
    negativeKeywords: ['photorealistic', '3D render', 'Western oil painting', 'oversaturated', 'sharp digital edges'],
    aiConstraint: '必须使用中国传统水墨画风格，强调写意、留白和墨色浓淡变化。',
  },
  {
    key: 'anime',
    label: '二次元动漫',
    summary: '日系动画插画',
    styleAnchor: 'anime style illustration, manga aesthetic, cel shading, clean line art, expressive large eyes, vibrant flat colors, Japanese animation visual language',
    tailAnchor: 'anime key visual composition, dynamic framing',
    negativeKeywords: ['photorealistic', '3D render', 'oil painting texture', 'hyperrealistic skin'],
    aiConstraint: '必须使用日系动漫/漫画插画风格，采用赛璐璐上色和清晰线条。',
  },
  {
    key: 'concept-art',
    label: '概念厚涂',
    summary: '半写实游戏原画',
    styleAnchor: 'digital painting, semi-realistic concept art, thick brushstrokes, dramatic rim lighting, painterly texture, game character design, ArtStation quality',
    tailAnchor: 'concept art composition, professional game illustration',
    negativeKeywords: ['photorealistic', 'flat color', 'cel shading', 'simple linework'],
    aiConstraint: '必须使用半写实数字厚涂风格，带有明显的笔触质感和游戏原画气质。',
  },
  {
    key: '3d-render',
    label: '3D渲染',
    summary: '三维CG质感',
    styleAnchor: '3D render, octane render quality, volumetric lighting, subsurface scattering, realistic depth of field, CGI character, blender style, PBR materials',
    tailAnchor: '3D character showcase, studio lighting setup',
    negativeKeywords: ['2D', 'flat illustration', 'watercolor', 'sketch', 'cartoon', 'anime style'],
    aiConstraint: '必须使用3D渲染质感，强调体积、材质和真实光照。',
  },
  {
    key: 'ethereal-illustration',
    label: '唯美插画',
    summary: '柔光氛围插画',
    styleAnchor: 'ethereal illustration, soft dreamlike lighting, delicate linework, pastel color palette, romantic atmosphere, webtoon style, graceful flowing details, sparkling light particles',
    tailAnchor: 'dreamy portrait composition, gentle bokeh background',
    negativeKeywords: ['harsh lighting', 'dark gritty', 'horror', 'photorealistic skin texture', 'sharp contrast'],
    aiConstraint: '必须使用唯美柔和插画风格，强调梦幻光影和精致细腻的上色。',
  },
  {
    key: 'chibi',
    label: 'Q版萌系',
    summary: '大头小身可爱风',
    styleAnchor: 'chibi style illustration, super deformed proportions, big head small body, kawaii aesthetic, adorable expression, toy-like design, cheerful bright colors, cute rounded shapes',
    tailAnchor: 'cute chibi character showcase, playful composition',
    negativeKeywords: ['photorealistic', 'realistic proportions', 'mature', 'serious', 'dark atmosphere', 'horror'],
    aiConstraint: '必须使用Q版萌系大头小身比例，强调可爱、圆润、明亮的视觉感受。',
  },
  {
    key: 'oil-painting',
    label: '古典油画',
    summary: '西方古典油画质感',
    styleAnchor: 'classical oil painting, baroque chiaroscuro lighting, rembrandt-style brushwork, rich impasto texture, old master aesthetic, warm earthy palette, gallery-quality canvas surface',
    tailAnchor: 'museum oil painting composition, dramatic old-master lighting',
    negativeKeywords: ['anime', 'cel shading', 'flat color', 'digital clean look', 'pixel art', 'watercolor'],
    aiConstraint: '必须使用西方古典油画风格，强调明暗对比（chiaroscuro）、厚涂笔触和画廊级质感。',
  },
  {
    key: 'watercolor',
    label: '水彩绘本',
    summary: '清新水彩晕染',
    styleAnchor: 'watercolor illustration, soft wet-on-wet washes, delicate color bleeding, paper grain texture, light translucent layers, gentle gradient blends, storybook aesthetic',
    tailAnchor: 'watercolor portrait composition, airy and fresh atmosphere',
    negativeKeywords: ['oil painting texture', '3D render', 'sharp digital edges', 'heavy impasto', 'photorealistic'],
    aiConstraint: '必须使用水彩插画风格，强调透明晕染、纸张纹理和柔和的色彩扩散。',
  },
  {
    key: 'pixel-art',
    label: '像素艺术',
    summary: '复古像素游戏风',
    styleAnchor: 'pixel art illustration, limited color palette, crisp pixel-level detail, retro 16-bit game aesthetic, dithering shading, clean sprite design, nostalgic video game visual',
    tailAnchor: 'pixel art character portrait, retro game composition',
    negativeKeywords: ['photorealistic', 'smooth gradients', '3D render', 'oil painting', 'high-res detail'],
    aiConstraint: '必须使用像素艺术风格，有限调色板、清晰像素颗粒、复古游戏质感。',
  },
  {
    key: 'comic-pop',
    label: '美漫波普',
    summary: '美式漫画波普风',
    styleAnchor: 'american comic book style, bold ink outlines, ben-day dots pop art, dynamic halftone shading, vibrant saturated colors, graphic novel aesthetic, heavy black shadows, comic cover composition',
    tailAnchor: 'comic book character portrait, pop-art graphic composition',
    negativeKeywords: ['photorealistic', 'watercolor', 'soft pastel', 'minimalist line', 'anime cel shading'],
    aiConstraint: '必须使用美式漫画/波普艺术风格，粗黑线条、半调网点、高饱和色块。',
  },
  {
    key: 'ukiyo-e',
    label: '浮世绘',
    summary: '日式木版画',
    styleAnchor: 'ukiyo-e woodblock print, traditional japanese illustration, flat color regions, bold black outlines, wave and nature motifs, edo-period aesthetic, washi paper texture, muted traditional palette',
    tailAnchor: 'ukiyo-e portrait composition, edo woodblock atmosphere',
    negativeKeywords: ['photorealistic', '3D render', 'western oil painting', 'anime cel shading', 'digital smooth shading'],
    aiConstraint: '必须使用日本浮世绘木版画风格，平面色块、粗线勾勒、江户时代传统配色。',
  },
  {
    key: 'dark-fantasy',
    label: '暗黑奇幻',
    summary: '暗调哥特奇幻',
    styleAnchor: 'dark fantasy illustration, gothic atmosphere, muted desaturated palette, deep shadows, dramatic candlelight, intricate grim details, occult symbolism, bloodborne-style aesthetic, weathered textures',
    tailAnchor: 'dark fantasy portrait composition, ominous gothic mood',
    negativeKeywords: ['bright cheerful', 'pastel colors', 'chibi', 'flat bright lighting', 'clean modern'],
    aiConstraint: '必须使用暗黑奇幻风格，低饱和暗色调、哥特氛围、戏剧性烛光和阴郁细节。',
  },
  {
    key: 'gouache-illustration',
    label: '水粉插画',
    summary: '厚重水粉复古插画',
    styleAnchor: 'gouache illustration, matte opaque water-based paint, rich flat color blocks, vintage poster aesthetic, textured brush strokes, mid-century illustration style, warm retro palette',
    tailAnchor: 'gouache portrait composition, vintage illustration mood',
    negativeKeywords: ['photorealistic', '3D render', 'anime cel shading', 'transparent watercolor washes', 'pixel art'],
    aiConstraint: '必须使用水粉插画风格，不透明厚涂色块、复古海报质感、中世纪插画配色。',
  },
];

/** 画风 → 时代兼容推荐度：'strong' 强烈推荐 | 'ok' 可选 | 'weak' 不推荐 */
type VisualStyleEraCompatibility = Record<PortraitVisualStyleKey, Record<PortraitEraKey, 'strong' | 'ok' | 'weak'>>;

export const VISUAL_STYLE_ERA_COMPAT: VisualStyleEraCompatibility = {
  'cinematic-realistic': {
    'cn-imperial': 'strong', 'cn-fantasy': 'ok', 'modern-urban': 'strong', 'sci-fi': 'ok',
    'western-medieval': 'strong', 'western-antiquity': 'strong', 'ancient-myth': 'ok',
    'japanese-feudal': 'strong', 'post-apocalyptic': 'strong', 'generic-novel': 'strong',
  },
  'ink-wash': {
    'cn-imperial': 'strong', 'cn-fantasy': 'strong', 'modern-urban': 'weak', 'sci-fi': 'weak',
    'western-medieval': 'weak', 'western-antiquity': 'weak', 'ancient-myth': 'strong',
    'japanese-feudal': 'weak', 'post-apocalyptic': 'weak', 'generic-novel': 'ok',
  },
  'anime': {
    'cn-imperial': 'ok', 'cn-fantasy': 'ok', 'modern-urban': 'ok', 'sci-fi': 'ok',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'ok',
    'japanese-feudal': 'strong', 'post-apocalyptic': 'ok', 'generic-novel': 'strong',
  },
  'concept-art': {
    'cn-imperial': 'ok', 'cn-fantasy': 'strong', 'modern-urban': 'ok', 'sci-fi': 'strong',
    'western-medieval': 'strong', 'western-antiquity': 'strong', 'ancient-myth': 'strong',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'strong', 'generic-novel': 'strong',
  },
  '3d-render': {
    'cn-imperial': 'weak', 'cn-fantasy': 'ok', 'modern-urban': 'strong', 'sci-fi': 'strong',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'ok',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'strong', 'generic-novel': 'ok',
  },
  'ethereal-illustration': {
    'cn-imperial': 'strong', 'cn-fantasy': 'strong', 'modern-urban': 'ok', 'sci-fi': 'weak',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'strong',
    'japanese-feudal': 'strong', 'post-apocalyptic': 'weak', 'generic-novel': 'ok',
  },
  'chibi': {
    'cn-imperial': 'ok', 'cn-fantasy': 'ok', 'modern-urban': 'ok', 'sci-fi': 'ok',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'ok',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'ok', 'generic-novel': 'ok',
  },
  'oil-painting': {
    'cn-imperial': 'ok', 'cn-fantasy': 'ok', 'modern-urban': 'weak', 'sci-fi': 'weak',
    'western-medieval': 'strong', 'western-antiquity': 'strong', 'ancient-myth': 'strong',
    'japanese-feudal': 'weak', 'post-apocalyptic': 'weak', 'generic-novel': 'ok',
  },
  'watercolor': {
    'cn-imperial': 'ok', 'cn-fantasy': 'ok', 'modern-urban': 'ok', 'sci-fi': 'weak',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'ok',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'weak', 'generic-novel': 'ok',
  },
  'pixel-art': {
    'cn-imperial': 'weak', 'cn-fantasy': 'ok', 'modern-urban': 'ok', 'sci-fi': 'strong',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'ok',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'strong', 'generic-novel': 'ok',
  },
  'comic-pop': {
    'cn-imperial': 'weak', 'cn-fantasy': 'weak', 'modern-urban': 'strong', 'sci-fi': 'ok',
    'western-medieval': 'ok', 'western-antiquity': 'ok', 'ancient-myth': 'weak',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'strong', 'generic-novel': 'ok',
  },
  'ukiyo-e': {
    'cn-imperial': 'weak', 'cn-fantasy': 'ok', 'modern-urban': 'weak', 'sci-fi': 'weak',
    'western-medieval': 'weak', 'western-antiquity': 'weak', 'ancient-myth': 'ok',
    'japanese-feudal': 'strong', 'post-apocalyptic': 'weak', 'generic-novel': 'ok',
  },
  'dark-fantasy': {
    'cn-imperial': 'ok', 'cn-fantasy': 'strong', 'modern-urban': 'weak', 'sci-fi': 'ok',
    'western-medieval': 'strong', 'western-antiquity': 'ok', 'ancient-myth': 'strong',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'strong', 'generic-novel': 'ok',
  },
  'gouache-illustration': {
    'cn-imperial': 'ok', 'cn-fantasy': 'ok', 'modern-urban': 'ok', 'sci-fi': 'weak',
    'western-medieval': 'ok', 'western-antiquity': 'strong', 'ancient-myth': 'strong',
    'japanese-feudal': 'ok', 'post-apocalyptic': 'weak', 'generic-novel': 'ok',
  },
};

export function getVisualStyleRule(key: PortraitVisualStyleKey): PortraitVisualStyleRule {
  return VISUAL_STYLE_RULES.find(r => r.key === key) ?? VISUAL_STYLE_RULES[0];
}

export function getVisualStyleEraCompat(
  styleKey: PortraitVisualStyleKey,
  eraKey: PortraitEraKey,
): 'strong' | 'ok' | 'weak' {
  return VISUAL_STYLE_ERA_COMPAT[styleKey]?.[eraKey] ?? 'ok';
}

export function getRecommendedVisualStyles(eraKey: PortraitEraKey): PortraitVisualStyleKey[] {
  const all: PortraitVisualStyleKey[] = [
    'cinematic-realistic', 'ink-wash', 'anime', 'concept-art',
    '3d-render', 'ethereal-illustration', 'chibi',
    'oil-painting', 'watercolor', 'pixel-art', 'comic-pop',
    'ukiyo-e', 'dark-fantasy', 'gouache-illustration',
  ];
  return all.sort((a, b) => {
    const ca = getVisualStyleEraCompat(a, eraKey);
    const cb = getVisualStyleEraCompat(b, eraKey);
    const score = (k: 'strong' | 'ok' | 'weak') => k === 'strong' ? 2 : k === 'ok' ? 1 : 0;
    return score(cb) - score(ca);
  });
}
