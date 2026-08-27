/**
 * 品牌标识前端读取层。
 *
 * 默认值来自 config/brand.defaults.json（唯一真实来源），由 vite.config.ts
 * 在构建期通过 define 注入为 __BRAND_DEFAULTS__，此处只负责应用
 * VITE_BRAND_* 环境变量覆盖。不要在本文件重复写死品牌字面量。
 */

export interface BrandConfig {
  /** 中文显示名 */
  readonly displayName: string;
  /** ASCII 标识符，用于本地存储键、IndexedDB 库名等场景 */
  readonly slug: string;
  /** 一句话定位 */
  readonly tagline: string;
  /** 完整介绍 */
  readonly description: string;
  /** 版权起始年份 */
  readonly copyrightSince: number;
  /** 版权归属主体 */
  readonly copyrightHolder: string;
}

/** __BRAND_DEFAULTS__ 由 vite define 注入，类型声明见 web/env.d.ts */
const DEFAULT_BRAND: BrandConfig = __BRAND_DEFAULTS__;

/** 读取非空构建期变量，空串视为未设置 */
function readEnv(key: string): string | undefined {
  const raw = import.meta.env[key as keyof ImportMetaEnv];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function readYear(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const brand: BrandConfig = {
  displayName: readEnv('VITE_BRAND_DISPLAY_NAME') ?? DEFAULT_BRAND.displayName,
  slug: readEnv('VITE_BRAND_SLUG') ?? DEFAULT_BRAND.slug,
  tagline: readEnv('VITE_BRAND_TAGLINE') ?? DEFAULT_BRAND.tagline,
  description: readEnv('VITE_BRAND_DESCRIPTION') ?? DEFAULT_BRAND.description,
  copyrightSince: readYear('VITE_BRAND_COPYRIGHT_SINCE', DEFAULT_BRAND.copyrightSince),
  copyrightHolder: readEnv('VITE_BRAND_COPYRIGHT_HOLDER') ?? DEFAULT_BRAND.copyrightHolder,
};

/** 生成版权文案，起始年与当年相同时输出单年 */
export function formatCopyright(currentYear: number = new Date().getFullYear()): string {
  const since = brand.copyrightSince;
  const span = currentYear > since ? `${since}-${currentYear}` : `${since}`;
  return `Copyright © ${span} ${brand.copyrightHolder}. All rights reserved.`;
}

/** 拼接「页面标题 — 品牌名」形式的标题 */
export function withBrandSuffix(title: string): string {
  return `${title} — ${brand.displayName}`;
}
