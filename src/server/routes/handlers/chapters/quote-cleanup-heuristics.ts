import type { CleanQuoteUsageInput } from './quote-cleanup-types.js';

const CHINESE_DIALOGUE_QUOTE_RE = /"([^"\n]{1,220}?)"/g;
const SPEAKER_MARKER_BEFORE_RE = /[(\uFF08]\s*[#\uFF03]\s*([^()\uFF08\uFF09\n]+?)\s*[)\uFF09]\s*$/;
const SPEECH_VERBS = [
  '说道',
  '说',
  '问道',
  '问',
  '答道',
  '答',
  '回道',
  '回应',
  '喊道',
  '叫道',
  '低声道',
  '轻声道',
  '沉声道',
  '冷声道',
  '笑道',
  '冷笑道',
  '嘟囔道',
  '咕哝道',
  '怒道',
  '喝道',
  '耳语道',
  '提醒道',
  '警告道',
] as const;
const SPEAKER_BEFORE_HINT_RE = new RegExp(
  `([^\\s，。！？、""''（）()]{1,12})(?:${SPEECH_VERBS.join('|')})[：:，,\\s]*$`,
);
const SPEAKER_AFTER_HINT_RE = new RegExp(
  `^[\\s，。！？、…]*([^\\s，。！？、""''（）()]{1,12})(?:${SPEECH_VERBS.join('|')})`,
);
const NON_DIALOGUE_QUOTE_CONTEXT_RE = /牌匾|匾额|招牌|牌子|店名|门头|店铺|字号|组织|势力|门派|帮会|宗门|代号|型号|按钮|菜单|提示|系统|通知|公告|名称|称作|名为|叫做|信中|信里|信上|书信|信件|信笺|纸条|纸上|手札|手记|日记|遗书|留言|心声|心念|心里|心想|暗想|默念|默想|脑海|念头|独白|旁白|风声|雨声|雷声|回声|铃声|钟声|脚步声|爆炸声|轰鸣|嗡鸣|滴答|沙沙/;
const LIKELY_SOUND_RE = /^(轰|轰隆|轰鸣|嗡|嗡嗡|当啷|铛|叮|叮咚|咚|砰|啪|咔|咔嚓|沙沙|滴答|呼|呼呼|呜|呜呜|嘶|噼啪|噗)([啊呀哦嗯嘛哈嘿]*)$/;
const DIALOGUE_CONTENT_HINT_RE = /我|你|他|她|它|我们|你们|他们|咱|吗|吧|呢|啊|呀|哼|哈|哦|诶|？|！/;
const NON_DIALOGUE_SHORT_TERM_RE = /^[\u4e00-\u9fa5A-Za-z0-9·\-_.]{1,16}$/;

export function resolveQuoteCleanupTargets(
  chapterNumbers: number[],
  body: CleanQuoteUsageInput,
): number[] {
  const sortedAll = [...chapterNumbers].sort((a, b) => a - b);
  const existingSet = new Set(sortedAll);

  let targets: number[];
  if (body.chapterNumbers && body.chapterNumbers.length > 0) {
    targets = Array.from(new Set(body.chapterNumbers)).sort((a, b) => a - b);
  } else {
    targets = sortedAll;
    if (body.fromChapter !== undefined) {
      targets = targets.filter(num => num >= body.fromChapter!);
    }
    if (body.toChapter !== undefined) {
      targets = targets.filter(num => num <= body.toChapter!);
    }
  }

  return targets.filter(num => existingSet.has(num));
}

export function buildSelectedEditMap(
  selectedEdits?: CleanQuoteUsageInput['selectedEdits'],
): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  if (!selectedEdits || selectedEdits.length === 0) return map;
  for (const item of selectedEdits) {
    if (item.chapterNumber > 0 && item.editIds?.length > 0) {
      map.set(item.chapterNumber, new Set(item.editIds));
    }
  }
  return map;
}

export function buildQuoteEditId(start: number, end: number, inner: string): string {
  const seed = `${start}:${end}:${inner}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
  }
  return `qe-${start}-${hash.toString(36)}`;
}

export function normalizeQuoteTextForFeedback(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 100);
}

function snippetAround(content: string, start: number, end: number): string {
  const from = Math.max(0, start - 24);
  const to = Math.min(content.length, end + 24);
  return content.slice(from, to).replace(/\s+/g, ' ').trim();
}

function hasSpeakerEvidence(before: string, after: string): boolean {
  if (SPEAKER_MARKER_BEFORE_RE.test(before)) return true;
  if (SPEAKER_BEFORE_HINT_RE.test(before)) return true;
  if (SPEAKER_AFTER_HINT_RE.test(after)) return true;
  return false;
}

function isLikelyDialogueContent(inner: string): boolean {
  if (DIALOGUE_CONTENT_HINT_RE.test(inner)) return true;
  if (inner.length >= 20) return true;
  if (/[，。；：]/.test(inner) && inner.length >= 8) return true;
  return false;
}

function isLikelySoundEffect(inner: string): boolean {
  const normalized = inner.replace(/[，。！？、…\s]/g, '');
  if (!normalized) return false;
  if (LIKELY_SOUND_RE.test(normalized)) return true;
  if (/^[拟象象声叮咚哐当轰嗡呼呜咔啪砰噼滴沙]{1,8}$/.test(normalized)) return true;
  return false;
}

function shouldNormalizeNonDialogueQuote(innerRaw: string, before: string, after: string): boolean {
  const inner = innerRaw.trim();
  if (!inner) return true;

  const speakerEvidence = hasSpeakerEvidence(before, after);
  const context = `${before}${after}`;
  if (NON_DIALOGUE_QUOTE_CONTEXT_RE.test(context)) {
    return true;
  }

  if (isLikelySoundEffect(inner)) return true;

  if (!speakerEvidence && NON_DIALOGUE_SHORT_TERM_RE.test(inner) && !isLikelyDialogueContent(inner)) {
    return true;
  }

  if (!speakerEvidence && inner.length <= 18 && !isLikelyDialogueContent(inner)) {
    return true;
  }

  return false;
}

export function cleanNonDialogueQuotes(
  content: string,
  selectedIds?: Set<string>,
  ignoredQuoteTexts?: Set<string>,
): {
  content: string;
  replacements: number;
  beforeSample: string;
  afterSample: string;
  examples: Array<{
    id: string;
    before: string;
    after: string;
    quoteText: string;
    recommended: boolean;
  }>;
} {
  CHINESE_DIALOGUE_QUOTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let changed = false;
  let replacements = 0;
  let output = '';
  let beforeSample = '';
  let afterSample = '';
  const examples: Array<{
    id: string;
    before: string;
    after: string;
    quoteText: string;
    recommended: boolean;
  }> = [];

  while ((match = CHINESE_DIALOGUE_QUOTE_RE.exec(content)) !== null) {
    const [raw, innerRaw] = match;
    const start = match.index;
    const end = start + raw.length;
    const before = content.slice(Math.max(0, start - 64), start);
    const after = content.slice(end, Math.min(content.length, end + 64));
    const editId = buildQuoteEditId(start, end, innerRaw);
    const quoteText = innerRaw.trim();
    const quoteToken = normalizeQuoteTextForFeedback(quoteText);
    const recommended = quoteToken ? !ignoredQuoteTexts?.has(quoteToken) : true;

    const shouldNormalize = shouldNormalizeNonDialogueQuote(innerRaw, before, after);
    const replacementCandidate = innerRaw.trim();
    const shouldApply = shouldNormalize && (!selectedIds || selectedIds.has(editId));
    const replacement = shouldApply ? replacementCandidate : raw;

    output += content.slice(lastIndex, start);
    output += replacement;
    lastIndex = end;

    if (shouldApply) {
      changed = true;
      replacements += 1;
      if (examples.length < 12) {
        const beforeExample = snippetAround(content, start, end);
        const afterContent = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
        const afterExample = snippetAround(afterContent, start, start + replacement.length);
        examples.push({
          id: editId,
          before: beforeExample,
          after: afterExample,
          quoteText,
          recommended,
        });
      }
      if (!beforeSample) {
        beforeSample = snippetAround(content, start, end);
        const afterContent = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
        afterSample = snippetAround(afterContent, start, start + replacement.length);
      }
    }
  }

  if (!changed) {
    return {
      content,
      replacements: 0,
      beforeSample: '',
      afterSample: '',
      examples: [],
    };
  }

  output += content.slice(lastIndex);
  return {
    content: output,
    replacements,
    beforeSample,
    afterSample,
    examples,
  };
}

export type QuoteCleanupResult = ReturnType<typeof cleanNonDialogueQuotes>;

export function buildQuoteCleanupSummary(params: {
  applied: boolean;
  totalScanned: number;
  affected: number;
  replacements: number;
}): string {
  if (params.affected === 0) {
    return `已扫描 ${params.totalScanned} 章，未发现需要清洗的非台词引号。`;
  }
  const action = params.applied ? '已应用' : '预览发现';
  return `${action} ${params.affected} 章，共处理 ${params.replacements} 处非台词引号。`;
}
