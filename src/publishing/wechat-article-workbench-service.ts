import { runWithAiUsageContextAsync } from '../ai/usage-context.js';
import type { ChatMessage, ModelClient } from '../models/types.js';
import { parseJsonWithRepair } from '../utils/json-repair.js';
import { cleanPublicFacingContent } from '../utils/public-facing-content.js';
import type {
  WechatArticleProject,
  WechatArticleReviewDimension,
  WechatArticleReviewReport,
} from './wechat-article-types.js';

type DraftGenerationPayload = {
  titleOptions: string[];
  draft: string;
};

type ReviewPayload = {
  overallScore: number;
  summary: string;
  nextAction: string;
  dimensions: Array<{
    id: string;
    label: string;
    score: number;
    verdict: string;
    fixes?: string[];
  }>;
};

const DRAFT_SYSTEM_PROMPT = [
  '你是公众号文章写稿参谋。',
  '你的任务不是写空洞宣传稿，而是根据项目 brief 写一篇可继续打磨的公众号中文初稿。',
  '必须具体、自然、像真实创作者或运营者写出来的文章。',
  '避免口号、避免夸大、避免虚构数据、避免“颠覆行业”“全网第一”之类表达。',
  '文章结构尽量包含：标题、开头、3-5 个正文段落、结尾。',
  '写法要像真人成稿，不要像 AI 在列提纲。',
  '不要使用 Markdown 列表、编号列表、加粗小标题，也不要写出“ - **xxx**：”或“1. xxx”这种格式。',
  '即使需要分层表达，也要用自然段推进，不要堆成清单。',
  '输出必须是 JSON，不要带解释，不要带 Markdown 代码块。',
  'JSON 结构：{"titleOptions":[""],"draft":""}',
  'titleOptions 提供 3 个备选标题，draft 提供完整文章正文。',
].join('\n');

const REVIEW_SYSTEM_PROMPT = [
  '你是公众号文章五维审核员。',
  '你要从下面五个维度严格打分，每项 0-10 分，可有一位小数：',
  '1. title_attraction 标题吸引力',
  '2. structure_stability 结构稳定性',
  '3. data_credibility 数据可信度',
  '4. reader_value 读者获得感',
  '5. length_fitness 篇幅合理性',
  '总分为五项平均分。',
  '默认通过阈值为 8.0。',
  '如果 data_credibility 低于 8，pass 必须为 false。',
  '如果文章出现明显提纲腔、列表体、Markdown 加粗小标题，structure_stability 和 reader_value 需要明确扣分。',
  '输出必须是 JSON，不要带解释，不要带 Markdown 代码块。',
  'JSON 结构：{"overallScore":0,"summary":"","nextAction":"","dimensions":[{"id":"","label":"","score":0,"verdict":"","fixes":[""]}]}',
].join('\n');

const REVISION_SYSTEM_PROMPT = [
  '你是公众号文章修订编辑。',
  '你的任务是根据上一轮五维评审意见，对现有文章进行实质性重写，而不是只改几个词。',
  '必须优先修最低分项，尤其是数据可信度、结构稳定性和读者获得感。',
  '如果原稿存在空话、重复、逻辑跳跃或没有获得感，要直接重构段落。',
  '不要虚构数据、案例、采访、用户反馈或行业结论。',
  '保持中文自然、克制、像真人写作，不要广告腔。',
  '不要改成 Markdown 列表、编号框架或加粗标签式小标题。',
  '避免“第一、第二、第三”连续列点，能用自然段说明的内容就不要列清单。',
  '输出必须是 JSON，不要带解释，不要带 Markdown 代码块。',
  'JSON 结构：{"titleOptions":[""],"draft":""}',
  'titleOptions 提供 3 个备选标题，draft 提供修订后的完整文章。',
].join('\n');

