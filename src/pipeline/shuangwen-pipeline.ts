import { randomUUID } from 'node:crypto';

import type { ModelClient, ModelCallOptions, ChatMessage } from '../models/types.js';
import type { NovelAgent, AgentContext, AgentEvent, AgentOutput } from '../agents/types.js';
import type { PipelineNovelManager, PipelineMemory, ShuangwenChapterResult } from './types.js';
import { detectCharacterStatus, getLatestStateEntry } from '../utils/character-status.js';
import { evaluateQualityGate } from './quality-gate.js';
import {
  evaluateHookGate,
  evaluateCycleGate,
  evaluateForbiddenGate,
  buildHookFixHints,
  buildCycleFixHints,
  buildForbiddenFixHints,
  type ShuangwenGateMode,
} from './shuangwen-gates.js';
import { stripDriftTerms } from './setting-drift-gate.js';
import { DEFAULT_CHAPTER_WORD_TARGET } from './chapter-length-guard.js';

// Export types and values from shuangwen-types.ts for backward compatibility
export {
  ShuangwenAudience,
  type ShuangwenBlueprint,
  ShuangwenBlueprintSchema,
  type ShuangwenMarketingPayload,
  MarketingPayloadSchema,
  type ShuangwenSampleChapter,
  type ShuangwenPipelineRunResult,
  inferShuangwenAudienceFromGenre,
} from './shuangwen-types.js';

// Import types and utilities
import {
  ShuangwenAudience,
  ShuangwenBlueprintSchema,
  MarketingPayloadSchema,
  type ShuangwenBlueprint,
  type ShuangwenMarketingPayload,
  type ShuangwenSampleChapter,
  type ShuangwenPipelineRunResult,
} from './shuangwen-types.js';

import {
  parseEditorOutput,
  getAudienceRules,
  coerceOutlineData,
  getNarrativePhase,
  buildFallbackOutlineFromBlueprint,
} from './shuangwen-utils.js';
import { parseJsonPayload } from '../utils/json-payload.js';

export class ShuangwenPipeline {
  constructor(
    private deps: {
      modelClient: ModelClient;
      agents: Map<string, NovelAgent>;
      novelManager?: PipelineNovelManager;
      memory?: PipelineMemory;
      onEvent?: (event: AgentEvent) => void;
    },
  ) {}

  private emit(event: AgentEvent): void {
    this.deps.onEvent?.(event);
  }

  /** 发送一个瞬时的 writing-assistant 进度提示（start→chunk→complete），用于非 Agent 阶段的可视化 */
  private emitStageProgress(novelId: string, chapterNumber: number, message: string): void {
    const ts = new Date().toISOString();
    const base = { agentRole: 'writing-assistant' as const, novelId, chapterNumber, timestamp: ts };
    this.emit({ ...base, type: 'agent:start', data: '' });
    this.emit({ ...base, type: 'agent:chunk', data: message });
    this.emit({ ...base, type: 'agent:complete', data: message });
  }

