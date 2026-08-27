import type { DialogueBracketTransformMode } from './dialogue-bracket-cleaner-types.js';

const SYSTEM_MARKER_RE = /^(?:[#＃]|死亡\s*[:：]|退场\s*[:：])/;
const ROLE_MARKER_TAIL_RE = /[（(]\s*[#＃][^()（）\n]{1,30}\s*[）)]\s*$/;
const LIKELY_STAGE_TAG_RE = /低声|轻声|沉声|冷声|压低|提高|放缓|沙哑|干涩|颤声|哽咽|嘶吼|怒吼|咬牙|冷笑|苦笑|苦涩|笑|叹|喃喃|呢喃|从牙缝|挤出|咆哮|吼|喝|喊|尖叫|呼喊|喘|发抖|哆嗦|颤抖|抽泣|呜咽|克制|失声|嘀咕|咕哝|耳语|哑声|轻轻|压着火气|声音|语气|嗓音/;
const UNCERTAIN_TAG_RE = /注|备注|说明|译注|章节|第.{0,4}章|旁白|内心|心声|系统|提示|技能|招式|法术|术式|阵法|型号|代号|时间|地点|设定|世界观|cv|bgm|os/i;

export const DIALOGUE_PREFIX_BRACKET_RE = /[（(]\s*([^()（）\n]{1,30})\s*[）)]\s*([“"「『])/g;
export const DIALOGUE_SUFFIX_BRACKET_RE = /([”"」』])\s*[（(]\s*([^()（）\n]{1,30})\s*[）)]/g;

export const AI_REWRITE_SYSTEM_PROMPT = [
  '你是一位中文小说编辑。',
  '任务：把“括号动作标签”转换成可直接阅读的叙述短语。',
  '要求：',
  '1. 只改写标签表达，不改动对白事实，不新增剧情。',
  '2. 禁止返回括号标签写法。',
  '3. 输出必须是 JSON，格式 {"narration":"..."}，不要输出其他内容。',
].join('\n');

export function buildEditId(patternType: 'prefix' | 'suffix', start: number, end: number, inner: string): string {
  const seed = `${patternType}:${start}:${end}:${inner}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
  }
  return `dbe-${start}-${hash.toString(36)}`;
}

export function buildPrefixReplacement(
  tag: string,
  quoteStart: string,
  mode: DialogueBracketTransformMode,
  hasRoleMarker: boolean,
): string {
  if (mode === 'clean') return quoteStart;
  const narration = normalizeTagAsNarration(tag, true);
  if (!narration) return quoteStart;
  if (/[：:]$/.test(narration)) return `${narration}${quoteStart}`;
  if (hasRoleMarker) return `${narration}：${quoteStart}`;
  return `${narration}：${quoteStart}`;
}

export function buildSuffixReplacement(
  tag: string,
  quoteEnd: string,
  mode: DialogueBracketTransformMode,
): string {
  if (mode === 'clean') return quoteEnd;
  const narration = normalizeTagAsNarration(tag, false).replace(/^[，,。；;：:\s]+/, '');
  if (!narration) return quoteEnd;
  const ending = /[。！？!?…]$/.test(narration) ? '' : '。';
  return `${quoteEnd}，${narration}${ending}`;
}

export function normalizeTagAsNarration(tag: string, isPrefix: boolean): string {
  const trimmed = tag.trim().replace(/^[，,。；;：:、\s]+|[，,。；;：:、\s]+$/g, '');
  if (!trimmed) return '';
  if (/[：:]$/.test(trimmed)) return trimmed;

  if (/^(?:低声|轻声|沉声|冷声|哑声|颤声|喃喃|呢喃|耳语|咕哝|嘀咕)$/.test(trimmed)) {
    return `${trimmed}道`;
  }
  if (/地$/.test(trimmed)) {
    return `${trimmed}说`;
  }
  if (/^(?:咬牙|冷笑|苦笑|哽咽|抽泣|呜咽|失声|怒吼|嘶吼|咆哮|喊|喝|吼|尖叫)$/.test(trimmed)) {
    return `${trimmed}道`;
  }
  if (/(?:说|问|道|喊|喝|吼)$/.test(trimmed)) {
    return trimmed;
  }
  if (isPrefix && /(?:挤出声音|压低声音|提高声音|放缓语速|开口|出声)$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.length <= 3) {
    return `${trimmed}道`;
  }
  return trimmed;
}

export function extractNarration(raw: string): string {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as { narration?: unknown };
    const narration = typeof parsed.narration === 'string' ? parsed.narration.trim() : '';
    return narration;
  } catch {
    const match = text.match(/"narration"\s*:\s*"([^"]+)"/);
    if (match) return match[1].trim();
    return text.replace(/^["'`]+|["'`]+$/g, '').trim();
  }
}

export function rebuildPrefixFromNarration(narrationRaw: string, quoteStart: string): string {
  let narration = narrationRaw.trim();
  if (!narration) return '';
  const quoteIdx = narration.indexOf(quoteStart);
  if (quoteIdx >= 0) {
    narration = narration.slice(0, quoteIdx).trim();
  }
  narration = narration.replace(/^[，,。；;：:\s]+|[，,。；;：:\s]+$/g, '');
  if (!narration) return quoteStart;
  if (/[：:]$/.test(narration)) return `${narration}${quoteStart}`;
  return `${narration}：${quoteStart}`;
}

export function rebuildSuffixFromNarration(narrationRaw: string, quoteEnd: string): string {
  let narration = narrationRaw.trim();
  if (!narration) return '';
  const quoteIdx = narration.indexOf(quoteEnd);
  if (quoteIdx >= 0) {
    narration = narration.slice(quoteIdx + quoteEnd.length).trim();
  }
  narration = narration.replace(/^[，,。；;：:\s]+|[，,。；;：:\s]+$/g, '');
  if (!narration) return quoteEnd;
  const ending = /[。！？!?…]$/.test(narration) ? '' : '。';
  return `${quoteEnd}，${narration}${ending}`;
}

export function isCandidateTag(tag: string): boolean {
  if (!tag || tag.length > 30) return false;
  if (SYSTEM_MARKER_RE.test(tag)) return false;
  if (/^[-—_=*~·.]+$/.test(tag)) return false;
  return true;
}

export function isRecommendedTag(tag: string): boolean {
  if (UNCERTAIN_TAG_RE.test(tag)) return false;
  if (/[：:]/.test(tag)) return false;
  return LIKELY_STAGE_TAG_RE.test(tag);
}

export function hasRoleMarkerBefore(content: string, start: number): boolean {
  const from = Math.max(0, start - 48);
  const head = content.slice(from, start);
  return ROLE_MARKER_TAIL_RE.test(head);
}

export function extractRoleMarkerBefore(content: string, start: number): string | null {
  const from = Math.max(0, start - 48);
  const head = content.slice(from, start);
  const match = head.match(/([（(]\s*[#＃][^()（）\n]{1,30}\s*[）)])\s*$/);
  return match?.[1]?.trim() ?? null;
}

export function locatePosition(content: string, index: number): {
  lineNumber: number;
  columnNumber: number;
  paragraphNumber: number;
} {
  const head = content.slice(0, index);
  const lineBreaks = head.match(/\n/g)?.length ?? 0;
  const lineNumber = lineBreaks + 1;
  const lastLineBreak = head.lastIndexOf('\n');
  const columnNumber = index - lastLineBreak;
  const paragraphNumber = head.split(/\n\s*\n/).length;
  return { lineNumber, columnNumber, paragraphNumber };
}

export function snippetAround(content: string, start: number, end: number): string {
  const from = Math.max(0, start - 28);
  const to = Math.min(content.length, end + 28);
  return content.slice(from, to).replace(/\s+/g, ' ').trim();
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout:${timeoutMs}`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
