import type { ModelClient, StreamCallback } from '../models/types.js';
import type { NovelAgent, AgentRole, AgentContext, AgentOutput } from '../agents/types.js';
import { getConfig } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import type {
  ChapterGenerationResult,
  EventEmitter,
  PipelineMemory,
  PipelineNovelManager,
} from './types.js';
import type { ShortStoryBlueprint, ShortStoryChapterMeta } from '../novel/short-story-types.js';
import type { ChapterOutline, Chapter } from '../novel/types.js';
import { CollaborationLog } from './collaboration-log.js';
import { PerformanceTracker } from './performance-tracker.js';
import fs from 'fs/promises';
import path from 'path';

const logger = createLogger('ShortStoryPipeline');

/**
 * 短篇小说生成管线
 *
 * 特点：
 * 1. 精确字数控制（目标字数 ± 10%）
 * 2. 快节奏爽点密集
 * 3. 简化流程（跳过 Reader，使用确定性评分）
 * 4. 付费点标记
 */
export class ShortStoryPipeline {
  private novelId: string;
  private novelManager: PipelineNovelManager;
  private memory: PipelineMemory;
  private modelClient: ModelClient;
  private eventEmitter: EventEmitter;
  private blueprint: ShortStoryBlueprint;

  // Agent 实例
  private outlineAgent: NovelAgent;
  private writerAgent: NovelAgent;
  private editorAgent: NovelAgent;

  // 协作日志和性能追踪
  private collabLog: CollaborationLog;
  private perfTracker: PerformanceTracker;

  constructor(
    novelId: string,
    novelManager: PipelineNovelManager,
    memory: PipelineMemory,
    modelClient: ModelClient,
    eventEmitter: EventEmitter,
    blueprint: ShortStoryBlueprint,
    agents: {
      outline: NovelAgent;
      writer: NovelAgent;
      editor: NovelAgent;
    }
  ) {
    this.novelId = novelId;
    this.novelManager = novelManager;
    this.memory = memory;
    this.modelClient = modelClient;
    this.eventEmitter = eventEmitter;
    this.blueprint = blueprint;

    this.outlineAgent = agents.outline;
    this.writerAgent = agents.writer;
    this.editorAgent = agents.editor;

    this.collabLog = new CollaborationLog();
    this.perfTracker = new PerformanceTracker();
  }

