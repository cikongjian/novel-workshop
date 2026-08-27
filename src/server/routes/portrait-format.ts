import type { PortraitEraKey } from './portrait-style-shared.js';
import type { PortraitVisualStyleKey } from './portrait-visual-style.js';

// ==================== 立绘呈现形式类型 ====================

export type PortraitFormatKey =
  | 'standard'
  | 'tcg-card'
  | 'wanted-poster'
  | 'movie-poster'
  | 'classical-book'
  | 'tarot-card'
  | 'dramatic-silhouette'
  | 'heraldic-emblem'
  | 'phone-wallpaper'
  | 'bust-statue'
  | 'scroll-painting'
  | 'stamp-seal'
  | 'comic-cover'
  | 'album-card'
  | 'polaroid'
  | 'stained-glass'
  | 'character-sheet';

export type PortraitFormatRule = {
  key: PortraitFormatKey;
  label: string;
  summary: string;
  /** 注入正向提示词的形式锚点 */
  formatAnchor: string;
  /** 按形式追加的负面提示词 */
  negativeKeywords: string[];
  /** 按形式特有的提示词工程师约束 */
  aiConstraint: string;
};

export const FORMAT_RULES: PortraitFormatRule[] = [
  {
    key: 'standard',
    label: '标准立绘',
    summary: '干净半身像',
    formatAnchor: 'clean character portrait, half-body composition, simple neutral background, focus on character design',
    negativeKeywords: [],
    aiConstraint: '标准角色立绘，干净背景，半身构图。',
  },
  {
    key: 'tcg-card',
    label: '卡牌风',
    summary: '游戏抽卡质感',
    formatAnchor: 'trading card game character card, ornate decorative frame, star rarity border, elemental motif background, golden trim, collectible card aesthetic, character name plate, premium foil finish',
    negativeKeywords: ['photo frame', 'realistic photograph border'],
    aiConstraint: '必须呈现游戏抽卡角色卡牌的构图：角色居中、华丽装饰边框、星级标识、属性纹样背景、卡牌收藏质感。',
  },
  {
    key: 'wanted-poster',
    label: '通缉令风',
    summary: '悬赏令做旧质感',
    formatAnchor: 'wanted poster style, weathered parchment texture, bounty reward text, official red seal stamp, vintage document aesthetic, dramatic mugshot composition, aged paper edges, ink calligraphy title',
    negativeKeywords: ['clean modern', 'digital ui', 'sleek'],
    aiConstraint: '必须呈现悬赏令/通缉令的做旧纸张质感，包含红色印章、赏金标注和手写体标题。',
  },
  {
    key: 'movie-poster',
    label: '电影海报风',
    summary: '宣传海报构图',
    formatAnchor: 'movie poster composition, cinematic title overlay, dramatic spotlight, blockbuster promotional art, character showcase, film grain, credit text block, theatrical release design',
    negativeKeywords: ['simple background', 'minimalist'],
    aiConstraint: '必须呈现电影宣传海报构图，包含戏剧性标题、大块面光影和海报叙事感。',
  },
  {
    key: 'classical-book',
    label: '古籍绣像风',
    summary: '明清小说绣像',
    formatAnchor: 'classical Chinese book illustration, woodblock print aesthetic, character with poetic inscription, red seal chop, vintage paper background, Ming-Qing novel frontispiece style, traditional binding texture, vertical Chinese calligraphy',
    negativeKeywords: ['modern', 'digital', 'Western', '3D render'],
    aiConstraint: '必须呈现明清小说绣像/古籍木刻插图风格，人物旁配有诗词题跋和印章落款。',
  },
  {
    key: 'tarot-card',
    label: '塔罗牌风',
    summary: '塔罗牌构图',
    formatAnchor: 'tarot card composition, symmetrical ornamental border, Roman numerals, mystical arcane symbols, gilded frame, major arcana card design, celestial motifs, divine illustration style',
    negativeKeywords: ['casual', 'modern ui', 'simple'],
    aiConstraint: '必须呈现塔罗牌构图，上下对称装饰、罗马数字编号、神秘符号边框、镀金质感。',
  },
  {
    key: 'dramatic-silhouette',
    label: '剪影光影风',
    summary: '逆光氛围剪影',
    formatAnchor: 'dramatic silhouette portrait, strong rim lighting, atmospheric backlight, minimal facial detail, emphasis on outline and posture, cinematic noir, mysterious atmosphere, god rays, fog',
    negativeKeywords: ['detailed face', 'bright flat lighting', 'studio lighting'],
    aiConstraint: '必须呈现逆光剪影效果，强轮廓光、面部细节极少、强调姿态和氛围。',
  },
  {
    key: 'heraldic-emblem',
    label: '纹章风',
    summary: '家族徽章构图',
    formatAnchor: 'heraldic emblem composition, circular crest design, shield-shaped frame, house sigil elements, medieval coat of arms aesthetic, ornate filigree border, royal banner, family motto banner',
    negativeKeywords: ['modern', 'casual', 'minimalist'],
    aiConstraint: '必须呈现圆形/盾形纹章构图，包含家族徽章元素、华丽雕花边框和卷轴饰带。',
  },
  {
    key: 'phone-wallpaper',
    label: '手机壁纸风',
    summary: '竖屏满版壁纸',
    formatAnchor: 'vertical phone wallpaper composition, full body or half body with atmospheric background, decorative floating elements, soft vignette, aesthetic empty space, mobile screen friendly layout, dreamy scenery',
    negativeKeywords: ['square format', 'horizontal', 'white background'],
    aiConstraint: '必须呈现竖屏手机壁纸构图，角色+场景+装饰元素满版排列，顶部或底部适当留白。',
  },
  {
    key: 'bust-statue',
    label: '雕像胸像',
    summary: '大理石/青铜胸像',
    formatAnchor: 'classical bust statue composition, marble or bronze sculpture texture, pedestal base, museum lighting on sculpture, three-dimensional carved drapery, sculptural portrait bust, stone surface detail',
    negativeKeywords: ['flat illustration', '2D anime', 'watercolor wash', 'sketch line art'],
    aiConstraint: '必须呈现古典雕像胸像构图，大理石或青铜雕塑质感、底座、博物馆灯光打光。',
  },
  {
    key: 'scroll-painting',
    label: '卷轴画',
    summary: '横卷/立轴构图',
    formatAnchor: 'traditional scroll painting composition, vertical hanging scroll or horizontal handscroll format, silk or paper mounting, calligraphic inscription column, red seal stamps, unrolled scroll edges, classical asian painting layout',
    negativeKeywords: ['modern frame', 'digital ui', 'square crop', 'photo border'],
    aiConstraint: '必须呈现卷轴画构图，立轴或横卷形式、绢/纸装裱边、题跋落款和印章。',
  },
  {
    key: 'stamp-seal',
    label: '邮票印章',
    summary: '邮票/印章构图',
    formatAnchor: 'postage stamp design composition, perforated edges, engraved illustration style, denomination mark, postmark overlay, miniature collectible format, vintage postal aesthetic, circular seal stamp variant',
    negativeKeywords: ['large canvas', 'wide format', 'modern ui card'],
    aiConstraint: '必须呈现邮票/印章构图，齿孔边框、雕刻插画质感、面值标注和邮戳叠加。',
  },
  {
    key: 'comic-cover',
    label: '漫画封面',
    summary: '漫画书封面构图',
    formatAnchor: 'comic book cover composition, dynamic action pose framing, bold title logo placement, issue number badge, graphic panel layout, splash page artwork, vibrant cover design, barcode corner',
    negativeKeywords: ['minimalist', 'simple portrait', 'plain background'],
    aiConstraint: '必须呈现漫画书封面构图，动态姿势、粗体标题logo、期号标识和视觉冲击力构图。',
  },
  {
    key: 'album-card',
    label: '图鉴卡',
    summary: '人物图鉴卡',
    formatAnchor: 'character album card composition, encyclopedia profile layout, info stat panel, decorative frame border, character name plate, attribute icons, collection index number, illustrated reference card aesthetic',
    negativeKeywords: ['messy layout', 'no text space', 'full scene'],
    aiConstraint: '必须呈现人物图鉴卡构图，包含信息面板、属性图标、编号和装饰边框。',
  },
  {
    key: 'polaroid',
    label: '拍立得',
    summary: '拍立得照片质感',
    formatAnchor: 'polaroid instant photo composition, white bordered frame, slightly overexposed vintage color, handwritten caption space at bottom, casual snapshot framing, film grain, faded nostalgic tones, slight tilt',
    negativeKeywords: ['digital crisp', 'studio lighting', 'formal portrait'],
    aiConstraint: '必须呈现拍立得照片构图，白边相框、偏色复古色调、底部手写区、随性快照感。',
  },
  {
    key: 'stained-glass',
    label: '彩窗玻璃',
    summary: '教堂彩窗构图',
    formatAnchor: 'stained glass window composition, lead-lined glass segments, luminous translucent color panels, gothic arched frame, religious narrative layout, light shining through colored glass, ornate tracery border',
    negativeKeywords: ['photorealistic', 'flat digital', 'modern minimal'],
    aiConstraint: '必须呈现教堂彩窗玻璃构图，铅条分割色块、哥特拱形框、透光彩色玻璃质感。',
  },
  {
    key: 'character-sheet',
    label: '角色设定表',
    summary: '设定集多视图',
    formatAnchor: 'character design sheet composition, multiple angle turnaround views, expression sheet panel, color palette swatch, detail callout notes, concept art reference layout, turnaround poses, annotation labels',
    negativeKeywords: ['single pose only', 'no text', 'full scene background'],
    aiConstraint: '必须呈现角色设定表构图，多角度转视图、表情面板、色板和细节标注。',
  },
];

