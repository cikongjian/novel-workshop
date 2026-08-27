export type ChapterLengthGuardResult = {
  triggered: boolean;
  targetWordCount?: number;
  actualWordCount: number;
  allowedMin: number;
  allowedMax: number;
  direction?: 'under' | 'over' | 'ok';
  summary: string;
};

export const DEFAULT_CHAPTER_WORD_TARGET = 3000;

export type ChapterLengthGuardAudit = ChapterLengthGuardResult & {
  attemptedCompression: boolean;
  attemptedExpansion: boolean;
  usedFallbackTrim: boolean;
  finalWordCount: number;
};

export function resolveLengthGuardMin(targetWordCount?: number): number {
  if (!targetWordCount || targetWordCount <= 0) return 0;
  const triggerPercent = Number(process.env.CHAPTER_LENGTH_GUARD_UNDER_TRIGGER_PERCENT) || 20;
  return Math.max(800, Math.floor(targetWordCount * (1 - triggerPercent / 100)));
}

export function resolveLengthGuardMax(targetWordCount?: number): number {
  if (!targetWordCount || targetWordCount <= 0) return Number.MAX_SAFE_INTEGER;
  const allowedPercent = Number(process.env.CHAPTER_LENGTH_GUARD_ALLOWED_PERCENT) || 5;
  return Math.max(targetWordCount + 150, Math.ceil(targetWordCount * (1 + allowedPercent / 100)));
}

export function shouldTriggerChapterUnderLengthGuard(actualWordCount: number, targetWordCount?: number): boolean {
  if (!targetWordCount || targetWordCount <= 0) return false;
  return actualWordCount < resolveLengthGuardMin(targetWordCount);
}

export function shouldTriggerChapterLengthGuard(actualWordCount: number, targetWordCount?: number): boolean {
  if (!targetWordCount || targetWordCount <= 0) return false;
  const triggerPercent = Number(process.env.CHAPTER_LENGTH_GUARD_TRIGGER_PERCENT) || 20;
  return actualWordCount > Math.max(targetWordCount + 500, Math.ceil(targetWordCount * (1 + triggerPercent / 100)));
}

export function buildChapterLengthGuardSummary(actualWordCount: number, targetWordCount?: number): ChapterLengthGuardResult {
  const allowedMin = resolveLengthGuardMin(targetWordCount);
  const allowedMax = resolveLengthGuardMax(targetWordCount);
  const overTriggered = shouldTriggerChapterLengthGuard(actualWordCount, targetWordCount);
  const underTriggered = shouldTriggerChapterUnderLengthGuard(actualWordCount, targetWordCount);
  const triggered = overTriggered || underTriggered;
  const direction = overTriggered ? 'over' : underTriggered ? 'under' : 'ok';
  return {
    triggered,
    targetWordCount,
    actualWordCount,
    allowedMin,
    allowedMax,
    direction,
    summary: triggered
      ? direction === 'under'
        ? `chapter length guard triggered: target ${targetWordCount}, actual ${actualWordCount}, allowed min ${allowedMin}`
        : `chapter length guard triggered: target ${targetWordCount}, actual ${actualWordCount}, allowed max ${allowedMax}`
      : `chapter length guard passed: actual ${actualWordCount}, allowed range ${allowedMin}-${allowedMax}`,
  };
}

export function finalizeChapterLengthGuardAudit(params: {
  existing?: ChapterLengthGuardAudit;
  finalWordCount: number;
  targetWordCount?: number;
}): ChapterLengthGuardAudit | undefined {
  if (!params.targetWordCount || params.targetWordCount <= 0) {
    return params.existing;
  }

  const finalSummary = buildChapterLengthGuardSummary(params.finalWordCount, params.targetWordCount);
  const existing = params.existing;
  const finalOutsideAllowed = params.finalWordCount < finalSummary.allowedMin
    || params.finalWordCount > finalSummary.allowedMax;

  if (!existing && !finalOutsideAllowed) {
    return undefined;
  }

  return {
    ...finalSummary,
    triggered: Boolean(existing?.triggered || finalSummary.triggered || finalOutsideAllowed),
    direction: finalOutsideAllowed
      ? params.finalWordCount > finalSummary.allowedMax ? 'over' : 'under'
      : finalSummary.direction,
    summary: finalOutsideAllowed
      ? params.finalWordCount > finalSummary.allowedMax
        ? `final chapter length exceeds allowed max: target ${params.targetWordCount}, final ${params.finalWordCount}, allowed max ${finalSummary.allowedMax}`
        : `final chapter length below allowed min: target ${params.targetWordCount}, final ${params.finalWordCount}, allowed min ${finalSummary.allowedMin}`
      : existing?.summary ?? finalSummary.summary,
    attemptedCompression: existing?.attemptedCompression ?? false,
    attemptedExpansion: existing?.attemptedExpansion ?? false,
    usedFallbackTrim: existing?.usedFallbackTrim ?? false,
    finalWordCount: params.finalWordCount,
  };
}