  /**
   * 生成单章
   */
  async generateChapter(
    chapterNumber: number,
    direction?: string
  ): Promise<ChapterGenerationResult> {
    const startTime = Date.now();
    logger.info(`开始生成短篇第 ${chapterNumber} 章`);

    try {
      // 1. 计算本章目标字数
      const targetWordCount = this.calculateChapterWordCount(chapterNumber);
      logger.info(`第 ${chapterNumber} 章目标字数: ${targetWordCount}`);

      // 2. 生成大纲
      const outline = await this.generateOutline(chapterNumber, direction, targetWordCount);

      // 3. 生成初稿
      const draft = await this.generateDraft(chapterNumber, outline, targetWordCount);

      // 4. 编辑润色
      const edited = await this.editDraft(chapterNumber, draft, targetWordCount);

      // 5. 确定性评分（替代 Reader Agent）
      const score = this.calculateDeterministicScore(edited.content, targetWordCount);

      // 6. 生成短篇元数据
      const meta = this.generateChapterMeta(edited.content, targetWordCount);

      // 7. 保存章节
      await this.saveChapter(chapterNumber, edited.content, outline, score, meta);

      const duration = Date.now() - startTime;
      logger.info(`第 ${chapterNumber} 章生成完成，耗时 ${duration}ms，评分 ${score}/10`);

      return {
        chapterContent: edited.content,
        outline: JSON.stringify(outline),
        worldNotes: '',
        characterNotes: '',
        draft: draft.content,
        editedContent: edited.content,
        readerFeedback: `确定性评分: ${score}/10`,
        agentOutputs: [],
      };
    } catch (error) {
      logger.error(`第 ${chapterNumber} 章生成失败`, {
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 计算本章目标字数
   */
  private calculateChapterWordCount(chapterNumber: number): number {
    const { targetWordCount, targetChapters, chapterWordCount } = this.blueprint;

    // 如果手动指定了单章字数，使用指定值
    if (chapterWordCount) {
      return chapterWordCount;
    }

    // 自动计算：总字数 ÷ 章节数
    const avgWordCount = Math.floor(targetWordCount / targetChapters);

    // 允许 ±15% 浮动
    const minWordCount = Math.floor(avgWordCount * 0.85);
    const maxWordCount = Math.floor(avgWordCount * 1.15);

    logger.info(`第 ${chapterNumber} 章字数范围: ${minWordCount}-${maxWordCount} (目标 ${avgWordCount})`);

    return avgWordCount;
  }

  /**
   * 生成章节大纲
   */
  private async generateOutline(
    chapterNumber: number,
    direction: string | undefined,
    targetWordCount: number
  ): Promise<ChapterOutline> {
    logger.info(`生成第 ${chapterNumber} 章大纲...`);

    this.eventEmitter({
      type: 'agent:start',
      agentRole: 'outline',
      novelId: this.novelId,
      chapterNumber,
      data: '',
      timestamp: new Date().toISOString(),
    });

    // 构建上下文
    const context = await this.buildOutlineContext(chapterNumber, direction, targetWordCount);

    // 调用 Outline Agent
    const output = await this.outlineAgent.execute(context, this.modelClient, (chunk) => {
      this.eventEmitter({
        type: 'agent:chunk',
        agentRole: 'outline',
        novelId: this.novelId,
        chapterNumber,
        data: chunk,
        timestamp: new Date().toISOString(),
      });
    });

    this.eventEmitter({
      type: 'agent:complete',
      agentRole: 'outline',
      novelId: this.novelId,
      chapterNumber,
      data: output.content,
      timestamp: new Date().toISOString(),
    });

    // 解析大纲
    const outline = this.parseOutline(output.content, chapterNumber);

    return outline;
  }

  /**
   * 生成初稿
   */
  private async generateDraft(
    chapterNumber: number,
    outline: ChapterOutline,
    targetWordCount: number
  ): Promise<{ content: string }> {
    logger.info(`生成第 ${chapterNumber} 章初稿...`);

    this.eventEmitter({
      type: 'agent:start',
      agentRole: 'writer',
      novelId: this.novelId,
      chapterNumber,
      data: '',
      timestamp: new Date().toISOString(),
    });

    // 构建上下文
    const context = await this.buildWriterContext(chapterNumber, outline, targetWordCount);

    // 调用 Writer Agent
    const output = await this.writerAgent.execute(context, this.modelClient, (chunk) => {
      this.eventEmitter({
        type: 'agent:chunk',
        agentRole: 'writer',
        novelId: this.novelId,
        chapterNumber,
        data: chunk,
        timestamp: new Date().toISOString(),
      });
    });

    this.eventEmitter({
      type: 'agent:complete',
      agentRole: 'writer',
      novelId: this.novelId,
      chapterNumber,
      data: output.content,
      timestamp: new Date().toISOString(),
    });

    return { content: output.content };
  }

  /**
   * 编辑润色
   */
  private async editDraft(
    chapterNumber: number,
    draft: { content: string },
    targetWordCount: number
  ): Promise<{ content: string }> {
    logger.info(`润色第 ${chapterNumber} 章...`);

    this.eventEmitter({
      type: 'agent:start',
      agentRole: 'editor',
      novelId: this.novelId,
      chapterNumber,
      data: '',
      timestamp: new Date().toISOString(),
    });

    // 构建上下文
    const context = await this.buildEditorContext(chapterNumber, draft.content, targetWordCount);

    // 调用 Editor Agent
    const output = await this.editorAgent.execute(context, this.modelClient, (chunk) => {
      this.eventEmitter({
        type: 'agent:chunk',
        agentRole: 'editor',
        novelId: this.novelId,
        chapterNumber,
        data: chunk,
        timestamp: new Date().toISOString(),
      });
    });

    this.eventEmitter({
      type: 'agent:complete',
      agentRole: 'editor',
      novelId: this.novelId,
      chapterNumber,
      data: output.content,
      timestamp: new Date().toISOString(),
    });

    // 解析编辑输出
    const content = this.parseEditorOutput(output.content);

    return { content };
  }

  /**
   * 确定性评分（替代 Reader Agent）
   */
  private calculateDeterministicScore(content: string, targetWordCount: number): number {
    let score = 6.0; // 基础分

    // 1. 对话占比（目标60%+）
    const dialogueRatio = this.countDialogueRatio(content);
    if (dialogueRatio >= 0.6) {
      score += 1.5;
    } else if (dialogueRatio >= 0.5) {
      score += 1.0;
    } else if (dialogueRatio >= 0.4) {
      score += 0.5;
    }

    // 2. 爽点数量（目标2+）
    const payoffCount = this.countPayoffs(content);
    if (payoffCount >= 3) {
      score += 1.5;
    } else if (payoffCount >= 2) {
      score += 1.0;
    } else if (payoffCount >= 1) {
      score += 0.5;
    }

    // 3. 章末钩子强度
    const hookStrength = this.evaluateHook(content);
    score += hookStrength * 0.5; // 0-1分

    // 4. 字数达标情况
    const wordCount = content.length;
    const deviation = Math.abs(wordCount - targetWordCount) / targetWordCount;
    if (deviation <= 0.1) {
      score += 0.5; // 字数精准
    } else if (deviation <= 0.2) {
      score += 0.3;
    } else if (deviation > 0.3) {
      score -= 0.5; // 字数偏差过大扣分
    }

    return Math.min(10, Math.max(0, score));
  }

  /**
   * 计算对话占比
   */
  private countDialogueRatio(content: string): number {
    const lines = content.split('\n');
    let dialogueChars = 0;
    let totalChars = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      totalChars += trimmed.length;

      // 检测对话行（包含引号或说话人标记）
      if (trimmed.includes('"') || trimmed.includes('(#')) {
        dialogueChars += trimmed.length;
      }
    }

    return totalChars > 0 ? dialogueChars / totalChars : 0;
  }

  /**
   * 计算爽点数量
   */
  private countPayoffs(content: string): number {
    let count = 0;

    // 爽点关键词
    const payoffKeywords = [
      '震惊', '不敢相信', '倒吸一口凉气', '脸色煞白', '瞪大眼睛',
      '全场死寂', '众人', '所有人', '怎么可能',
      '身份', '实力', '碾压', '打脸', '后悔', '跪求',
    ];

    for (const keyword of payoffKeywords) {
      const matches = content.match(new RegExp(keyword, 'g'));
      if (matches) {
        count += matches.length * 0.3; // 每个关键词算0.3个爽点
      }
    }

    return Math.floor(count);
  }

  /**
   * 评估章末钩子强度
   */
  private evaluateHook(content: string): number {
    const lastPart = content.slice(-300); // 最后300字

    // 钩子关键词
    const hookKeywords = [
      '就在这时', '突然', '忽然', '没想到',
      '电话响了', '门开了', '出现了',
      '？', '！',
    ];

    let strength = 0;
    for (const keyword of hookKeywords) {
      if (lastPart.includes(keyword)) {
        strength += 0.2;
      }
    }

    return Math.min(1, strength);
  }

  /**
   * 生成短篇章节元数据
   */
  private generateChapterMeta(content: string, targetWordCount: number): ShortStoryChapterMeta {
    const wordCount = content.length;
    const deviation = Math.abs(wordCount - targetWordCount) / targetWordCount;

    return {
      isPaid: this.isPaidChapter(0), // 章节号会在保存时设置
      payoffCount: this.countPayoffs(content),
      dialogueRatio: this.countDialogueRatio(content),
      wordCountStatus: deviation <= 0.1 ? 'perfect' : deviation <= 0.2 ? 'under' : 'over',
      endHookStrength: this.evaluateHook(content) * 10,
    };
  }

  /**
   * 判断是否为付费章节
   */
  private isPaidChapter(chapterNumber: number): boolean {
    const { paywall } = this.blueprint;

    if (!paywall.enabled) {
      return false;
    }

    switch (paywall.type) {
      case 'chapter':
        return chapterNumber > (paywall.freeChapters || 0);
      case 'percentage':
        // 需要知道总章节数才能计算
        const freeChapters = Math.floor(
          this.blueprint.targetChapters * (paywall.freePercentage || 0) / 100
        );
        return chapterNumber > freeChapters;
      case 'wordCount':
        // 需要累计字数，这里简化处理
        return chapterNumber > 2; // 默认前2章免费
      default:
        return false;
    }
  }

  /**
   * 构建大纲上下文
   */
  private async buildOutlineContext(
    chapterNumber: number,
    direction: string | undefined,
    targetWordCount: number
  ): Promise<AgentContext> {
    const novel = await this.novelManager.getNovel(this.novelId);
    const { blueprint } = this;

    // 获取前文章节
    const chapters = await this.novelManager.listChapters(this.novelId);
    const prevChapter = chapters.find((c: { chapterNumber: number }) => c.chapterNumber === chapterNumber - 1);

    // 构建提示
    let prompt = `请为短篇小说《${novel.title}》设计第 ${chapterNumber} 章的大纲。\n\n`;

    // 短篇蓝图信息
    prompt += `## 短篇配置\n`;
    prompt += `- 总字数目标：${blueprint.targetWordCount}字\n`;
    prompt += `- 总章节数：${blueprint.targetChapters}章\n`;
    prompt += `- 本章目标字数：${targetWordCount}字（允许±15%浮动）\n`;
    prompt += `- 爽点密度：${blueprint.payoffDensity}\n`;
    prompt += `- 节奏模式：${blueprint.paceMode}\n\n`;

    // 核心设定
    prompt += `## 核心设定\n`;
    prompt += `- 主角：${blueprint.protagonist.name}\n`;
    prompt += `  * 起始状态：${blueprint.protagonist.startState}\n`;
    prompt += `  * 结局状态：${blueprint.protagonist.endState}\n`;
    prompt += `  * 金手指：${blueprint.protagonist.goldFinger}\n`;
    prompt += `- 核心循环：${blueprint.hook.coreLoop}\n`;
    prompt += `- 开局爽点：${blueprint.hook.openingPunch}\n\n`;

    // 反派信息
    if (blueprint.antagonists.length > 0) {
      prompt += `## 反派列表\n`;
      for (const antagonist of blueprint.antagonists) {
        prompt += `- ${antagonist.name}（${antagonist.role}）：第${antagonist.defeatChapter}章被打脸\n`;
      }
      prompt += `\n`;
    }

    // 前文摘要
    if (prevChapter) {
      prompt += `## 前文摘要\n`;
      prompt += `第 ${prevChapter.chapterNumber} 章：${prevChapter.title}\n`;
      prompt += `字数：${prevChapter.wordCount}字\n`;
      prompt += `\n`;
    }

    // 用户方向
    if (direction) {
      prompt += `## 用户指定方向\n${direction}\n\n`;
    }

    // 付费点提示
    const isPaid = this.isPaidChapter(chapterNumber);
    if (chapterNumber === (blueprint.paywall.freeChapters || 0) + 1) {
      prompt += `## 重要提示\n`;
      prompt += `本章是付费起点！必须设计强力钩子吸引读者付费继续阅读。\n\n`;
    } else if (isPaid) {
      prompt += `## 付费章节\n`;
      prompt += `本章为付费内容，确保爽点密集，物超所值。\n\n`;
    }

    prompt += `请严格按照提示词中的格式输出大纲，包含字数分配和爽点标记。`;

    return {
      novelId: this.novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber,
      inputText: prompt,
    } as AgentContext;
  }

  /**
   * 构建写手上下文
   */
  private async buildWriterContext(
    chapterNumber: number,
    outline: ChapterOutline,
    targetWordCount: number
  ): Promise<AgentContext> {
    const novel = await this.novelManager.getNovel(this.novelId);
    const { blueprint } = this;

    let prompt = `请根据以下大纲，为短篇小说《${novel.title}》撰写第 ${chapterNumber} 章。\n\n`;

    // 字数约束（最高优先级）
    prompt += `## 字数约束（最高优先级）\n`;
    prompt += `- 目标字数：${targetWordCount}字\n`;
    prompt += `- 允许范围：${Math.floor(targetWordCount * 0.9)}-${Math.floor(targetWordCount * 1.1)}字\n`;
    prompt += `- **超过${Math.floor(targetWordCount * 1.1)}字视为失败**\n`;
    prompt += `- 接近目标字数时立即收束，用悬念结尾\n\n`;

    // 风格指南
    prompt += `## 风格指南\n${blueprint.styleGuide}\n\n`;

    // 大纲
    prompt += `## 章节大纲\n`;
    prompt += `标题：${outline.title}\n`;
    prompt += `摘要：${outline.summary}\n\n`;

    if (outline.beats && outline.beats.length > 0) {
      prompt += `场景列表：\n`;
      for (let i = 0; i < outline.beats.length; i++) {
        const beat = outline.beats[i];
        prompt += `${i + 1}. ${beat.summary}\n`;
        if (beat.notes) {
          prompt += `   备注：${beat.notes}\n`;
        }
      }
      prompt += `\n`;
    }

    // 禁忌
    if (blueprint.forbidden.length > 0) {
      prompt += `## 禁止元素\n`;
      for (const item of blueprint.forbidden) {
        prompt += `- ${item}\n`;
      }
      prompt += `\n`;
    }

    prompt += `请直接输出小说正文，不要加任何标题或说明。`;

    return {
      novelId: this.novelId,
      genre: (await this.novelManager.getNovel(this.novelId)).genre,
      novelTitle: (await this.novelManager.getNovel(this.novelId)).title,
      novelSynopsis: (await this.novelManager.getNovel(this.novelId)).synopsis,
      chapterNumber,
      inputText: prompt,
    } as AgentContext;
  }

  /**
   * 构建编辑上下文
   */
  private async buildEditorContext(
    chapterNumber: number,
    draft: string,
    targetWordCount: number
  ): Promise<AgentContext> {
    let prompt = `请润色以下短篇小说初稿。\n\n`;

    // 字数约束
    prompt += `## 字数约束\n`;
    prompt += `- 目标字数：${targetWordCount}字\n`;
    prompt += `- 当前字数：${draft.length}字\n`;
    const deviation = ((draft.length - targetWordCount) / targetWordCount * 100).toFixed(1);
    prompt += `- 偏差：${deviation}%\n`;

    if (draft.length > targetWordCount * 1.1) {
      prompt += `- **当前超标，必须压缩到目标字数**\n`;
    }
    prompt += `\n`;

    // 润色重点
    prompt += `## 润色重点\n`;
    prompt += `1. 保留所有爽点和围观者反应\n`;
    prompt += `2. 控制字数在目标范围内\n`;
    prompt += `3. 强化开头钩子和章末钩子\n`;
    prompt += `4. 提升对话占比（目标60%+）\n`;
    prompt += `5. 删除冗余描写和铺垫\n\n`;

    prompt += `## 初稿\n${draft}\n\n`;

    prompt += `请按照提示词中的格式输出润色后的正文和编辑笔记。`;

    const novel = await this.novelManager.getNovel(this.novelId);
    return {
      novelId: this.novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber,
      inputText: prompt,
    } as AgentContext;
  }

  /**
   * 解析大纲输出
   */
  private parseOutline(content: string, chapterNumber: number): ChapterOutline {
    // 简化解析，提取标题和摘要
    const lines = content.split('\n');
    let title = `第${chapterNumber}章`;
    let summary = '';

    for (const line of lines) {
      if (line.includes('章节标题') || line.includes('标题：')) {
        title = line.split(/[:：]/).pop()?.trim() || title;
      }
      if (line.includes('摘要：') || line.includes('内容：')) {
        summary = line.split(/[:：]/).pop()?.trim() || summary;
      }
    }

    return {
      chapterNumber,
      title,
      summary,
      beats: [],
      tensionTarget: 7,
      plotThreadsAdvanced: [],
      keyEvents: [],
      notes: '',
    };
  }

  /**
   * 解析编辑输出
   */
  private parseEditorOutput(content: string): string {
    // 提取正文部分（分隔线之前）
    const separator = '---EDITOR_NOTES---';
    const parts = content.split(separator);
    return parts[0].trim();
  }

  /**
   * 保存章节
   */
  private async saveChapter(
    chapterNumber: number,
    content: string,
    outline: ChapterOutline,
    score: number,
    meta: ShortStoryChapterMeta
  ): Promise<void> {
    // 更新付费状态
    meta.isPaid = this.isPaidChapter(chapterNumber);

    // 使用 novelManager 的标准保存方法
    const chapter: Chapter = {
      novelId: this.novelId,
      chapterNumber,
      title: outline.title,
      summary: outline.summary,
      content,
      wordCount: content.length,
      status: 'edited',
      outline,
      readerScore: score,
      agentComments: [],
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存章节文件
    const novelDir = path.join(getConfig().dataDir, 'novels', this.novelId);
    const chaptersDir = path.join(novelDir, 'chapters');
    await fs.mkdir(chaptersDir, { recursive: true });

    const chapterFile = path.join(chaptersDir, `chapter-${chapterNumber}.json`);
    await fs.writeFile(chapterFile, JSON.stringify(chapter, null, 2), 'utf-8');

    logger.info(`第 ${chapterNumber} 章已保存，字数 ${content.length}，评分 ${score}/10`);
  }
}
