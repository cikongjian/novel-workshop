import type { ModelClient } from '../models/types.js';
import type { DnaCreateNovelBody, DnaFateProfile, DnaStoryDesign } from '../server/routes/handlers/fun/dna-schemas.js';
import { DnaStoryDesignSchema } from '../server/routes/handlers/fun/dna-schemas.js';

const STORY_DESIGN_MAX_TOKENS = 3600;
const DEFAULT_OUTLINE_COUNT = 10;
const MAX_MAPPING_ITEMS = 10;

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

function fallbackStoryDesign(input: DnaCreateNovelBody, fateProfile: DnaFateProfile): DnaStoryDesign {
  const title = input.title?.trim() || `${input.name}传`;
  const mappings = fateProfile.decisionEvidence.slice(0, MAX_MAPPING_ITEMS).map(item => ({
    source: `${item.question} -> ${item.selectedOption}`,
    novelUse: item.storyUse,
  }));
  const dnaTraits = fateProfile.characterDna.length
    ? fateProfile.characterDna
    : mappings.map(item => item.novelUse);
  const backgroundCharter = fateProfile.worldConstraints.length
    ? fateProfile.worldConstraints
    : mappings.map(item => `世界规则：${item.novelUse}`);
  return {
    title,
    genre: input.genre,
    synopsis: `${input.name}背负${fateProfile.coreFate}，每个选择都会改写${input.theme}里的资源、名声和关系格局。`,
    sellingPoint: fateProfile.openingPromise || fateProfile.titleDirection,
    protagonist: {
      name: input.name,
      gender: input.gender,
      role: 'protagonist',
      personality: [fateProfile.emotionalTone, ...dnaTraits.slice(0, 2)].filter(Boolean).join('；'),
      appearance: '',
      backstory: [fateProfile.coreFate, ...mappings.slice(0, 2).map(item => item.novelUse)].filter(Boolean).join('；'),
      goal: fateProfile.openingPromise || '把每一次被动选择打成主动优势',
      dnaTraits,
      weakness: mappings[0]?.novelUse ?? fateProfile.conflictBias,
      belief: '所有选择都必须换来可见战果',
    },
    storyBlueprint: {
      premise: fateProfile.coreFate,
      mainConflict: fateProfile.conflictBias,
      worldview: `${input.theme}题材下，名声、资源和关系会被选择持续改写。`,
      powerSystem: fateProfile.themeTraits.join('、'),
      backgroundCharter,
      characterDnaRules: dnaTraits,
      decisionMappings: mappings,
      openingHook: fateProfile.openingPromise,
      volumeArc: '第一卷围绕答题选择生成的背景规则推进：先暴露困局，再兑现反击，再建立长期爽点循环。',
      chapterOutline: Array.from({ length: DEFAULT_OUTLINE_COUNT }, (_, index) => {
        const mapping = mappings[index % Math.max(mappings.length, 1)];
        return {
          chapterNumber: index + 1,
          title: `第${index + 1}章`,
          summary: mapping
            ? `围绕“${mapping.source}”展开，把它落实为：${mapping.novelUse}`
            : (index === 0 ? fateProfile.openingPromise : `推进${fateProfile.conflictBias}，兑现阶段性爽点。`),
        };
      }),
    },
  };
}

export class StoryDesignAgent {
  async generate(
    input: DnaCreateNovelBody,
    fateProfile: DnaFateProfile,
    modelClient: ModelClient,
  ): Promise<DnaStoryDesign> {
    const response = await modelClient.chat([
      {
        role: 'system',
        content: `你是“故事设计 Agent”，负责把命运画像、主角设定、题材和爽点落成一本中文网文的基础档案与故事蓝图。
要求：
- 只输出 JSON，不要 markdown。
- 必须尊重用户选择的书名；如果没有书名，生成一个更适合网文平台的标题。
- 不允许把 fateProfile.decisionEvidence 丢掉或只概括成泛化爽点。
- decisionMappings 必须逐条引用 decisionEvidence，source 写“题目 -> 选项”，novelUse 写它在小说中的具体用途。
- backgroundCharter 必须来自用户选择，说明世界/行业/资源/名声/晋升/惩罚规则。
- characterDnaRules 和 protagonist.dnaTraits 必须来自用户选择，说明主角行动模式、弱点、执念、说话风格和成长按钮。
- chapterOutline 生成 8-10 章，每章 summary 至少引用一个 decisionMappings 的用途，不能重复模板句。
- 简介、卖点、主角设定和故事蓝图必须服务同一个核心爽点。`,
      },
      {
        role: 'user',
        content: JSON.stringify({ ...input, fateProfile }, null, 2),
      },
    ], { temperature: 0.78, maxTokens: STORY_DESIGN_MAX_TOKENS });

    const parsed = extractJsonObject(response.content);
    const result = DnaStoryDesignSchema.safeParse(parsed);
    if (result.success) {
      return {
        ...result.data,
        title: input.title?.trim() || result.data.title,
        genre: input.genre,
        protagonist: {
          ...result.data.protagonist,
          name: input.name,
          gender: input.gender,
          role: 'protagonist',
        },
      };
    }
    return fallbackStoryDesign(input, fateProfile);
  }
}