  private async executeAgent(agent: NovelAgent, context: AgentContext): Promise<AgentOutput> {
    this.emit({
      type: 'agent:start',
      agentRole: agent.role,
      novelId: context.novelId,
      chapterNumber: context.chapterNumber,
      data: '',
      timestamp: new Date().toISOString(),
    });

    try {
      const output = await agent.execute(context, this.deps.modelClient, (chunk) => {
        this.emit({
          type: 'agent:chunk',
          agentRole: agent.role,
          novelId: context.novelId,
          chapterNumber: context.chapterNumber,
          data: chunk,
          timestamp: new Date().toISOString(),
        });
      });

      this.emit({
        type: 'agent:complete',
        agentRole: agent.role,
        novelId: context.novelId,
        chapterNumber: context.chapterNumber,
        data: output.content,
        timestamp: new Date().toISOString(),
        usage: typeof output.metadata?.inputTokens === 'number'
          ? {
              inputTokens: output.metadata.inputTokens as number,
              outputTokens: output.metadata.outputTokens as number,
              provider: String(output.metadata.provider ?? ''),
              model: String(output.metadata.model ?? ''),
            }
          : undefined,
      });

      return output;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'agent execution failed';
      this.emit({
        type: 'agent:error',
        agentRole: agent.role,
        novelId: context.novelId,
        chapterNumber: context.chapterNumber,
        data: message,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  /**
   * 调用模型并解析 JSON，带重试。模型返回的长 JSON 偶尔格式不合法
   * （缺逗号/截断/多余文本），一次解析失败就中断整条管线过于脆弱，
   * 因此解析失败时降低温度、增加 maxTokens 重试，最多 maxAttempts 次。
   */
  private async chatForJson<T = unknown>(
    messages: ChatMessage[],
    baseOpts: ModelCallOptions,
    options: { label: string; maxAttempts?: number; validate?: (parsed: unknown) => T },
  ): Promise<{ raw: string; value: T }> {
    const maxAttempts = options.maxAttempts ?? 3;
    const opts: ModelCallOptions = { ...baseOpts };
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await this.deps.modelClient.chat(messages, opts);
      try {
        const parsed = parseJsonPayload(response.content);
        const value = options.validate ? options.validate(parsed) : (parsed as T);
        return { raw: response.content, value };
      } catch (err) {
        lastError = err;
        if (attempt === maxAttempts - 1) break;
        // 重试：降温度提升 JSON 稳定性，加 maxTokens 防截断
        opts.temperature = Math.max(0.2, (opts.temperature ?? 0.7) - 0.2);
        opts.maxTokens = (opts.maxTokens ?? 2000) + 1000;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`${options.label} JSON 解析失败`);
  }

  async generateBlueprint(params: {
    audience: ShuangwenAudience;
    genre: string;
    seedIdea?: string;
    titleHint?: string;
    synopsisHint?: string;
    temperatureOverride?: number;
  }): Promise<ShuangwenBlueprint> {
    const seedIdea = (params.seedIdea ?? '').trim();
    const titleHint = (params.titleHint ?? '').trim();
    const synopsisHint = (params.synopsisHint ?? '').trim();

    const system = [
      '你是中文网文"爽文/甜爽"爆款策划总监。',
      '目标：生成可直接落地写作的策划蓝图，强调强钩子、强情绪、强节奏、章末留悬念。',
      '安全要求：不写未成年人性内容，不写性暴力/强迫性性行为；不鼓励现实违法；避免极端血腥细节。',
      '输出必须是严格 JSON，不要任何多余文本。',
    ].join('\n');

    const user = [
      `audience: ${params.audience}`,
      `genre: ${params.genre}`,
      seedIdea ? `seedIdea: ${seedIdea}` : '',
      titleHint ? `titleHint: ${titleHint}` : '',
      synopsisHint ? `synopsisHint: ${synopsisHint}` : '',
      '',
      getAudienceRules(params.audience),
      '',
      '5. 先从 seedIdea 中智能识别核心题材与卖点（可从身份反差、特殊职业、命运转折、情感羁绊、奇遇道具、世界观特色、地域时代等维度提取，以 seedIdea 实际内容为准），再据此生成标题候选；禁止“今天不退场”“我把烂局打成王炸”“这波稳了”“某某不认命”这类空泛口号。',
      '6. 标题候选要像真实番茄/起点项目名，紧扣识别出的题材卖点，能体现本书的差异化钩子；不得强行套用任何特定题材词（如系统、金手指、面板、签到等），一切以 seedIdea 的实际内容为依据；只要卖点清晰即可，不要求标题必须包含某种设定词。',
      '7. constraints 与 forbidden 不得包含跨世界/系统化设定（如上界神明、跨界传送门、坐标-碎片-覆写系统、数据库化术语），除非 seedIdea 明确要求该题材；金手指限制要落在角色能力/资源/代价层面，不要引入独立的"系统"世界观。',
      '',
      '请输出 JSON，字段如下（字段名必须一致）：',
      '{',
      '  "audience": "male" | "female",',
      '  "genre": "类型标签",',
      '  "identifiedSellingPoint": "从 seedIdea 识别出的核心题材卖点（30~80字，说明本书靠什么吸引读者）",',
      '  "titleCandidates": ["候选1", "候选2", ...],  // 3~12个，紧扣 identifiedSellingPoint',
      '  "logline": "一句话钩子（30~80字）",',
      '  "synopsis": "完整简介（200~500字）",',
      '  "tags": ["标签1", "标签2", ...],',
      '  "hook": {',
      '    "openingScene": "开篇冲突场景（80~150字）",',
      '    "incitingIncident": "引爆事件（50~100字）",',
      '    "firstPayoff": "首次爽点/甜点兑现（50~100字）",',
      '    "chapterEndHookRule": "章末留钩子规则（30~80字）"',
      '  },',
      '  "protagonist": {',
      '    "name": "主角名",',
      '    "archetype": "角色原型（如：废柴逆袭/天才少女）",',
      '    "goal": "核心目标",',
      '    "flaw": "核心缺陷"',
      '  },',
      '  "antagonist": {',
      '    "name": "对手名",',
      '    "archetype": "对手原型",',
      '    "threat": "核心威胁"',
      '  },',
      '  "engine": {',
      '    "cycleFormula": "爽文循环公式（如：受挫→信息差→反击→震惊→新目标）",',
      '    "escalationRule": "升级规则（如：敌人更强/资源更大/代价更高）",',
      '    "constraints": ["约束1", "约束2", ...]  // 可选，世界/能力限制',
      '  },',
      '  "styleGuide": "文风指南（100~300字）",',
      '  "forbidden": ["禁止项1", "禁止项2", ...]  // 可选，负面清单',
      '}',
    ].filter(Boolean).join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const callOpts: ModelCallOptions = {
      temperature: params.temperatureOverride ?? 0.7,
      maxTokens: 4000,
    };

    const { value: blueprint } = await this.chatForJson(messages, callOpts, {
      label: 'generateBlueprint',
      validate: (parsed) => ShuangwenBlueprintSchema.parse(parsed),
    });
    return blueprint;
  }

  async generateOutline(params: {
    blueprint: ShuangwenBlueprint;
    desiredChapters: number;
    temperatureOverride?: number;
  }): Promise<{ raw: string; outline: ShuangwenPipelineRunResult['outline'] }> {
    const { blueprint, desiredChapters } = params;
    const desired = Math.max(1, Math.min(60, desiredChapters));

    const system = [
      '你是中文网文大纲设计师。',
      '任务：根据策划蓝图，生成全书章节大纲。',
      '要求：每章独立推进，有清晰爽点/甜点，章末留钩子。',
      '输出必须是严格 JSON，不要任何多余文本。',
    ].join('\n');

    const user = [
      '【策划蓝图】',
      JSON.stringify(blueprint, null, 2),
      '',
      `【章节总数】${desired}`,
      '',
      '请输出 JSON，格式如下：',
      '{',
      '  "chapters": [',
      '    {',
      '      "chapterNumber": 1,',
      '      "title": "章节标题",',
      '      "summary": "本章摘要（200~500字）",',
      '      "tensionTarget": 1~10,  // 紧张度',
      '      "keyEvents": ["事件1", "事件2", ...],  // 最多12个',
      '      "notes": "备注（可选）"',
      '    },',
      '    ...  // 每章一条',
      '  ]',
      '}',
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const callOpts: ModelCallOptions = {
      temperature: params.temperatureOverride ?? 0.6,
      maxTokens: 4000,
    };

    const { raw, value } = await this.chatForJson(messages, callOpts, { label: 'generateOutline' });
    const outline = coerceOutlineData(value, desired);

    return { raw, outline };
  }

  async generateMarketing(params: {
    blueprint: ShuangwenBlueprint;
    outline: ShuangwenPipelineRunResult['outline'];
    temperatureOverride?: number;
  }): Promise<{ raw: string; parsed: boolean; payload?: ShuangwenMarketingPayload }> {
    const { blueprint, outline } = params;

    const system = [
      '你是中文网文营销策划师。',
      '任务：根据策划蓝图和大纲，生成营销素材。',
      '目标：提炼卖点，吸引目标读者，平台转化率最大化。',
      '输出必须是严格 JSON，不要任何多余文本。',
    ].join('\n');

    const user = [
      '【策划蓝图】',
      JSON.stringify(blueprint, null, 2),
      '',
      '【大纲（前10章）】',
      JSON.stringify(outline.chapters.slice(0, 10), null, 2),
      '',
      '请输出 JSON，格式如下：',
      '{',
      '  "titleCandidates": ["候选1", "候选2", ...],  // 3~8个',
      '  "sellingPoints": ["卖点1", "卖点2", ...],  // 4~10个',
      '  "oneLiner": "一句话钩子（30~80字）",',
      '  "shortIntro": "短简介（100~200字）",',
      '  "longIntro": "长简介（300~600字）",',
      '  "characterCards": [',
      '    {',
      '      "name": "角色名",',
      '      "tagline": "角色钩子（20~50字）",',
      '      "highlights": ["亮点1", "亮点2", ...],  // 各10~30字',
      '      "description": "详细描述（100~300字）"',
      '    },',
      '    ...  // 主角+核心配角',
      '  ],',
      '  "hookTeasers": ["钩子1", "钩子2", ...]  // 6~12个，各15~50字',
      '}',
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const callOpts: ModelCallOptions = {
      temperature: params.temperatureOverride ?? 0.8,
      maxTokens: 2500,
    };

    const response = await this.deps.modelClient.chat(messages, callOpts);
    const raw = response.content;

    try {
      const parsed = parseJsonPayload(raw);
      const payload = MarketingPayloadSchema.parse(parsed);
      return { raw, parsed: true, payload };
    } catch {
      return { raw, parsed: false };
    }
  }

  async run(params: {
    novelId: string;
    audience: ShuangwenAudience;
    genre: string;
    seedIdea?: string;
    titleHint?: string;
    synopsisHint?: string;
    desiredChapters?: number;
    generateSampleChapter?: boolean;
    temperatureOverride?: number;
  }): Promise<ShuangwenPipelineRunResult> {
    const {
      novelId,
      audience,
      genre,
      seedIdea,
      titleHint,
      synopsisHint,
      desiredChapters = 30,
      generateSampleChapter = false,
      temperatureOverride,
    } = params;

    // 1. 生成蓝图
    this.emitStageProgress(novelId, 1, '正在生成爽文策划蓝图...');
    const blueprint = await this.generateBlueprint({
      audience,
      genre,
      seedIdea,
      titleHint,
      synopsisHint,
      temperatureOverride,
    });

    // 2. 生成大纲
    this.emitStageProgress(novelId, 1, '正在生成章节大纲...');
    const { outline } = await this.generateOutline({
      blueprint,
      desiredChapters,
      temperatureOverride,
    });

    // 3. 生成营销
    this.emitStageProgress(novelId, 1, '正在生成营销素材...');
    const marketing = await this.generateMarketing({
      blueprint,
      outline,
      temperatureOverride,
    });

    const result: ShuangwenPipelineRunResult = {
      blueprint,
      outline,
      marketing,
    };

    // 4. （可选）生成样章
    if (generateSampleChapter) {
      this.emitStageProgress(novelId, 1, '正在生成样章...');
      const sample = await this.generateSampleChapter({
        novelId,
        blueprint,
        outline,
        chapterNumber: 1,
        temperatureOverride,
      });
      result.sampleChapter = sample;
    }

    this.emit({
      type: 'pipeline:complete',
      agentRole: 'shuangwen-planner',
      novelId,
      chapterNumber: 1,
      data: '爽文管线完成',
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  async generateSampleChapter(params: {
    novelId: string;
    blueprint: ShuangwenBlueprint;
    outline: ShuangwenPipelineRunResult['outline'];
    chapterNumber: number;
    temperatureOverride?: number;
  }): Promise<ShuangwenSampleChapter> {
    const { blueprint, outline, chapterNumber, novelId } = params;
    const chapterInfo = outline.chapters[chapterNumber - 1];
    if (!chapterInfo) {
      throw new Error(`Chapter ${chapterNumber} not found in outline`);
    }

    const { label } = getNarrativePhase(chapterNumber, outline.chapters.length);

    const writerAgent = this.deps.agents.get('writer');
    const editorAgent = this.deps.agents.get('editor');

    if (!writerAgent || !editorAgent) {
      throw new Error('writer/editor agents not found');
    }

    // === 第一步：Writer 生成初稿 ===
    const writerSystem = [
      '你是中文网文写手。',
      '任务：根据章节大纲，撰写正文初稿。',
      '要求：',
      '- 遵循策划蓝图的"风格指南"',
      '- 实现大纲中的"摘要"和"关键事件"',
      '- 控制字数在 2000~4000 字',
      '- 章末留钩子，但只能写成剧情里的未完成动作、选择或新局面',
      '- 正文开头禁止出现“# 第X章”“第X章 标题”或任何章节标题',
      '- 正文末尾禁止出现“在末尾留下钩子”“钩子：”“下一章看点”等创作说明',
      getAudienceRules(blueprint.audience),
      '',
      '【当前叙事阶段】',
      `${label}（全书进度：${Math.round((chapterNumber / outline.chapters.length) * 100)}%）`,
    ].join('\n');

    const writerUser = [
      '【策划蓝图】',
      JSON.stringify(blueprint, null, 2),
      '',
      '【本章大纲】',
      JSON.stringify(chapterInfo, null, 2),
      '',
      '【前文摘要】（如无前文则省略）',
      chapterNumber > 1 && outline.chapters[chapterNumber - 2]
        ? outline.chapters[chapterNumber - 2]!.summary
        : '（第一章）',
      '',
      '请直接输出小说正文，不要任何元数据、标题、章节名、markdown 或说明。结尾必须停在剧情钩子本身，不要用说明文字解释钩子。',
    ].filter(Boolean).join('\n');

    const draftOutput = await this.executeAgent(writerAgent, {
      novelId,
      chapterNumber,
      genre: blueprint.genre ?? '',
      novelTitle: blueprint.titleCandidates?.[0] ?? '',
      novelSynopsis: blueprint.synopsis ?? blueprint.logline ?? '',
      outlineContext: JSON.stringify(chapterInfo, null, 2),
      styleGuide: blueprint.styleGuide,
      userDirection: writerUser,
      shuangwenRules: writerSystem,
      previousChapterSummary: chapterNumber > 1 && outline.chapters[chapterNumber - 2]
        ? outline.chapters[chapterNumber - 2]!.summary
        : undefined,
    });
    const draftText = draftOutput.content;

    // === 第二步：Editor 润色 ===
    const editorSystem = [
      '你是中文网文编辑。',
      '任务：润色初稿，提升可读性和爽感。',
      '要求：',
      '- 修正错别字、语病',
      '- 优化节奏，强化情绪/爽点',
      '- 章末必须有剧情内钩子：未完成动作、选择题、新危机或新局面',
      '- 删除正文开头的“# 第X章”“第X章 标题”等章节标题，删除末尾“在末尾留下钩子”“钩子：”“下一章看点”等创作说明',
      '- 不改变情节和对话',
      getAudienceRules(blueprint.audience),
      '',
      '【输出格式】',
      '直接输出润色后的小说正文，末尾用"---EDITOR_NOTES---"分隔，然后是修改说明。正文部分不要包含章节标题、markdown 标题或创作说明。',
    ].join('\n');

    const editorUser = [
      '【策划蓝图】',
      JSON.stringify(blueprint, null, 2),
      '',
      '【本章大纲】',
      JSON.stringify(chapterInfo, null, 2),
      '',
      '【初稿】',
      draftText,
      '',
      '请输出润色后的正文。',
    ].join('\n');

    const polishedOutput = await this.executeAgent(editorAgent, {
      novelId,
      chapterNumber,
      genre: blueprint.genre ?? '',
      novelTitle: blueprint.titleCandidates?.[0] ?? '',
      novelSynopsis: blueprint.synopsis ?? blueprint.logline ?? '',
      outlineContext: JSON.stringify(chapterInfo, null, 2),
      inputText: draftText,
      userDirection: editorUser,
      shuangwenRules: editorSystem,
    });

    const { polishedText, editorNotes } = parseEditorOutput(polishedOutput.content);

    return {
      chapterNumber,
      title: chapterInfo.title,
      draftText,
      polishedText,
      editorNotes,
    };
  }

  async runFromBlueprint(params: {
    novelId?: string;
    audience: ShuangwenAudience;
    genre: string;
    blueprint: ShuangwenBlueprint;
    outlineChapters?: number;
    targetChapters?: number;
    includeMarketing?: boolean;
    sampleChapter?: boolean;
    maxWordCount?: number;
    temperatureOverride?: number;
  }): Promise<ShuangwenPipelineRunResult> {
    const novelId = params.novelId ?? randomUUID();
    const outlineChapters = Math.max(10, Math.min(60, params.outlineChapters ?? 20));
    const targetChapters = Math.max(outlineChapters, Math.min(2000, params.targetChapters ?? 100));
    const maxWordCount = Math.max(800, Math.min(6000, params.maxWordCount ?? DEFAULT_CHAPTER_WORD_TARGET));
    const wantSample = params.sampleChapter ?? true;
    const includeMarketing = params.includeMarketing ?? true;

    const outlineAgent = this.deps.agents.get('outline-generator');
    if (!outlineAgent) {
      throw new Error('required agent missing: outline-generator');
    }

    const marketingAgent = includeMarketing ? this.deps.agents.get('marketing-writer') : undefined;
    if (includeMarketing && !marketingAgent) {
      throw new Error('required agent missing: marketing-writer');
    }

    const writerAgent = wantSample ? this.deps.agents.get('writer') : undefined;
    const editorAgent = wantSample ? this.deps.agents.get('editor') : undefined;
    if (wantSample && (!writerAgent || !editorAgent)) {
      throw new Error('required agents missing: writer/editor');
    }

    const baseContext: Pick<AgentContext, 'novelId' | 'genre' | 'novelTitle' | 'novelSynopsis' | 'temperatureOverride'> = {
      novelId,
      genre: params.genre,
      novelTitle: params.blueprint.titleCandidates[0] ?? '未命名爽文',
      novelSynopsis: params.blueprint.synopsis,
      temperatureOverride: params.temperatureOverride,
    };

    const outlineDirection = [
      `你要生成 ${outlineChapters} 章的"打样大纲"，用于开篇强留存。目标总章数为 ${targetChapters} 章（仅作节奏参考）。`,
      getAudienceRules(params.audience),
      '',
      '【输出约束】',
      '- 只输出 JSON。',
      '- 顶层字段：{ "chapters": [...], "plotThreads": [...], "foreshadowing": [...] }。',
      '- plotThreads 至少包含 1 条主线；foreshadowing 至少包含 2 条伏笔。',
      '- chapters 每一章至少给：chapterNumber、title、summary、tensionTarget、keyEvents、notes；beats 可省略或为空数组。',
      '- summary 必须包含：开局冲突（具体）/ 本章兑现的爽点或甜点 / 章末钩子（具体）。',
      '- 章1必须在 300 字内出现明确冲突与承诺；章3内必须出现第一次兑现。',
      '- 必须使用英文双引号（"），不要使用中文引号（""）。',
    ].join('\n');

    const outlineOutput = await this.executeAgent(outlineAgent, {
      ...baseContext,
      userDirection: outlineDirection,
    });

    let outline: ShuangwenPipelineRunResult['outline'];
    try {
      const payload = parseJsonPayload(outlineOutput.content);
      outline = coerceOutlineData(payload, outlineChapters);
    } catch {
      outline = coerceOutlineData({ chapters: [] }, outlineChapters);
    }

    if (outline.chapters.length === 0) {
      const retryDirection = [
        outlineDirection,
        '',
        '【修正】上一轮输出无法被 JSON.parse 解析。请重新输出一次：',
        '- 只能输出 JSON 对象本体（不要代码块、不要解释文字）。',
        '- 字段名与字符串都必须使用英文双引号（"）。',
        '- 不要出现尾逗号。',
      ].join('\n');

      try {
        const retryOutput = await this.executeAgent(outlineAgent, {
          ...baseContext,
          userDirection: retryDirection,
        });
        const payload = parseJsonPayload(retryOutput.content);
        outline = coerceOutlineData(payload, outlineChapters);
      } catch {
        outline = buildFallbackOutlineFromBlueprint({ blueprint: params.blueprint, desiredChapters: outlineChapters });
      }
    }

    const marketingDirection = [
      getAudienceRules(params.audience),
      '',
      '生成"爆款上架物料"，只输出 JSON：',
      '{',
      '  "titleCandidates": ["..."],',
      '  "sellingPoints": ["..."],',
      '  "oneLiner": "一句话卖点",',
      '  "shortIntro": "80-120字简介",',
      '  "longIntro": "300-600字简介",',
      '  "characterCards": [{"name":"...","tagline":"...","highlights":["..."]}],',
      '  "hookTeasers": ["前5章章末钩子预告（每条一句话）"]',
      '}',
    ].join('\n');

    const marketingResult: ShuangwenPipelineRunResult['marketing'] = { raw: '', parsed: false };
    if (includeMarketing) {
      const marketingAgentReady = marketingAgent;
      if (!marketingAgentReady) {
        throw new Error('required agent missing: marketing-writer');
      }

      const marketingOutput = await this.executeAgent(marketingAgentReady, {
        ...baseContext,
        userDirection: marketingDirection,
        characterContext: [
          params.blueprint.protagonist?.name ? `主角：${params.blueprint.protagonist.name} / ${params.blueprint.protagonist.archetype ?? ''}` : '',
          params.blueprint.antagonist?.name ? `反派：${params.blueprint.antagonist.name} / ${params.blueprint.antagonist.archetype ?? ''}` : '',
        ].filter(Boolean).join('\n'),
      });

      marketingResult.raw = marketingOutput.content;
      try {
        const payload = parseJsonPayload(marketingOutput.content);
        const parsed = MarketingPayloadSchema.safeParse(payload);
        if (parsed.success) {
          marketingResult.parsed = true;
          marketingResult.payload = parsed.data;
        }
      } catch {
        // keep raw
      }
    }

    let sampleChapter: ShuangwenSampleChapter | undefined;
    if (wantSample) {
      const writerAgentReady = writerAgent;
      const editorAgentReady = editorAgent;
      if (!writerAgentReady || !editorAgentReady) {
        throw new Error('required agents missing: writer/editor');
      }

      // 兜底：如果大纲仍为空，用 blueprint 信息构建最小大纲
      if (outline.chapters.length === 0) {
        outline = buildFallbackOutlineFromBlueprint({ blueprint: params.blueprint, desiredChapters: outlineChapters });
      }
      const first = outline.chapters[0];
      const outlineContext = [
        `# 第 1 章：${first?.title || '开局'}`,
        `- 章节摘要：${first?.summary || params.blueprint.hook.openingScene}`,
        `- 章末钩子规则：${params.blueprint.hook.chapterEndHookRule}`,
      ].join('\n');

      const draftOutput = await this.executeAgent(writerAgentReady, {
        ...baseContext,
        chapterNumber: 1,
        outlineContext,
        userDirection: [
          '写第 1 章：开篇强钩子 + 低理解成本 + 强情绪。',
          '只输出小说正文，不要输出章节标题、markdown 标题或创作说明。',
          '结尾停在剧情里的未完成动作、选择或新局面，不要写“在末尾留下钩子”等说明文字。',
          `必须落实：${params.blueprint.hook.openingScene}`,
          `引爆事件：${params.blueprint.hook.incitingIncident}`,
          `三章内首次兑现（本章先埋伏笔）：${params.blueprint.hook.firstPayoff}`,
          getAudienceRules(params.audience),
        ].join('\n'),
        styleGuide: params.blueprint.styleGuide,
        maxWordCount,
      });
      const draftText = draftOutput.content;

      const editedOutput = await this.executeAgent(editorAgentReady, {
        ...baseContext,
        chapterNumber: 1,
        outlineContext,
        styleGuide: params.blueprint.styleGuide,
        inputText: draftText,
        maxWordCount,
      });

      const parsed = parseEditorOutput(editedOutput.content);
      sampleChapter = {
        chapterNumber: 1,
        title: first?.title || '',
        draftText,
        polishedText: parsed.polishedText,
        editorNotes: parsed.editorNotes,
      };
    }

    return {
      blueprint: params.blueprint,
      outline,
      marketing: marketingResult,
      sampleChapter,
    };
  }

  async generateChapter(params: {
    novelId: string;
    chapterNumber: number;
    userDirection?: string;
    maxWordCount?: number;
    hookGateMode?: ShuangwenGateMode;
    cycleGateMode?: ShuangwenGateMode;
    forbiddenGateMode?: ShuangwenGateMode;
    scoreThreshold?: number;
    maxRevisionRounds?: number;
    temperatureOverride?: number;
  }): Promise<ShuangwenChapterResult> {
    const nm = this.deps.novelManager;
    if (!nm) throw new Error('generateChapter 需要 novelManager');

    const maxWordCount = Math.max(800, Math.min(6000, params.maxWordCount ?? DEFAULT_CHAPTER_WORD_TARGET));
    const hookGateMode = params.hookGateMode ?? 'warn';
    const cycleGateMode = params.cycleGateMode ?? 'warn';
    const forbiddenGateMode = params.forbiddenGateMode ?? 'warn';
    const scoreThreshold = params.scoreThreshold ?? 6.0;
    const maxRevisionRounds = params.maxRevisionRounds ?? 2;

    // 1. 加载数据
    const novel = await nm.getNovel(params.novelId);
    const blueprint = novel.shuangwenBlueprint as ShuangwenBlueprint | undefined;
    if (!blueprint) {
      throw new Error(`小说 ${params.novelId} 没有爽文蓝图（shuangwenBlueprint），请先通过 /api/shuangwen/create-async 创建或对现有小说执行 /api/shuangwen/apply`);
    }

    const outline = await nm.getOutline(params.novelId);
    const characters = await nm.getCharacters(params.novelId);

    // 2. 构建上下文
    const previousChapterContext = await this.buildPreviousChapterContext(params.novelId, params.chapterNumber);
    const characterContext = this.buildCharacterContextFromProfiles(characters);
    const shuangwenRules = this.buildShuangwenRulesPrompt(blueprint, params.chapterNumber);

    const baseContext: AgentContext = {
      novelId: params.novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber: params.chapterNumber,
      temperatureOverride: params.temperatureOverride,
      shuangwenRules,
    };

    // 伏笔编排：有逾期伏笔时调用编排大师选择本章应回收的伏笔
    const unresolvedForeshadowing = outline.foreshadowing?.filter(item => !item.isResolved) ?? [];
    if (unresolvedForeshadowing.length > 0) {
      const { analyzeForeshadowing, buildForeshadowingContextHints } = await import('./foreshadowing-tracker.js');
      const foreshadowingAnalysis = analyzeForeshadowing({
        foreshadowing: outline.foreshadowing,
        currentChapter: params.chapterNumber,
      });

      if (foreshadowingAnalysis.overdue.length > 0) {
        const scheduler = this.deps.agents.get('foreshadowing-scheduler');
        if (scheduler) {
          try {
            let prevChapterSnippet = '';
            if (params.chapterNumber > 1) {
              const prevChapter = await nm.getChapter(params.novelId, params.chapterNumber - 1);
              if (prevChapter?.content) {
                prevChapterSnippet = prevChapter.content.slice(0, 8000);
              }
            }

            const chapterOutlineSummary = outline.chapters.find(ch => ch.chapterNumber === params.chapterNumber)?.summary || params.userDirection || '';
            const schedulerInput = [
              '## 上一章正文片段',
              prevChapterSnippet || '（第一章，无前文）',
              '',
              '## 本章大纲',
              chapterOutlineSummary || '（无大纲）',
              '',
              '## 未回收伏笔池（JSON）',
              JSON.stringify(unresolvedForeshadowing.map(f => ({
                id: f.id, hint: f.hint, plantedInChapter: f.plantedInChapter,
                priority: f.priority, resolution: f.resolution, relatedPlotThreads: f.relatedPlotThreads,
              })), null, 2),
              '',
              `## 当前进度：第 ${params.chapterNumber} 章，共 ${foreshadowingAnalysis.overdue.length} 条逾期伏笔`,
            ].join('\n');

            const schedulerOutput = await this.executeAgent(scheduler, {
              ...baseContext,
              inputText: schedulerInput,
            });
            const schedulerRaw = schedulerOutput.content;

            const separatorIdx = schedulerRaw.indexOf('---SCHEDULE_RESULT---');
            if (separatorIdx >= 0) {
              const jsonStr = schedulerRaw.slice(separatorIdx + '---SCHEDULE_RESULT---'.length).trim();
              try {
                const parsed = JSON.parse(jsonStr);
                const scheduled = Array.isArray(parsed.scheduled) ? parsed.scheduled : [];
                if (scheduled.length > 0) {
                  const hints = scheduled.map((s: { id: string; hint: string; integration: string }) => {
                    const original = unresolvedForeshadowing.find(f => f.id === s.id);
                    const elapsed = original ? params.chapterNumber - original.plantedInChapter : 0;
                    return `- （已过 ${elapsed} 章）：${s.hint}\n  融入建议：${s.integration}`;
                  }).join('\n');
                  baseContext.foreshadowingHints = '以下伏笔由编排大师选定，适合在本章自然回收：\n' + hints;
                }
              } catch { /* JSON 解析失败 */ }
            }
          } catch { /* 编排大师失败，降级 */ }
        }

        // 降级：编排大师未产出结果时使用机械选择
        if (!baseContext.foreshadowingHints) {
          const BUDGET = 3;
          const selected = foreshadowingAnalysis.overdue.slice(0, BUDGET);
          baseContext.foreshadowingHints = buildForeshadowingContextHints(selected);
        }
      }
    }

    const agentOutputs: AgentOutput[] = [];

    // 3. Outline Agent — 生成本章细纲
    const chapterOutline = outline.chapters.find(ch => ch.chapterNumber === params.chapterNumber);
    let outlineContext: string;

    if (chapterOutline && chapterOutline.summary) {
      outlineContext = [
        `# 第 ${params.chapterNumber} 章：${chapterOutline.title || ''}`,
        `- 摘要：${chapterOutline.summary}`,
        chapterOutline.keyEvents?.length ? `- 关键事件：${chapterOutline.keyEvents.join('；')}` : '',
        `- 章末钩子规则：${blueprint.hook.chapterEndHookRule}`,
      ].filter(Boolean).join('\n');
    } else {
      // 没有预生成大纲，用 outline agent 现场生成
      const outlineAgent = this.deps.agents.get('outline');
      if (!outlineAgent) throw new Error('required agent missing: outline');

      const outlineOutput = await this.executeAgent(outlineAgent, {
        ...baseContext,
        userDirection: [
          params.userDirection ?? '',
          '',
          `循环公式：${blueprint.engine.cycleFormula}`,
          `章末钩子规则：${blueprint.hook.chapterEndHookRule}`,
          getAudienceRules(blueprint.audience),
        ].join('\n'),
        previousChapterSummary: previousChapterContext,
        characterContext,
        maxWordCount,
      });
      agentOutputs.push(outlineOutput);
      outlineContext = outlineOutput.content;
    }

    // 4. World-Builder + Character Agent（并行）
    const contextWithOutline: AgentContext = {
      ...baseContext,
      outlineContext,
      userDirection: params.userDirection || undefined,
      styleGuide: blueprint.styleGuide,
      previousChapterSummary: previousChapterContext,
      characterContext,
      maxWordCount,
    };

    const worldBuilderAgent = this.deps.agents.get('world-builder');
    const characterAgent = this.deps.agents.get('character');

    let worldContext: string | undefined;
    let dynamicCharacterContext: string = characterContext;

    if (worldBuilderAgent || characterAgent) {
      const parallel: Promise<AgentOutput | null>[] = [];
      if (worldBuilderAgent) {
        parallel.push(this.executeAgent(worldBuilderAgent, { ...contextWithOutline }));
      } else {
        parallel.push(Promise.resolve(null));
      }
      if (characterAgent) {
        parallel.push(this.executeAgent(characterAgent, { ...contextWithOutline }));
      } else {
        parallel.push(Promise.resolve(null));
      }

      const [worldOutput, charOutput] = await Promise.all(parallel);

      if (worldOutput) {
        worldContext = worldOutput.content;
        agentOutputs.push(worldOutput);
      }
      if (charOutput) {
        dynamicCharacterContext = charOutput.content;
        agentOutputs.push(charOutput);
      }
    }

    // 5. Writer Agent
    const writerAgent = this.deps.agents.get('writer');
    if (!writerAgent) throw new Error('required agent missing: writer');

    const draftOutput = await this.executeAgent(writerAgent, {
      ...contextWithOutline,
      worldContext,
      characterContext: dynamicCharacterContext,
    });
    agentOutputs.push(draftOutput);
    const draftText = draftOutput.content;

    // 6. Editor Agent
    const editorAgent = this.deps.agents.get('editor');
    if (!editorAgent) throw new Error('required agent missing: editor');

    let editorOutput = await this.executeAgent(editorAgent, {
      ...contextWithOutline,
      worldContext,
      characterContext: dynamicCharacterContext,
      inputText: draftText,
    });
    agentOutputs.push(editorOutput);
    let editedRaw = editorOutput.content;

    let { polishedText, statusUpdate } = parseEditorOutput(editedRaw);

    // 7. 爽文门禁
    this.emitStageProgress(params.novelId, params.chapterNumber, '⚡ 爽文门禁检查中…');
    const hookReport = evaluateHookGate({
      chapterContent: polishedText,
      chapterNumber: params.chapterNumber,
      blueprint,
      gateMode: hookGateMode,
    });
    const cycleReport = evaluateCycleGate({
      chapterContent: polishedText,
      chapterNumber: params.chapterNumber,
      blueprint,
      gateMode: cycleGateMode,
    });
    const forbiddenReport = evaluateForbiddenGate({
      chapterContent: polishedText,
      forbidden: blueprint.forbidden,
      gateMode: forbiddenGateMode,
    });

    const shuangwenGateReport = {
      hookGate: hookReport,
      cycleGate: cycleReport,
      forbiddenGate: forbiddenReport,
    };

    // 门禁修复（strict 模式下失败则调 Editor 修复）
    const gateFailedStrict =
      (hookGateMode === 'strict' && !hookReport.passed) ||
      (cycleGateMode === 'strict' && !cycleReport.passed) ||
      (forbiddenGateMode === 'strict' && !forbiddenReport.passed);

    if (gateFailedStrict) {
      this.emitStageProgress(params.novelId, params.chapterNumber, '🔧 门禁未通过，Editor 修复中…');
      const fixHints: string[] = [];
      if (!hookReport.passed) fixHints.push(buildHookFixHints(hookReport, blueprint));
      if (!cycleReport.passed) fixHints.push(buildCycleFixHints(cycleReport, blueprint));
      if (!forbiddenReport.passed) fixHints.push(buildForbiddenFixHints(forbiddenReport));

      editorOutput = await this.executeAgent(editorAgent, {
        ...contextWithOutline,
        worldContext,
        characterContext: dynamicCharacterContext,
        inputText: polishedText,
        shuangwenGateFixHints: fixHints.join('\n\n'),
      });
      agentOutputs.push(editorOutput);
      editedRaw = editorOutput.content;
      const reparsed = parseEditorOutput(editedRaw);
      polishedText = reparsed.polishedText;
      if (reparsed.statusUpdate) statusUpdate = reparsed.statusUpdate;
    }

    // 8. Quality Gate
    this.emitStageProgress(params.novelId, params.chapterNumber, '📊 质量门禁检查中…');
    const qualityReport = evaluateQualityGate({
      chapterContent: polishedText,
      gateMode: 'warn',
    });

    // 9. Reader Agent
    const readerAgent = this.deps.agents.get('reader');
    let readerFeedback = '';
    let readerScore = 10;

    if (readerAgent) {
      const readerOutput = await this.executeAgent(readerAgent, {
        ...baseContext,
        inputText: polishedText,
        outlineContext,
        shuangwenRules,
      });
      agentOutputs.push(readerOutput);
      readerFeedback = readerOutput.content;
      readerScore = this.parseReaderScore(readerOutput.content);
    }

    // 10. 自动修订闭环
    const autoRevision = {
      triggered: false,
      rounds: 0,
      initialScore: readerScore,
      finalScore: readerScore,
    };

    if (readerScore < scoreThreshold && maxRevisionRounds > 0 && readerAgent) {
      autoRevision.triggered = true;

      for (let round = 0; round < maxRevisionRounds; round++) {
        this.emitStageProgress(params.novelId, params.chapterNumber,
          `🔄 自动修订第 ${round + 1}/${maxRevisionRounds} 轮（当前评分 ${readerScore}）`);
        this.emit({
          type: 'revision:start',
          agentRole: 'writer',
          novelId: params.novelId,
          chapterNumber: params.chapterNumber,
          data: `自动修订第 ${round + 1} 轮（当前评分 ${readerScore}）`,
          timestamp: new Date().toISOString(),
        });

        const revisionDirection = this.buildAutoRevisionDirection(polishedText, readerFeedback, blueprint);

        // Writer 修订
        const revisedWriterOutput = await this.executeAgent(writerAgent, {
          ...contextWithOutline,
          worldContext,
          characterContext: dynamicCharacterContext,
          userDirection: revisionDirection,
        });
        agentOutputs.push(revisedWriterOutput);
        const revisedDraft = revisedWriterOutput.content;

        // Editor 润色
        editorOutput = await this.executeAgent(editorAgent, {
          ...contextWithOutline,
          worldContext,
          characterContext: dynamicCharacterContext,
          inputText: revisedDraft,
        });
        agentOutputs.push(editorOutput);
        editedRaw = editorOutput.content;

        const reparsed = parseEditorOutput(editedRaw);
        polishedText = reparsed.polishedText;

        // Reader 重评
        const reReaderOutput = await this.executeAgent(readerAgent, {
          ...baseContext,
          inputText: polishedText,
          outlineContext,
          shuangwenRules,
        });
        agentOutputs.push(reReaderOutput);
        readerFeedback = reReaderOutput.content;
        readerScore = this.parseReaderScore(reReaderOutput.content);

        autoRevision.rounds = round + 1;
        autoRevision.finalScore = readerScore;

        this.emit({
          type: 'revision:complete',
          agentRole: 'writer',
          novelId: params.novelId,
          chapterNumber: params.chapterNumber,
          data: `修订第 ${round + 1} 轮完成（评分 ${readerScore}）`,
          timestamp: new Date().toISOString(),
        });

        if (readerScore >= scoreThreshold) break;
      }
    }

    return {
      chapterContent: polishedText,
      outline: outlineContext,
      draft: draftText,
      editedContent: polishedText,
      readerFeedback,
      agentOutputs,
      qualityReport,
      shuangwenGateReport,
      statusUpdate,
      autoRevision,
    };
  }

  // ==================== 私有辅助方法 ====================

  private buildShuangwenRulesPrompt(blueprint: ShuangwenBlueprint, chapterNumber: number): string {
    const lines: string[] = [];

    lines.push(getAudienceRules(blueprint.audience));
    lines.push('');
    lines.push(`【循环公式】${blueprint.engine.cycleFormula}`);
    lines.push(`【升级规则】${blueprint.engine.escalationRule}`);
    lines.push(`【章末钩子规则】${blueprint.hook.chapterEndHookRule}`);

    if (blueprint.engine.constraints.length > 0) {
      const filteredConstraints = blueprint.engine.constraints
        .map(c => stripDriftTerms(c))
        .filter(c => c.length > 0);
      if (filteredConstraints.length > 0) {
        lines.push(`【金手指限制】${filteredConstraints.join('；')}`);
      }
    }

    if (blueprint.forbidden.length > 0) {
      const filteredForbidden = blueprint.forbidden
        .map(f => stripDriftTerms(f))
        .filter(f => f.length > 0);
      if (filteredForbidden.length > 0) {
        lines.push(`【禁区】${filteredForbidden.join('；')}`);
      }
    }

    if (chapterNumber <= 3) {
      lines.push(`【前 3 章特殊要求】首次兑现：${blueprint.hook.firstPayoff}`);
    }

    return lines.join('\n');
  }

  private async buildPreviousChapterContext(novelId: string, chapterNumber: number): Promise<string> {
    const nm = this.deps.novelManager;
    if (!nm || chapterNumber <= 1) return '';

    const parts: string[] = [];

    // 上一章完整截断（长上下文模型优先保留足够衔接信息）
    const prevChapter = await nm.getChapter(novelId, chapterNumber - 1);
    if (prevChapter?.content) {
      const truncated = prevChapter.content.length > 8000
        ? prevChapter.content.slice(-8000) + '…（前文省略）'
        : prevChapter.content;
      parts.push(`### 第 ${chapterNumber - 1} 章（上一章）`);
      parts.push(truncated);

      // 提取上一章结尾作为接续锚点
      const ending = prevChapter.content.slice(-1200).trim();
      parts.push('');
      parts.push('### ⚠️ 接续指令（硬约束）');
      parts.push('本章开头必须直接承接上一章结尾的场景、动作或悬念，不得跳过、省略或另起新场景。');
      parts.push('上一章结尾如下，本章第一段必须从这里接着写：');
      parts.push('---');
      parts.push(ending);
      parts.push('---');
    }

    // 更早章节摘要（最多 3 章）
    const lookback = Math.min(3, chapterNumber - 2);
    for (let i = lookback; i >= 1; i--) {
      const ch = await nm.getChapter(novelId, chapterNumber - 1 - i);
      if (ch?.summary) {
        parts.push(`### 第 ${ch.chapterNumber} 章摘要`);
        parts.push(ch.summary.slice(0, 1200));
      }
    }

    return parts.join('\n\n');
  }

  private buildCharacterContextFromProfiles(characters: Array<{ name: string; role?: string; personality?: string; background?: string; currentState?: string }>): string {
    if (!characters.length) return '';

    const alive: typeof characters = [];
    const forbidden: Array<{ name: string; reason: string }> = [];

    for (const c of characters) {
      const status = detectCharacterStatus(c.currentState);
      if (status === 'dead') {
        forbidden.push({ name: c.name, reason: `已死亡（${getLatestStateEntry(c.currentState || '').slice(0, 60)}）` });
      } else if (status === 'exited') {
        forbidden.push({ name: c.name, reason: `已退场（${getLatestStateEntry(c.currentState || '').slice(0, 60)}）` });
      } else {
        alive.push(c);
      }
    }

    const parts: string[] = [];

    // 存活角色简介（最多 12 个）
    if (alive.length > 0) {
      parts.push(alive.slice(0, 12).map(c => {
        const lines = [`- ${c.name}`];
        if (c.role) lines.push(`  角色：${c.role}`);
        if (c.personality) lines.push(`  性格：${c.personality}`);
        if (c.background) lines.push(`  背景：${c.background.slice(0, 200)}`);
        const latest = getLatestStateEntry(c.currentState || '');
        if (latest) lines.push(`  当前状态：${latest.slice(0, 120)}`);
        return lines.join('\n');
      }).join('\n'));
    }

    // 禁用角色列表（硬约束）
    if (forbidden.length > 0) {
      parts.push('');
      parts.push('### ⚠️ 禁用角色（已死亡或退场，绝对不得出场、说话或被提及为在场）');
      for (const f of forbidden) {
        parts.push(`- ${f.name}：${f.reason}`);
      }
    }

    return parts.join('\n');
  }

  private parseReaderScore(content: string): number {
    try {
      const payload = parseJsonPayload(content);
      if (payload && typeof payload === 'object' && 'overallScore' in payload) {
        const score = Number((payload as Record<string, unknown>).overallScore);
        if (!Number.isNaN(score)) return score;
      }
    } catch {
      // try regex fallback
    }
    const match = content.match(/overallScore["\s:]+(\d+(?:\.\d+)?)/);
    if (match) return Number(match[1]);
    return 5; // 无法解析时给中间分
  }

  private buildAutoRevisionDirection(
    currentText: string,
    readerFeedback: string,
    blueprint: ShuangwenBlueprint,
  ): string {
    const lines: string[] = [];
    lines.push('【修订任务】根据读者反馈修订本章，保持主剧情不变。');
    lines.push('');
    lines.push('【读者反馈】');
    lines.push(readerFeedback.slice(0, 1500));
    lines.push('');
    lines.push('【爽文核心要求】');
    lines.push(`- 循环公式：${blueprint.engine.cycleFormula}`);
    lines.push(`- 章末钩子：${blueprint.hook.chapterEndHookRule}`);
    lines.push(`- 文风：${blueprint.styleGuide}`);
    lines.push('');
    lines.push('【当前正文（需修订）】');
    lines.push(currentText.slice(0, 3000));
    return lines.join('\n');
  }
}
