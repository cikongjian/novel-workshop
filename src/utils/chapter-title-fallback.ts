import { inspectGeneratedTitle, sanitizeGeneratedTitle } from '../agents/title-generation-strategy.js';
import { extractChapterTitle, extractKeyEvents } from './outline-extractors.js';

const GENERIC_CHAPTER_TITLE_RE = /^第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*章$/u;
const EVENT_PREFIX_RE = /^(?:场景|事件|节点|小节)?\s*[0-9０-９一二三四五六七八九十百千万两]+\s*[：:、.\-\s]*/u;
const MARKDOWN_DECORATION_RE = /[#*_`"'“”‘’「」『』《》【】（）()[\]]/gu;
const SPLIT_PUNCTUATION_RE = /[，,。.!！?？；;：:\n\r]/u;
const ENGINEERING_DEVICE_RE = /(气闸|冷却泵|泵组|阀组|阀门|氧压|分析仪|传感器|配电柜|接地回路|模块|导轨|线圈|滤芯|工单|锁值|读数|参数|缓存|日志签名|时间链|HUD缓存)/u;
const ENGINEERING_PRESSURE_RE = /(报警|锁死|失压|跳变|漂移|回落|归零|离线|异常|倒计时|纹波|时序|校准|复位|更换|阻抗)/u;

export function buildChapterFallbackTitle(params: {
  outline?: string;
  content?: string;
  chapterNumber: number;
}): string {
  const outlineTitle = normalizeCandidate(extractChapterTitle(params.outline || ''));
  if (isUsableFallbackTitle(outlineTitle)) return outlineTitle;

  for (const event of extractKeyEvents(params.outline || '')) {
    const title = normalizeCandidate(event);
    if (isUsableFallbackTitle(title)) return title;
  }

  const engineeringTitle = buildEngineeringTitle(params.content || '');
  if (engineeringTitle) return engineeringTitle;

  for (const paragraph of (params.content || '').split(/\n+/u).slice(0, 18)) {
    const title = normalizeCandidate(paragraph);
    if (isUsableFallbackTitle(title)) return title;
  }

  return `本章转折`;
}

function normalizeCandidate(raw: string): string {
  let candidate = sanitizeGeneratedTitle(raw)
    .replace(MARKDOWN_DECORATION_RE, '')
    .replace(EVENT_PREFIX_RE, '')
    .trim()
    .replace(/\s+/gu, '');

  const punctIndex = candidate.search(SPLIT_PUNCTUATION_RE);
  if (punctIndex > 0) candidate = candidate.slice(0, punctIndex);
  if (candidate.length > 12) candidate = candidate.slice(0, 12);

  return sanitizeGeneratedTitle(candidate);
}

function isUsableFallbackTitle(title: string): boolean {
  if (!title || GENERIC_CHAPTER_TITLE_RE.test(title)) return false;
  if (title.length < 4 || title.length > 12) return false;
  return !inspectGeneratedTitle(title).mechanical;
}

function buildEngineeringTitle(content: string): string {
  const window = [
    content.slice(0, 1600),
    content.slice(Math.max(0, content.length - 1200)),
  ].join('\n');
  const device = window.match(ENGINEERING_DEVICE_RE)?.[1];
  if (!device) return '';
  const pressure = window.match(ENGINEERING_PRESSURE_RE)?.[1];
  const candidate = normalizeCandidate(`${device}${pressure || '异常'}`);
  return isUsableFallbackTitle(candidate) ? candidate : '';
}
