/**
 * 品牌标识后端读取层。
 *
 * 默认值来自 config/brand.defaults.json（唯一真实来源），此处只负责
 * 读取该文件并应用 BRAND_* 环境变量覆盖。全项目的品牌名称、标语、
 * 版权信息均从此处派生，不在源码、样式、构建脚本中散落写死。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 品牌配置形状 */
export interface BrandConfig {
  /** 中文显示名，用于界面、邮件、SEO 标题 */
  readonly displayName: string;
  /** ASCII 标识符，用于产物文件名、User-Agent、包名等不接受中文的场景 */
  readonly slug: string;
  /** 一句话定位，用于分享卡片与文档标题 */
  readonly tagline: string;
  /** 完整介绍，用于 SEO description */
  readonly description: string;
  /** 版权起始年份，版权区间由此推导 */
  readonly copyrightSince: number;
  /** 版权归属主体 */
  readonly copyrightHolder: string;
}

/** 品牌默认值文件相对本模块编译产物的位置（dist/config → 仓库根） */
const DEFAULTS_RELATIVE_PATH = '../../config/brand.defaults.json';

/**
 * 读取品牌默认值。文件缺失或字段不全时直接抛错而非静默兜底，
 * 避免品牌信息以空值形态进入产物。
 */
function loadDefaults(): BrandConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(here, DEFAULTS_RELATIVE_PATH);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `品牌配置文件读取失败：${file}。请确认 config/brand.defaults.json 存在且为合法 JSON。原始错误：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const text = (key: keyof BrandConfig): string => {
    const value = parsed[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`品牌配置项 ${key} 缺失或为空，请检查 config/brand.defaults.json`);
    }
    return value.trim();
  };

  const since = parsed.copyrightSince;
  if (typeof since !== 'number' || !Number.isInteger(since) || since <= 0) {
    throw new Error('品牌配置项 copyrightSince 必须为正整数年份');
  }

  return {
    displayName: text('displayName'),
    slug: text('slug'),
    tagline: text('tagline'),
    description: text('description'),
    copyrightSince: since,
    copyrightHolder: text('copyrightHolder'),
  };
}

const DEFAULT_BRAND = loadDefaults();

/** 读取非空环境变量，空串视为未设置 */
function readEnv(key: string): string | undefined {
  const raw = process.env[key];
  return raw && raw.trim() ? raw.trim() : undefined;
}

/** 读取正整数年份环境变量，非法值回退到默认值 */
function readYear(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** 当前生效的品牌配置 */
export const brand: BrandConfig = {
  displayName: readEnv('BRAND_DISPLAY_NAME') ?? DEFAULT_BRAND.displayName,
  slug: readEnv('BRAND_SLUG') ?? DEFAULT_BRAND.slug,
  tagline: readEnv('BRAND_TAGLINE') ?? DEFAULT_BRAND.tagline,
  description: readEnv('BRAND_DESCRIPTION') ?? DEFAULT_BRAND.description,
  copyrightSince: readYear('BRAND_COPYRIGHT_SINCE', DEFAULT_BRAND.copyrightSince),
  copyrightHolder: readEnv('BRAND_COPYRIGHT_HOLDER') ?? DEFAULT_BRAND.copyrightHolder,
};

/**
 * 生成版权文案。起始年与当年相同时输出单年，否则输出区间，
 * 避免每年手工改硬编码的版权年份。
 */
export function formatCopyright(currentYear: number = new Date().getFullYear()): string {
  const since = brand.copyrightSince;
  const span = currentYear > since ? `${since}-${currentYear}` : `${since}`;
  return `Copyright © ${span} ${brand.copyrightHolder}. All rights reserved.`;
}

/** 拼接「页面标题 — 品牌名」形式的标题 */
export function withBrandSuffix(title: string): string {
  return `${title} — ${brand.displayName}`;
}