/** 形式 → 画风兼容推荐度 */
type FormatVisualStyleCompat = Record<PortraitFormatKey, Partial<Record<PortraitVisualStyleKey, 'strong' | 'ok' | 'weak'>>>;

export const FORMAT_VISUAL_STYLE_COMPAT: FormatVisualStyleCompat = {
  'standard': {},
  'tcg-card': {
    'cinematic-realistic': 'strong', 'anime': 'strong', 'concept-art': 'strong',
    '3d-render': 'ok', 'ethereal-illustration': 'ok', 'chibi': 'strong',
    'ink-wash': 'weak', 'oil-painting': 'strong', 'watercolor': 'ok',
    'pixel-art': 'strong', 'comic-pop': 'strong', 'ukiyo-e': 'ok',
    'dark-fantasy': 'strong', 'gouache-illustration': 'ok',
  },
  'wanted-poster': {
    'cinematic-realistic': 'strong', 'ink-wash': 'strong', 'concept-art': 'strong',
    'anime': 'ok', 'ethereal-illustration': 'ok', 'chibi': 'weak', '3d-render': 'weak',
    'oil-painting': 'strong', 'watercolor': 'weak', 'pixel-art': 'ok',
    'comic-pop': 'ok', 'ukiyo-e': 'weak', 'dark-fantasy': 'strong', 'gouache-illustration': 'ok',
  },
  'movie-poster': {
    'cinematic-realistic': 'strong', 'concept-art': 'strong', '3d-render': 'ok',
    'anime': 'ok', 'ethereal-illustration': 'ok', 'chibi': 'weak', 'ink-wash': 'weak',
    'oil-painting': 'strong', 'watercolor': 'weak', 'pixel-art': 'ok',
    'comic-pop': 'strong', 'ukiyo-e': 'weak', 'dark-fantasy': 'strong', 'gouache-illustration': 'ok',
  },
  'classical-book': {
    'ink-wash': 'strong', 'ethereal-illustration': 'strong', 'cinematic-realistic': 'ok',
    'concept-art': 'ok', 'anime': 'weak', '3d-render': 'weak', 'chibi': 'weak',
    'oil-painting': 'weak', 'watercolor': 'strong', 'pixel-art': 'weak',
    'comic-pop': 'weak', 'ukiyo-e': 'strong', 'dark-fantasy': 'ok', 'gouache-illustration': 'strong',
  },
  'tarot-card': {
    'cinematic-realistic': 'strong', 'concept-art': 'strong', 'ethereal-illustration': 'strong',
    'anime': 'ok', '3d-render': 'ok', 'ink-wash': 'weak', 'chibi': 'ok',
    'oil-painting': 'strong', 'watercolor': 'ok', 'pixel-art': 'ok',
    'comic-pop': 'weak', 'ukiyo-e': 'ok', 'dark-fantasy': 'strong', 'gouache-illustration': 'strong',
  },
  'dramatic-silhouette': {
    'cinematic-realistic': 'strong', 'concept-art': 'strong', '3d-render': 'ok',
    'ink-wash': 'ok', 'anime': 'ok', 'ethereal-illustration': 'ok', 'chibi': 'weak',
    'oil-painting': 'strong', 'watercolor': 'weak', 'pixel-art': 'ok',
    'comic-pop': 'ok', 'ukiyo-e': 'ok', 'dark-fantasy': 'strong', 'gouache-illustration': 'weak',
  },
  'heraldic-emblem': {
    'cinematic-realistic': 'strong', 'concept-art': 'strong', '3d-render': 'ok',
    'ethereal-illustration': 'ok', 'chibi': 'ok', 'anime': 'weak', 'ink-wash': 'weak',
    'oil-painting': 'strong', 'watercolor': 'weak', 'pixel-art': 'ok',
    'comic-pop': 'weak', 'ukiyo-e': 'weak', 'dark-fantasy': 'strong', 'gouache-illustration': 'ok',
  },
  'phone-wallpaper': {
    'cinematic-realistic': 'strong', 'concept-art': 'strong', 'ethereal-illustration': 'strong',
    'anime': 'strong', '3d-render': 'ok', 'chibi': 'ok', 'ink-wash': 'ok',
    'oil-painting': 'ok', 'watercolor': 'strong', 'pixel-art': 'ok',
    'comic-pop': 'strong', 'ukiyo-e': 'ok', 'dark-fantasy': 'ok', 'gouache-illustration': 'ok',
  },
  'bust-statue': {
    'cinematic-realistic': 'strong', '3d-render': 'strong', 'concept-art': 'strong',
    'oil-painting': 'strong', 'ethereal-illustration': 'ok', 'ink-wash': 'weak',
    'anime': 'weak', 'chibi': 'weak', 'watercolor': 'weak', 'pixel-art': 'weak',
    'comic-pop': 'weak', 'ukiyo-e': 'weak', 'dark-fantasy': 'ok', 'gouache-illustration': 'weak',
  },
  'scroll-painting': {
    'ink-wash': 'strong', 'ukiyo-e': 'strong', 'watercolor': 'strong',
    'ethereal-illustration': 'strong', 'gouache-illustration': 'strong',
    'cinematic-realistic': 'weak', 'concept-art': 'ok', 'anime': 'weak',
    '3d-render': 'weak', 'chibi': 'weak', 'oil-painting': 'weak',
    'pixel-art': 'weak', 'comic-pop': 'weak', 'dark-fantasy': 'ok',
  },
  'stamp-seal': {
    'ink-wash': 'strong', 'ukiyo-e': 'strong', 'gouache-illustration': 'strong',
    'watercolor': 'ok', 'oil-painting': 'ok', 'concept-art': 'ok',
    'cinematic-realistic': 'ok', 'ethereal-illustration': 'ok',
    'anime': 'weak', 'chibi': 'ok', '3d-render': 'weak',
    'pixel-art': 'ok', 'comic-pop': 'weak', 'dark-fantasy': 'ok',
  },
  'comic-cover': {
    'comic-pop': 'strong', 'anime': 'strong', 'concept-art': 'strong',
    'cinematic-realistic': 'strong', 'ink-wash': 'weak', '3d-render': 'ok',
    'ethereal-illustration': 'ok', 'chibi': 'ok', 'oil-painting': 'ok',
    'watercolor': 'weak', 'pixel-art': 'strong', 'ukiyo-e': 'weak',
    'dark-fantasy': 'strong', 'gouache-illustration': 'ok',
  },
  'album-card': {
    'anime': 'strong', 'concept-art': 'strong', 'cinematic-realistic': 'strong',
    '3d-render': 'ok', 'ethereal-illustration': 'ok', 'chibi': 'strong',
    'ink-wash': 'ok', 'oil-painting': 'ok', 'watercolor': 'ok',
    'pixel-art': 'strong', 'comic-pop': 'ok', 'ukiyo-e': 'ok',
    'dark-fantasy': 'ok', 'gouache-illustration': 'ok',
  },
  'polaroid': {
    'cinematic-realistic': 'strong', 'watercolor': 'strong', 'ethereal-illustration': 'strong',
    'anime': 'ok', 'concept-art': 'ok', '3d-render': 'ok', 'chibi': 'ok',
    'ink-wash': 'weak', 'oil-painting': 'weak', 'pixel-art': 'ok',
    'comic-pop': 'ok', 'ukiyo-e': 'weak', 'dark-fantasy': 'weak', 'gouache-illustration': 'ok',
  },
  'stained-glass': {
    'oil-painting': 'strong', 'concept-art': 'strong', 'ethereal-illustration': 'strong',
    'cinematic-realistic': 'ok', 'dark-fantasy': 'strong', 'gouache-illustration': 'strong',
    'anime': 'ok', 'ink-wash': 'weak', '3d-render': 'weak', 'chibi': 'weak',
    'watercolor': 'ok', 'pixel-art': 'weak', 'comic-pop': 'weak', 'ukiyo-e': 'ok',
  },
  'character-sheet': {
    'concept-art': 'strong', 'anime': 'strong', 'cinematic-realistic': 'strong',
    '3d-render': 'ok', 'ink-wash': 'ok', 'ethereal-illustration': 'ok',
    'chibi': 'ok', 'oil-painting': 'ok', 'watercolor': 'ok',
    'pixel-art': 'strong', 'comic-pop': 'ok', 'ukiyo-e': 'ok',
    'dark-fantasy': 'ok', 'gouache-illustration': 'ok',
  },
};

export function getFormatRule(key: PortraitFormatKey): PortraitFormatRule {
  return FORMAT_RULES.find(r => r.key === key) ?? FORMAT_RULES[0];
}

export function getFormatVisualStyleCompat(
  formatKey: PortraitFormatKey,
  styleKey: PortraitVisualStyleKey,
): 'strong' | 'ok' | 'weak' {
  return FORMAT_VISUAL_STYLE_COMPAT[formatKey]?.[styleKey] ?? 'ok';
}
