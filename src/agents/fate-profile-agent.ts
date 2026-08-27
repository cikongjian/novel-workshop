import type { ModelClient } from '../models/types.js';
import type { DnaBaseInput, DnaFateProfile } from '../server/routes/handlers/fun/dna-schemas.js';
import { DnaFateProfileSchema } from '../server/routes/handlers/fun/dna-schemas.js';

const FATE_PROFILE_MAX_TOKENS = 2200;
const MAX_EVIDENCE_ITEMS = 12;

function extractJsonObject(text: string): unknown | null {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [codeBlock, text].filter((item): item is string => Boolean(item?.trim()));
  for (const candidate of candidates) {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first < 0 || last <= first) continue;
    try {
      return JSON.parse(candidate.slice(first, last + 1));
    } catch {
      continue;
    }
  }
  return null;
}

function fallbackFateProfile(input: DnaBaseInput): DnaFateProfile {
  const topRadar = Object.entries(input.radar)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key);
  const evidence = input.answers.slice(0, MAX_EVIDENCE_ITEMS).map(answer => ({
    question: answer.question,
    selectedOption: answer.selectedOption,
    storyUse: `把“${answer.selectedOption}”转化为${answer.type}维度的主角选择、冲突来源或章节爽点`,
  }));
  const answerOptions = input.answers.map(answer => answer.selectedOption).filter(Boolean);
  return {
    coreFate: `${input.name}在${input.theme}里被迫把每一次选择都打成可见战果`,
    readerPleasure: input.constitutionTags.length ? input.constitutionTags : topRadar,
    themeTraits: [input.theme, ...topRadar, ...answerOptions.slice(0, 4)].filter(Boolean),
    protagonistArchetype: `${input.gender}主角 · ${input.theme}中的高压破局者`,
    conflictBias: evidence[0]?.storyUse ?? '围绕身份落差、关键选择和连续回报推进',
    emotionalTone: '强目标感、快节奏、每个选择都要反哺剧情爽点',
    storyKeywords: [input.name, input.theme, ...input.constitutionTags, ...topRadar, ...answerOptions].filter(Boolean),
    titleDirection: '突出开局压迫、身份反差和选择后的爽点回报',
    openingPromise: evidence[0]?.storyUse ?? '开篇快速给出困境、选择和第一轮爽点兑现',
    decisionEvidence: evidence,
    characterDna: evidence.map(item => item.storyUse),
    worldConstraints: input.answers.slice(0, 6).map(answer => `${answer.type}规则：${answer.selectedOption}必须影响人物关系、资源分配或晋升路径`),
    openingObligations: evidence.slice(0, 4).map(item => item.storyUse),
  };
}

export class FateProfileAgent {
  async generate(input: DnaBaseInput, modelClient: ModelClient): Promise<DnaFateProfile> {
    const response = await modelClient.chat([
      {
        role: 'system',
        content: `你是“命运 Agent”，负责把用户的爽点 DNA 答题、主角设定和题材选择整理成可用于开书的结构化命运画像。
要求：
- 只输出 JSON，不要 markdown。
- 不能只总结成泛化标签。每一道 answers 里的 question + selectedOption 都必须转化为一个明确 storyUse。
- decisionEvidence 必须逐条保留用户选择，每条包含 question、selectedOption、storyUse。
- storyUse 要说明这个选项将如何影响小说：人物 DNA、世界规则、关系结构、开篇冲突、章节爽点或长期成长线。
- characterDna 至少 4 条，用用户选择推导主角性格、说话方式、弱点、执念和行动模式。
- worldConstraints 至少 4 条，用用户选择推导背景宪章、资源规则、晋升/惩罚机制和社会评价体系。
- openingObligations 至少 3 条，规定前三章必须兑现哪些由答题带来的剧情承诺。
- 输出必须贴合中文网文开篇策划。`,
      },
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ], { temperature: 0.75, maxTokens: FATE_PROFILE_MAX_TOKENS });

    const parsed = extractJsonObject(response.content);
    const result = DnaFateProfileSchema.safeParse(parsed);
    if (result.success) return result.data;
    return fallbackFateProfile(input);
  }
}