const REVIEW_DIMENSION_LABELS: Record<WechatArticleReviewDimension['id'], string> = {
  title_attraction: '标题吸引力',
  structure_stability: '结构稳定性',
  data_credibility: '数据可信度',
  reader_value: '读者获得感',
  length_fitness: '篇幅合理性',
};

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function normalizeDraftBody(rawDraft: string): string {
  return cleanPublicFacingContent(rawDraft)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildDraftPrompt(project: WechatArticleProject): string {
  return [
    `文章题目：${project.title}`,
    `目标读者：${project.targetAudience}`,
    `文章类型：${project.articleType}`,
    `核心承诺：${project.corePromise}`,
    `目标字数：${project.targetWords}`,
    `素材备注：${project.sourceNotes || '暂无额外素材'}`,
    '',
    '要求：',
    '1. 先给出具体标题方案，再给正文。',
    '2. 开头直接给判断、冲突或问题，不要空泛铺垫。',
    '3. 正文要让读者获得明确观点、方法或判断。',
    '4. 不要编造数据、案例或客户反馈。',
  ].join('\n');
}

function buildReviewPrompt(project: WechatArticleProject): string {
  return [
    `文章题目：${project.title}`,
    `目标读者：${project.targetAudience}`,
    `文章类型：${project.articleType}`,
    `核心承诺：${project.corePromise}`,
    `目标字数：${project.targetWords}`,
    '',
    '请审核下面这篇文章初稿：',
    project.latestDraft,
  ].join('\n');
}

function buildRevisionPrompt(project: WechatArticleProject): string {
  const review = project.latestReview;
  if (!review) {
    throw new Error('请先完成一轮五维评审');
  }

  const dimensionLines = review.dimensions.flatMap((item, index) => {
    const lines = [
      `${index + 1}. ${item.label}：${item.score} 分`,
      `评语：${item.verdict}`,
    ];
    if (item.fixes.length > 0) {
      lines.push(`修订建议：${item.fixes.join('；')}`);
    }
    return lines;
  });

  return [
    `文章题目：${project.title}`,
    `目标读者：${project.targetAudience}`,
    `文章类型：${project.articleType}`,
    `核心承诺：${project.corePromise}`,
    `目标字数：${project.targetWords}`,
    `当前总分：${review.overallScore}/${review.threshold}`,
    '',
    '上一轮评审：',
    `总结：${review.summary}`,
    `下一步：${review.nextAction}`,
    ...dimensionLines,
    '',
    '请基于下面这篇现有稿件重写：',
    project.latestDraft,
  ].join('\n');
}

function parseDraftGenerationPayload(raw: string): DraftGenerationPayload {
  const parsed = parseJsonWithRepair<DraftGenerationPayload>(raw);
  if (!parsed || typeof parsed.draft !== 'string' || !Array.isArray(parsed.titleOptions)) {
    throw new Error('文章初稿响应解析失败');
  }

  const titleOptions = parsed.titleOptions
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);

  const normalizedDraft = normalizeDraftBody(parsed.draft);

  if (!normalizedDraft) {
    throw new Error('文章初稿内容为空');
  }

  return {
    titleOptions,
    draft: normalizedDraft,
  };
}

function parseReviewPayload(raw: string): WechatArticleReviewReport {
  const parsed = parseJsonWithRepair<ReviewPayload>(raw);
  if (!parsed || !Array.isArray(parsed.dimensions)) {
    throw new Error('文章评审响应解析失败');
  }

  const dimensions: WechatArticleReviewDimension[] = parsed.dimensions
    .map((item) => {
      const id = String(item.id ?? '') as WechatArticleReviewDimension['id'];
      if (!(id in REVIEW_DIMENSION_LABELS)) return null;
      return {
        id,
        label: REVIEW_DIMENSION_LABELS[id],
        score: normalizeScore(Number(item.score)),
        verdict: String(item.verdict ?? '').trim() || '需要继续优化',
        fixes: Array.isArray(item.fixes)
          ? item.fixes.map((fix) => String(fix).trim()).filter(Boolean).slice(0, 3)
          : [],
      };
    })
    .filter((item): item is WechatArticleReviewDimension => Boolean(item));

  if (dimensions.length === 0) {
    throw new Error('文章评审维度为空');
  }

  const overallScore = normalizeScore(
    parsed.overallScore ?? dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length,
  );
  const dataCredibility = dimensions.find((item) => item.id === 'data_credibility')?.score ?? 0;
  const threshold = 8;
  const pass = overallScore >= threshold && dataCredibility >= threshold;

  return {
    overallScore,
    pass,
    threshold,
    summary: String(parsed.summary ?? '').trim() || '这篇文章已经具备进一步打磨基础，但仍需针对低分项修正。',
    nextAction: String(parsed.nextAction ?? '').trim() || '先处理最低分维度，再进入下一轮修订。',
    reviewedAt: new Date().toISOString(),
    dimensions,
  };
}

export class WechatArticleWorkbenchService {
  constructor(private readonly modelClient: ModelClient) {}

  async generateDraft(project: WechatArticleProject): Promise<DraftGenerationPayload> {
    const messages: ChatMessage[] = [
      { role: 'system', content: DRAFT_SYSTEM_PROMPT },
      { role: 'user', content: buildDraftPrompt(project) },
    ];
    const response = await runWithAiUsageContextAsync(
      { agentRole: 'wechat-article-writer' },
      () => this.modelClient.chat(messages, { temperature: 0.85, maxTokens: 4096 }),
    );
    return parseDraftGenerationPayload(response.content);
  }

  async reviewDraft(project: WechatArticleProject): Promise<WechatArticleReviewReport> {
    if (!project.latestDraft.trim()) {
      throw new Error('请先生成文章初稿');
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: buildReviewPrompt(project) },
    ];
    const response = await runWithAiUsageContextAsync(
      { agentRole: 'wechat-article-reviewer' },
      () => this.modelClient.chat(messages, { temperature: 0.35, maxTokens: 2200 }),
    );
    return parseReviewPayload(response.content);
  }

  async reviseDraft(project: WechatArticleProject): Promise<DraftGenerationPayload> {
    if (!project.latestDraft.trim()) {
      throw new Error('请先生成文章初稿');
    }
    if (!project.latestReview) {
      throw new Error('请先完成一轮五维评审');
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: REVISION_SYSTEM_PROMPT },
      { role: 'user', content: buildRevisionPrompt(project) },
    ];
    const response = await runWithAiUsageContextAsync(
      { agentRole: 'wechat-article-reviser' },
      () => this.modelClient.chat(messages, { temperature: 0.7, maxTokens: 4096 }),
    );
    return parseDraftGenerationPayload(response.content);
  }
}
