import type { ChapterPromiseCard } from './chapter-promise-card.js';

export type StartupSceneBoundaryIssue = {
  code: string;
  message: string;
};

function normalizeSceneText(text: string): string {
  return (text ?? '')
    .replace(/\(#.*?\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[“”"'‘’`]/g, '')
    .replace(/[，。！？、；：,.!?;:()\[\]{}<>《》【】\-_]/g, '');
}

function buildFingerprints(text: string): Set<string> {
  const normalized = normalizeSceneText(text);
  const fingerprints = new Set<string>();
  if (normalized.length < 24) return fingerprints;

  for (let index = 0; index <= normalized.length - 12; index += 4) {
    fingerprints.add(normalized.slice(index, index + 12));
  }

  return fingerprints;
}

function estimateSimilarity(left: string, right: string): number {
  const leftPrints = buildFingerprints(left);
  const rightPrints = buildFingerprints(right);
  if (leftPrints.size === 0 || rightPrints.size === 0) return 0;

  let overlap = 0;
  for (const fingerprint of leftPrints) {
    if (rightPrints.has(fingerprint)) overlap += 1;
  }

  return overlap / Math.min(leftPrints.size, rightPrints.size);
}

function estimateCharOverlap(left: string, right: string): number {
  const normalizedLeft = normalizeSceneText(left);
  const normalizedRight = normalizeSceneText(right);
  if (!normalizedLeft || !normalizedRight) return 0;

  const leftChars = new Set(normalizedLeft);
  const rightChars = new Set(normalizedRight);
  let overlap = 0;
  for (const ch of leftChars) {
    if (rightChars.has(ch)) overlap += 1;
  }
  const smaller = Math.min(leftChars.size, rightChars.size);
  return smaller === 0 ? 0 : overlap / smaller;
}

function extractLeadingExcerpt(text: string): string {
  const paragraphs = splitParagraphs(text);
  return paragraphs.slice(0, 2).join('\n\n').slice(0, 420);
}

function splitParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function buildReplayWindows(text: string): string[] {
  const paragraphs = splitParagraphs(text);
  const windows: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const single = paragraphs[index];
    if (single) windows.push(single);
    const pair = paragraphs.slice(index, index + 2).join('\n\n').trim();
    if (pair.length > (single?.length ?? 0)) windows.push(pair);
  }
  return windows;
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

const survivalOpeningMarkers = [
  /冰冷的铁链/u,
  /被粗暴地推进/u,
  /贡献点不够/u,
  /负债[:：]-?100/u,
  /界门启动/u,
  /是否穿越/u,
];

const survivalLatePayoffMarkers = [
  /净水芯片/u,
  /Aqua-Purge/u,
  /贡献点\+/u,
  /熵值恢复中/u,
  /下次连接/u,
  /大炎王朝/u,
  /可携带质量上限/u,
];

const survivalTradingMarkers = [
  /老拾荒者/u,
  /估个价/u,
  /扫描仪/u,
  /成交/u,
  /默念回归/u,
];

export function estimateLeadingSceneReplaySimilarity(currentText: string, previousText: string): number {
  return estimateSimilarity(extractLeadingExcerpt(currentText), extractLeadingExcerpt(previousText));
}

export function estimateLeadingSceneReplayAgainstFullContext(currentText: string, previousText: string): number {
  const leadingExcerpt = extractLeadingExcerpt(currentText);
  if (!leadingExcerpt.trim() || !previousText.trim()) return 0;

  let maxSimilarity = 0;
  for (const candidate of buildReplayWindows(previousText)) {
    maxSimilarity = Math.max(
      maxSimilarity,
      estimateSimilarity(leadingExcerpt, candidate),
      estimateCharOverlap(leadingExcerpt, candidate),
    );
    if (maxSimilarity >= 0.999) break;
  }
  return maxSimilarity;
}

export function detectStartupSceneBoundaryIssues(params: {
  genreFocus: ChapterPromiseCard['genreFocus'];
  sceneIndex: number;
  sceneText: string;
  priorChapterContent?: string;
}): StartupSceneBoundaryIssue[] {
  const { genreFocus, sceneIndex, sceneText, priorChapterContent } = params;
  if (!sceneText.trim()) return [];

  const issues: StartupSceneBoundaryIssue[] = [];
  const head = extractLeadingExcerpt(sceneText);

  if (genreFocus === 'survival') {
    if (sceneIndex === 0 && countMatches(sceneText, survivalLatePayoffMarkers) >= 2) {
      issues.push({
        code: 'survival-overcompleted-opening',
        message: '第一功能块提前写完了到账、净水升级或下一轮世界预告，越过了本场边界。',
      });
    }

    if (sceneIndex === 1 && countMatches(head, survivalOpeningMarkers) >= 2) {
      issues.push({
        code: 'survival-replayed-opening',
        message: '第二功能块开头又回到了被推进车厢和发现界门的起点，没有直接承接第一场结果。',
      });
    }

    if (sceneIndex === 1 && /(熵值恢复中|下次连接|大炎王朝|可携带质量上限)/u.test(sceneText)) {
      issues.push({
        code: 'survival-overcompleted-middle',
        message: '第二功能块提前写到了下一轮资源窗口和章尾钩子，导致中段越界。',
      });
    }

    if (sceneIndex >= 2 && countMatches(head, survivalOpeningMarkers) >= 2) {
      issues.push({
        code: 'survival-replayed-opening',
        message: '最后功能块重新从开篇绝境写起，没有承接“资源已带回”的既成事实。',
      });
    }

    if (sceneIndex >= 2 && countMatches(head, survivalTradingMarkers) >= 3) {
      issues.push({
        code: 'survival-replayed-trade',
        message: '最后功能块又把第一次废土交易完整重演了一遍，没有直接进入升级结果和新威胁。',
      });
    }
  }

  if (sceneIndex > 0 && priorChapterContent?.trim()) {
    const fullReplaySimilarity = estimateLeadingSceneReplayAgainstFullContext(sceneText, priorChapterContent);
    if (fullReplaySimilarity >= 0.48) {
      issues.push({
        code: 'generic-replayed-core-beat',
        message: '当前场景开头疑似重跑了前文已经完成的关键台词、关键证据或关键反击，没有直接进入新结果。',
      });
    }
  }

  return issues;
}

export function buildStartupSceneBoundaryRepairDirective(params: {
  sceneNumber: number;
  sceneTitle: string;
  sceneSummary: string;
  sceneNotes?: string;
  issues: StartupSceneBoundaryIssue[];
}): string {
  return [
    `## 启动章功能块边界修复：场景${params.sceneNumber}《${params.sceneTitle}》`,
    `- 当前场景必须完成的功能：${params.sceneSummary}`,
    params.sceneNotes ? `- 当前场景执行提醒：${params.sceneNotes}` : '',
    `- 这次输出的边界问题：${params.issues.map(item => item.message).join('；')}`,
    '- 当前场景只能承接上一场已发生的结果继续往后写，禁止重启整章、禁止压缩回放前文、禁止一次写完后两场。',
    '- 如果需要提到前情，只能用一句短句交代，随后立刻进入本场新的动作、新的交换结果或新的威胁。',
  ].filter(Boolean).join('\n');
}
