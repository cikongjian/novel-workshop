/**
 * 章节漫画功能共享配置常量。
 *
 * 设计目的：把所有漫画相关的「魔法数字」集中在此，供 settings 公开端点、
 * 出图服务、计费等模块复用，避免散落各处的硬编码。
 *
 * 阶段 0：仅 `DEFAULT_COMIC_PANELS_PER_CHAPTER` 被 settings 公开端点引用。
 * 阶段 1 起：出图服务、队列、计费继续从此处取值。
 */

/** 每章默认生成的漫画格数（只画高潮，非全场景 9 格，控制成本） */
export const DEFAULT_COMIC_PANELS_PER_CHAPTER = 3;

/** 漫画风格预设（作者选定后注入所有出图 prompt，保证全章风格统一） */
export const COMIC_STYLES: Record<string, { label: string; prompt: string }> = {
  cinematic: { label: '写实电影', prompt: 'cinematic photorealistic style, dramatic lighting, film grain, shallow depth of field, realistic textures, highly detailed' },
  anime: { label: '二次元', prompt: 'Japanese anime style, cel shading, vibrant colors, clean line art, expressive eyes, professional anime illustration' },
  'manga-bw': { label: '黑白漫画', prompt: 'black and white manga style, screentone, clean ink lines, high contrast, professional Japanese manga art' },
  'ink-wash': { label: '中国水墨', prompt: 'Chinese ink wash painting style, monochrome, elegant brush strokes, traditional aesthetic, poetic atmosphere' },
  oil: { label: '厚涂油画', prompt: 'oil painting style, thick visible brushstrokes, rich textures, classical composition, museum quality' },
  watercolor: { label: '水彩', prompt: 'watercolor illustration style, soft wet edges, pastel colors, delicate and dreamy, paper texture' },
};

/** 单格最多注入的参考图角色数（超出会漂移且 token 失控） */
export const MAX_REFERENCE_CHARACTERS_PER_PANEL = 2;

/** 相邻两格出图之间的最小间隔（毫秒），避免触发图像供应商限流（429） */
export const COMIC_PANEL_THROTTLE_MS = 5000;

/** 单格出图客户端超时（毫秒），gpt-image-2 high 档可能达 3-5 分钟 */
export const COMIC_PANEL_TIMEOUT_MS = 5 * 60_000;

/** 单章参考图建议压缩到的体积上限（字节），降低图片输入 token 成本 */
export const COMIC_REFERENCE_MAX_BYTES = 1.5 * 1024 * 1024;
