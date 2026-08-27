type WorldRuleEvidenceParams = {
  chapterContent: string;
  names: string[];
  constraints: string[];
  consequences: string[];
};

export type WorldRuleEvidence = {
  constraintMatched: boolean;
  consequenceMatched: boolean;
  contradicted: boolean;
  constraintScore: number;
  consequenceScore: number;
};

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '');
}

function buildBigrams(value: string): Set<string> {
  const normalized = normalizeText(value);
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index++) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function coverageScore(rule: string, text: string): number {
  const normalizedRule = normalizeText(rule);
  const normalizedText = normalizeText(text);
  if (!normalizedRule || !normalizedText) return 0;
  if (normalizedText.includes(normalizedRule)) return 1;

  const expected = buildBigrams(normalizedRule);
  if (expected.size === 0) return 0;
  const actual = buildBigrams(normalizedText);
  let matched = 0;
  for (const token of expected) {
    if (actual.has(token)) matched++;
  }
  return matched / expected.size;
}

function extractMentionWindows(content: string, names: string[], radius = 180): string[] {
  const windows: string[] = [];
  for (const name of names) {
    const normalizedName = name.trim();
    if (!normalizedName) continue;
    let index = content.indexOf(normalizedName);
    while (index >= 0 && windows.length < 12) {
      windows.push(content.slice(Math.max(0, index - radius), Math.min(content.length, index + normalizedName.length + radius)));
      index = content.indexOf(normalizedName, index + normalizedName.length);
    }
  }
  return windows.length > 0 ? windows : [content];
}

function bestRuleScore(rules: string[], windows: string[]): number {
  let best = 0;
  for (const rule of rules) {
    for (const window of windows) {
      best = Math.max(best, coverageScore(rule, window));
    }
  }
  return best;
}

function detectsContradiction(rules: string[], windows: string[]): boolean {
  const ruleText = rules.join('；');
  const nearbyText = windows.join('\n');
  if (/关闭|封闭|封锁/.test(ruleText) && /形同虚设|彻夜敞开|保持开放|畅通无阻|任意通行|随意通行/.test(nearbyText)) return true;
  if (/禁止|不得|不能/.test(ruleText) && /形同虚设|任意|随意|无需|照样|可以直接|允许所有/.test(nearbyText)) return true;
  if (/只能|只有|仅限|必须持有/.test(ruleText) && /任何人|所有人|任意|无需|都可以/.test(nearbyText)) return true;
  if (/唯一|仅可|仅能|只可|只服从|共同决议/.test(ruleText) && /任何|任意|无需|一人(?:即可|可以|能够)|随处/.test(nearbyText)) return true;
  if (/代价|消耗|损伤|衰竭|反噬/.test(ruleText) && /无代价|毫无代价|无需消耗|没有消耗|毫发无损|不会受损/.test(nearbyText)) return true;
  if (/控制|管辖|封锁|驻守/.test(ruleText) && /无人管辖|无人驻守|不受控制|自由出入|任意出入/.test(nearbyText)) return true;
  if (/扣押|惩罚|追责|处罚/.test(ruleText) && /无人追究|无需负责|不受惩罚|免于处罚|安然无恙/.test(nearbyText)) return true;
  return false;
}

export function evaluateWorldRuleEvidence(params: WorldRuleEvidenceParams): WorldRuleEvidence {
  const windows = extractMentionWindows(params.chapterContent, params.names);
  const constraintScore = bestRuleScore(params.constraints, windows);
  const consequenceScore = bestRuleScore(params.consequences, windows);
  return {
    constraintMatched: params.constraints.length > 0 && constraintScore >= 0.3,
    consequenceMatched: params.consequences.length > 0 && consequenceScore >= 0.3,
    contradicted: detectsContradiction([...params.constraints, ...params.consequences], windows),
    constraintScore: Number(constraintScore.toFixed(3)),
    consequenceScore: Number(consequenceScore.toFixed(3)),
  };
}