export function buildChapterLengthGuardFeedback(params: {
  targetWordCount: number;
  actualWordCount: number;
}): string {
  const { targetWordCount, actualWordCount } = params;
  const allowedMax = resolveLengthGuardMax(targetWordCount);
  return [
    '这是字数纠偏任务，不是自由润色。',
    `当前正文 ${actualWordCount} 字，目标 ${targetWordCount} 字，最终必须压到 ${allowedMax} 字以内。`,
    '- 优先砍掉：重复心理描写、二次解释、背景补充、无结果对话、同义反复。',
    '- 保留：关键冲突、结果性信息、主角选择、章末钩子。',
    '- 如遇取舍，优先保留推进剧情的句子，删除纯氛围和纯说明。',
  ].join('\n');
}

export function buildChapterUnderLengthGuardFeedback(params: {
  targetWordCount: number;
  actualWordCount: number;
}): string {
  const { targetWordCount, actualWordCount } = params;
  const allowedMin = resolveLengthGuardMin(targetWordCount);
  return [
    '这是字数补全任务，不是自由发挥。',
    `当前正文 ${actualWordCount} 字，目标 ${targetWordCount} 字，至少需要补到 ${allowedMin} 字以上。`,
    '- 只能补足已有剧情所缺的动作、因果、转折、情绪反馈和结果落地，不得另起炉灶。',
    '- 优先补：主角执行过程、阻力反应、关键对话的有效来回、结果性信息、章末钩子的落地前置。',
    '- 禁止用空泛感慨、重复设定说明、重复心理描写或无结果对白来凑字数。',
    '- 必须保留原文可见主语、角色名、说话人名和称谓；不得把“林栀看见了”“Lisa的声音”改成“但 看见了”“的声音”。',
  ].join('\n');
}

export function trimChapterToSentenceBoundary(text: string, targetWordCount: number): string {
  if (!targetWordCount || text.length <= targetWordCount) return text.trim();
  const allowedMax = resolveLengthGuardMax(targetWordCount);
  if (text.length <= allowedMax) return text.trim();

  const paragraphs = text.split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
  const tailParagraphs = paragraphs.slice(-6);
  const tailText = tailParagraphs.join('\n\n');
  if (
    tailText.length >= 80
    && tailText.length <= Math.floor(allowedMax * 0.45)
    && /[。！？!?」』”"]$/u.test(tailText)
  ) {
    const headBudget = allowedMax - tailText.length - 2;
    const headSource = paragraphs.slice(0, -6).join('\n\n');
    if (headBudget >= Math.floor(targetWordCount * 0.45) && headSource.length > headBudget) {
      const headSlice = headSource.slice(0, headBudget);
      const headParagraphEnd = headSlice.lastIndexOf('\n\n');
      const head = headParagraphEnd >= Math.floor(headBudget * 0.75)
        ? headSlice.slice(0, headParagraphEnd).trim()
        : headSlice.trim();
      if (head.length >= Math.floor(targetWordCount * 0.45)) {
        return `${head}\n\n${tailText}`.trim();
      }
    }
  }

  const slice = text.slice(0, allowedMax);

  // 优先在段落边界截断（双换行），保持剧情完整性
  const lastParagraphEnd = slice.lastIndexOf('\n\n');
  if (lastParagraphEnd >= Math.floor(targetWordCount * 0.65)) {
    return slice.slice(0, lastParagraphEnd).trim();
  }

  // 次优：在句子边界截断
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('\n'),
  );
  if (lastSentenceEnd >= Math.floor(targetWordCount * 0.7)) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }

  // 兜底：硬截断
  return slice.trim();
}

export function buildChapterLengthFallbackTrim(
  text: string,
  targetWordCount: number,
): { content: string; applied: boolean } {
  const source = text.trim();
  const content = trimChapterToSentenceBoundary(source, targetWordCount);
  return { content, applied: content.length < source.length };
}

export function enforceFinalChapterLengthLimit(params: {
  text: string;
  targetWordCount?: number;
  existing?: ChapterLengthGuardAudit;
  skip?: boolean;
}): { content: string; audit?: ChapterLengthGuardAudit } {
  const source = params.text.trim();
  let content = source;
  let existing = params.existing;
  const target = params.targetWordCount;

  if (!params.skip && target && target > 0 && source.length > resolveLengthGuardMax(target)) {
    const fallback = buildChapterLengthFallbackTrim(source, target);
    content = fallback.content;
    if (fallback.applied) {
      const overflow = buildChapterLengthGuardSummary(source.length, target);
      existing = {
        ...overflow,
        triggered: true,
        direction: 'over',
        summary: `final fallback trimmed chapter after late-stage rewrite: target ${target}, before ${source.length}, after ${content.length}`,
        attemptedCompression: existing?.attemptedCompression ?? false,
        attemptedExpansion: existing?.attemptedExpansion ?? false,
        usedFallbackTrim: true,
        finalWordCount: content.length,
      };
    }
  }

  return {
    content,
    audit: finalizeChapterLengthGuardAudit({
      existing,
      finalWordCount: content.length,
      targetWordCount: target,
    }),
  };
}
