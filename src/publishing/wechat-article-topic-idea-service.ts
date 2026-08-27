import { randomUUID } from 'node:crypto';
import { runWithAiUsageContextAsync } from '../ai/usage-context.js';
import type { ChatMessage, ModelClient } from '../models/types.js';
import { parseJsonWithRepair } from '../utils/json-repair.js';
import { cleanPublicFacingContent } from '../utils/public-facing-content.js';
import type {
  WechatArticleTopicHeatLevel,
  WechatArticleTopicIdea,
} from './wechat-article-types.js';

type TopicIdeaGenerationInput = {
  count?: number;
  focus?: string;
};

type TopicIdeaPayload = {
  ideas?: Array<{
    title?: string;
    heatLevel?: string;
    heatScore?: number;
    angle?: string;
    whyNow?: string;
    targetAudience?: string;
    articleType?: string;
    corePromise?: string;
    sourceNotes?: string;
    targetWords?: number;
  }>;
};

const TOPIC_IDEA_SYSTEM_PROMPT = [
  '你是公众号选题策划人，专门给中文 AI / 科技 / 自动化内容创作者提供可直接开写的选题。',
  '你的任务是一次给出一批题目，并附上热度预估和写作切口。',
  '这些题目要像真实公众号会发的标题，不能空泛，不能像课程目录。',
  '热度判断只允许给出基于趋势和讨论势能的预估，不要伪造具体平台数据、阅读量、榜单名次或新闻数字。',
  '如果对时效性没有十足把握，也不要编造“刚刚发布”“今天爆了”之类表述。',
  '优先给出 AI 工具、自动化工作流、内容增长、创作者效率、开发者生产力相关题目。',
  '每个题目都要足够具体，并且能直接转成一篇公众号文章项目。',
  '输出必须是 JSON，不要带解释，不要带 Markdown 代码块。',
  'JSON 结构：{"ideas":[{"title":"","heatLevel":"hot|warm|steady","heatScore":0,"angle":"","whyNow":"","targetAudience":"","articleType":"","corePromise":"","sourceNotes":"","targetWords":0}]}',
].join('\n');

const ALLOWED_HEAT_LEVELS: WechatArticleTopicHeatLevel[] = ['hot', 'warm', 'steady'];
const FALLBACK_ARTICLE_TYPE = '观点拆解';

function normalizePlainText(value: unknown): string {
  return cleanPublicFacingContent(typeof value === 'string' ? value : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHeatLevel(value: unknown, heatScore: number): WechatArticleTopicHeatLevel {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_HEAT_LEVELS.includes(raw as WechatArticleTopicHeatLevel)) {
    return raw as WechatArticleTopicHeatLevel;
  }
  if (heatScore >= 80) return 'hot';
  if (heatScore >= 65) return 'warm';
  return 'steady';
}

function normalizeHeatScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 70;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeTargetWords(value: unknown): number {
  const targetWords = Number(value);
  if (!Number.isFinite(targetWords)) return 1800;
  return Math.max(800, Math.min(3200, Math.round(targetWords / 100) * 100));
}

function buildTopicIdeaPrompt(input: Required<TopicIdeaGenerationInput>): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `当前日期：${today}`,
    `生成数量：${input.count}`,
    `重点方向：${input.focus}`,
    '',
    '要求：',
    '1. 题目要让人一眼知道这篇会讲什么，不要只写“机会、趋势、红利、重构”这类空词。',
    '2. whyNow 用一句话说明为什么现在值得写，强调讨论度、产品节奏、创作者焦虑或实际需求。',
    '3. angle 要写成切入方式，不要写成大而空的主题词。',
    '4. sourceNotes 给作者可补充的公开素材线索，不要假装已经核实过具体数据。',
    '5. articleType 用短词，例如“热点评论”“产品观察”“案例复盘”“方法清单”“观点拆解”。',
    '6. corePromise 要像文章价值承诺，让作者和读者都知道这篇看完能得到什么。',
    '7. 输出语言全部使用简体中文。',
  ].join('\n');
}

function parseTopicIdeas(raw: string): WechatArticleTopicIdea[] {
  const parsed = parseJsonWithRepair<TopicIdeaPayload>(raw);
  if (!parsed || !Array.isArray(parsed.ideas)) {
    throw new Error('选题灵感响应解析失败');
  }

  const ideas: WechatArticleTopicIdea[] = [];
  for (const item of parsed.ideas) {
    const title = normalizePlainText(item.title);
    if (!title) continue;

    const heatScore = normalizeHeatScore(item.heatScore);
    const angle = normalizePlainText(item.angle);
    const whyNow = normalizePlainText(item.whyNow);
    const targetAudience = normalizePlainText(item.targetAudience);
    const articleType = normalizePlainText(item.articleType) || FALLBACK_ARTICLE_TYPE;
    const corePromise = normalizePlainText(item.corePromise);
    const sourceNotes = normalizePlainText(item.sourceNotes);

    ideas.push({
      id: randomUUID(),
      title,
      heatLevel: normalizeHeatLevel(item.heatLevel, heatScore),
      heatScore,
      angle,
      whyNow,
      targetAudience: targetAudience || 'AI 创作者 / 独立开发者 / 内容运营',
      articleType,
      corePromise: corePromise || '帮读者快速判断这个话题值不值得跟进，以及应该怎么切入。',
      sourceNotes,
      targetWords: normalizeTargetWords(item.targetWords),
    });
  }

  if (ideas.length === 0) {
    throw new Error('没有生成可用选题');
  }

  return ideas.slice(0, 12);
}

export class WechatArticleTopicIdeaService {
  constructor(private readonly modelClient: ModelClient) {}

  async generateIdeas(input: TopicIdeaGenerationInput = {}): Promise<WechatArticleTopicIdea[]> {
    const normalizedInput: Required<TopicIdeaGenerationInput> = {
      count: Math.max(6, Math.min(12, Math.round(input.count ?? 8))),
      focus: input.focus?.trim() || 'AI 工具、自动化工作流、创作者效率、内容增长',
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: TOPIC_IDEA_SYSTEM_PROMPT },
      { role: 'user', content: buildTopicIdeaPrompt(normalizedInput) },
    ];
    const response = await runWithAiUsageContextAsync(
      { agentRole: 'wechat-article-topic-planner' },
      () => this.modelClient.chat(messages, { temperature: 0.9, maxTokens: 2600 }),
    );
    return parseTopicIdeas(response.content);
  }
}
