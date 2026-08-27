import type { Router } from 'express';
import type { ModelClient } from '../../../../models/types.js';
import { FateProfileAgent } from '../../../../agents/fate-profile-agent.js';
import {
  DnaSeedIdeaBodySchema,
  DnaSeedIdeaCardSchema,
  type DnaFateProfile,
  type DnaSeedIdeaBody,
  type DnaSeedIdeaCard,
} from './dna-schemas.js';

const SEED_MAX_TOKENS = 1600;
const SEED_IDEA_MAX_LENGTH = 800;
const SYNOPSIS_MAX_LENGTH = 500;
const FIELD_MAX_LENGTH = 180;

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

function trim(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function answerLine(answer: DnaSeedIdeaBody['answers'][number]): string {
  return `${answer.question}：${answer.selectedOption}`;
}

function buildFallbackSeedIdea(body: DnaSeedIdeaBody, fateProfile: DnaFateProfile): DnaSeedIdeaCard {
  const openingChoice = body.answers.find(answer => answer.type === 'opening')?.selectedOption ?? body.answers[0]?.selectedOption ?? '开局陷入众人围观的低谷';
  const relationshipChoice = body.answers.find(answer => answer.type === 'relationship')?.selectedOption ?? '关键盟友在最低谷时站到主角身边';
  const comebackChoice = body.answers.find(answer => answer.type === 'comeback')?.selectedOption ?? fateProfile.readerPleasure[0] ?? '把羞辱打成高光';
  const sceneChoice = body.answers.find(answer => answer.type === 'scene')?.selectedOption ?? fateProfile.themeTraits[0] ?? body.theme;
  const title = body.title?.trim() || (openingChoice.includes('退婚')
    ? '退婚现场，我让全家改口了'
    : sceneChoice.includes('猫')
      ? '我养的猫替我改命了'
      : relationshipChoice.includes('扶')
        ? '社死现场，他偏要扶我上位'
        : `${body.name}今天不退场`);
  const answerLines = body.answers.map(answerLine).slice(0, 8);
  const protagonist = `${body.name}，${body.gender}主角，外表被动入局，底层行动模式是${comebackChoice}。`;
  const world = `${body.theme}背景下，名声、资源、关系和公众评价会直接决定主角能否翻身。`;
  const conflict = `${openingChoice}引爆第一重困境，${relationshipChoice}成为关系钩子，主角必须把每次选择变成可见回报。`;
  const opening = `第一章从${openingChoice}切入，让主角在最难看的场面里抓住${sceneChoice}，完成第一轮反击或立住金手指。`;
  const dnaBrief = answerLines.join('；');
  const synopsis = `${body.name}在${body.theme}里被迫接下一手烂局。她没有退路，只能把${openingChoice}变成翻身入口，用${relationshipChoice}撬动关系与资源，再把${comebackChoice}做成所有人看得见的高光。`;
  const seedIdea = [
    `主角：${protagonist}`,
    `背景：${world}`,
    `核心冲突：${conflict}`,
    `开篇：${opening}`,
    `必须吸收的 DNA 选择：${dnaBrief}`,
    '后续生成蓝图、大纲、宪章、角色和第一章时，必须把这些选择写成真实情节，不要写成策划说明。',
  ].join('\n');

  return DnaSeedIdeaCardSchema.parse({
    title,
    synopsis,
    seedIdea: trim(seedIdea, SEED_IDEA_MAX_LENGTH),
    protagonist,
    world,
    conflict,
    opening,
    dnaBrief,
  });
}

function parseSeedIdeaCard(content: string): DnaSeedIdeaCard | null {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const candidate = record.idea && typeof record.idea === 'object' ? record.idea : record;
  const result = DnaSeedIdeaCardSchema.safeParse(candidate);
  if (!result.success) return null;
  return {
    title: trim(result.data.title, 40),
    synopsis: trim(result.data.synopsis, SYNOPSIS_MAX_LENGTH),
    seedIdea: trim(result.data.seedIdea, SEED_IDEA_MAX_LENGTH),
    protagonist: trim(result.data.protagonist, FIELD_MAX_LENGTH),
    world: trim(result.data.world, FIELD_MAX_LENGTH),
    conflict: trim(result.data.conflict, FIELD_MAX_LENGTH),
    opening: trim(result.data.opening, FIELD_MAX_LENGTH),
    dnaBrief: trim(result.data.dnaBrief, SEED_IDEA_MAX_LENGTH),
  };
}

export function registerDnaSeedIdeaRoute(router: Router, deps: { modelClient: ModelClient }): void {
  router.post('/dna/seed-idea', async (req, res) => {
    const parsed = DnaSeedIdeaBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数有误' });
      return;
    }

    try {
      const body = parsed.data;
      const fateProfile = body.fateProfile ?? await new FateProfileAgent().generate(body, deps.modelClient);
      const response = await deps.modelClient.chat([
        {
          role: 'system',
          content: `你是“女娲造人”的脑洞转译 Agent，本质是结构化填表版神笔马良。
你的任务不是创建小说文件，而是把用户的 DNA 答题、主角、题材和书名转成一个可直接交给爽文开书管线的高质量 seedIdea。

必须只输出 JSON，不要 markdown。
只输出一个脑洞，不要多方案。
必须由你根据 DNA 表单自主生成 title，不要等待用户提供标题；标题要服务 seedIdea，不要像独立的书名抽卡。
标题要避免同质化，必须从答题里的具体事件、身份反差、金手指或第一章钩子中提炼，不要泛泛写“烂局”“王炸”“逆袭”“翻盘”。
所有答题选项都要被吸收成真实故事元素：人物欲望、开局事件、关系钩子、世界规则、冲突对象、金手指或爽点回报。
禁止出现“把某选项转化为某维度”这类系统元话术。
seedIdea 要像写给后续 Agent 的开书任务单，120-220 字，包含题材、主角、目标、核心冲突、爽点、第一章钩子。
seedIdea 里不要写“书名：xxx”，正式书名由后续爽文蓝图 Agent 根据 seedIdea 再定。

输出格式：
{"title":"书名","synopsis":"可展示给用户的简介，100-180字","seedIdea":"开书提示，120-220字","protagonist":"主角设定，40-80字","world":"背景设定，40-80字","conflict":"核心冲突，40-80字","opening":"第一章驱动事件，40-80字","dnaBrief":"答题选择如何影响故事，80-160字"}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: body.title,
            name: body.name,
            gender: body.gender,
            theme: body.theme,
            genre: body.genre,
            constitutionTags: body.constitutionTags,
            answers: body.answers,
            radar: body.radar,
            fateProfile,
          }, null, 2),
        },
      ], { temperature: 0.82, maxTokens: SEED_MAX_TOKENS });

      const idea = parseSeedIdeaCard(response.content) ?? buildFallbackSeedIdea(body, fateProfile);
      res.json({ fateProfile, idea });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'DNA 脑洞生成失败' });
    }
  });
}
