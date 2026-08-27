export type SurfaceRegressionReport = {
  passed: boolean;
  beforeDefects: number;
  afterDefects: number;
  addedDefects: number;
  examples: string[];
  summary: string;
};

const DEFECT_PATTERNS: RegExp[] = [
  /^\s*的声音/u,
  /^\s*(?:在另一侧|走在她外侧|系上围裙|放下自己的刀|换了左手|右肩的肌肉)/u,
  /但\s+看见/u,
  /看见\s+从/u,
  /——\s*在耳麦里说/u,
];

function collectSurfaceDefects(text: string): string[] {
  const defects: string[] = [];
  const paragraphs = text
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    if (DEFECT_PATTERNS.some(pattern => pattern.test(paragraph))) {
      defects.push(paragraph.slice(0, 120));
    }
  }

  return defects;
}

export function evaluateSurfaceRegression(params: {
  beforeText: string;
  afterText: string;
}): SurfaceRegressionReport {
  const beforeDefects = collectSurfaceDefects(params.beforeText);
  const afterDefects = collectSurfaceDefects(params.afterText);
  const addedDefects = Math.max(0, afterDefects.length - beforeDefects.length);
  const passed = addedDefects === 0;

  return {
    passed,
    beforeDefects: beforeDefects.length,
    afterDefects: afterDefects.length,
    addedDefects,
    examples: afterDefects.slice(0, 5),
    summary: passed
      ? 'surface regression guard passed'
      : `surface regression guard found ${addedDefects} new dangling-subject defects`,
  };
}
