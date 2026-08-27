type ReplayParagraphMatch = {
  index: number;
  paragraph: string;
  similarity: number;
};

export type DistributedSceneReplayReport = {
  eligibleParagraphCount: number;
  matchedParagraphCount: number;
  matchedRatio: number;
  strongestSimilarity: number;
  matchedParagraphs: ReplayParagraphMatch[];
  shouldRetry: boolean;
  shouldSanitize: boolean;
};

type StripDistributedSceneReplayResult = {
  sanitizedText: string;
  removedParagraphs: string[];
  report: DistributedSceneReplayReport;
};

const MIN_PARAGRAPH_CHARS = 18;
const SOFT_REPLAY_THRESHOLD = 0.62;
const MIN_REPLAY_MATCHES = 3;
const MIN_REPLAY_RATIO = 0.24;
const MIN_SANITIZED_CHARS = 120;

function normalizeReplayText(text: string): string {
  return (text ?? '')
    .replace(/\(#.*?\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[“”"'‘’`]/g, '')
    .replace(/[，。！？、；：,.!?;:()\[\]{}<>《》【】\-_]/g, '')
    .trim();
}

function splitReplayParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function charOverlapRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const ch of setA) {
    if (setB.has(ch)) shared += 1;
  }
  const smaller = Math.min(setA.size, setB.size);
  return smaller === 0 ? 0 : shared / smaller;
}

function buildReplayCandidates(previousText: string): string[] {
  const normalizedParagraphs = splitReplayParagraphs(previousText)
    .map(normalizeReplayText)
    .filter(item => item.length >= MIN_PARAGRAPH_CHARS);
  const candidates = new Set<string>(normalizedParagraphs);
  for (let index = 0; index < normalizedParagraphs.length - 1; index += 1) {
    const pair = `${normalizedParagraphs[index]}${normalizedParagraphs[index + 1]}`.trim();
    if (pair.length >= MIN_PARAGRAPH_CHARS) candidates.add(pair);
  }
  return [...candidates];
}

function estimateParagraphReplaySimilarity(paragraph: string, candidates: string[]): number {
  const normalizedParagraph = normalizeReplayText(paragraph);
  if (normalizedParagraph.length < MIN_PARAGRAPH_CHARS || candidates.length === 0) return 0;

  let strongest = 0;
  for (const candidate of candidates) {
    if (candidate.includes(normalizedParagraph) || normalizedParagraph.includes(candidate)) {
      return 1;
    }
    strongest = Math.max(strongest, charOverlapRatio(normalizedParagraph, candidate));
    if (strongest >= 0.999) return strongest;
  }
  return strongest;
}

function hasStrongTerminalStop(text: string): boolean {
  return /[。！？!?…」』】）》"']\s*$/u.test((text ?? '').trim());
}

export function analyzeDistributedSceneReplay(
  currentText: string,
  previousText: string,
): DistributedSceneReplayReport {
  const paragraphs = splitReplayParagraphs(currentText);
  const candidates = buildReplayCandidates(previousText);
  const matchedParagraphs: ReplayParagraphMatch[] = [];
  let eligibleParagraphCount = 0;
  let strongestSimilarity = 0;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const normalizedParagraph = normalizeReplayText(paragraph);
    if (normalizedParagraph.length < MIN_PARAGRAPH_CHARS) continue;
    eligibleParagraphCount += 1;

    const similarity = estimateParagraphReplaySimilarity(paragraph, candidates);
    strongestSimilarity = Math.max(strongestSimilarity, similarity);
    if (similarity >= SOFT_REPLAY_THRESHOLD) {
      matchedParagraphs.push({ index, paragraph, similarity });
    }
  }

  const matchedParagraphCount = matchedParagraphs.length;
  const matchedRatio = eligibleParagraphCount === 0
    ? 0
    : matchedParagraphCount / eligibleParagraphCount;
  const shouldRetry = matchedParagraphCount >= MIN_REPLAY_MATCHES
    && matchedRatio >= MIN_REPLAY_RATIO;

  return {
    eligibleParagraphCount,
    matchedParagraphCount,
    matchedRatio,
    strongestSimilarity,
    matchedParagraphs,
    shouldRetry,
    shouldSanitize: shouldRetry && matchedParagraphCount >= MIN_REPLAY_MATCHES,
  };
}

export function stripDistributedReplayedParagraphs(
  currentText: string,
  previousText: string,
): StripDistributedSceneReplayResult {
  const report = analyzeDistributedSceneReplay(currentText, previousText);
  if (!report.shouldSanitize) {
    return {
      sanitizedText: currentText.trim(),
      removedParagraphs: [],
      report,
    };
  }

  const paragraphs = splitReplayParagraphs(currentText);
  const repeatedIndexes = new Set(report.matchedParagraphs.map(item => item.index));
  const preserveLeadingBridge = !hasStrongTerminalStop(previousText);
  const keptParagraphs: string[] = [];
  const removedParagraphs: string[] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (!repeatedIndexes.has(index)) {
      keptParagraphs.push(paragraph);
      continue;
    }
    if (index === 0 && preserveLeadingBridge) {
      keptParagraphs.push(paragraph);
      continue;
    }
    removedParagraphs.push(paragraph);
  }

  const sanitizedText = keptParagraphs.join('\n\n').trim();
  if (removedParagraphs.length === 0 || sanitizedText.length < MIN_SANITIZED_CHARS) {
    return {
      sanitizedText: currentText.trim(),
      removedParagraphs: [],
      report,
    };
  }

  return {
    sanitizedText,
    removedParagraphs,
    report,
  };
}
