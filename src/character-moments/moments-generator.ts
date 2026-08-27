/**
 * 角色朋友圈生成器 — 调用专用 agent 生成动态与评论。
 * 纯生成编排层，不含 HTTP / Express 依赖（参考 letters.ts:125-167 的生成链路抽离）。
 */
import type { NovelAgent, AgentContext } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { MomentsService } from './moments-service.js';
import type { CharacterMoment, MomentType } from './types.js';
import { buildFullSoulPrompt } from '../novel/character-soul-context.js';

/** 角色定位中文标签 */
function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    protagonist: '主角',
    deuteragonist: '副主角',
    antagonist: '反派',
    rival: '宿敌',
    love_interest: '感情线',
    mentor: '导师',
    ally: '盟友',
    faction_leader: '势力核心',
    supporting: '配角',
    family: '亲友',
    comic_relief: '气氛担当',
    minor: '路人',
  };
  return map[role] || '角色';
}

/** 构建角色档案上下文（含灵魂深度字段） */
function buildCharacterContext(character: any, soulContext?: string): string {
  const base = [
    `角色名: ${character.name}`,
    `角色定位: ${getRoleLabel(character.role)}`,
    `性格: ${character.personality || '未设定'}`,
    `性格标签: ${(character.personalityTraits || []).join('、') || '无'}`,
    `语言风格: ${character.speechStyle || '未设定'}`,
    `口头禅/台词: ${(character.speechExamples || []).join('；') || '无'}`,
    `背景: ${character.backstory || '未设定'}`,
    `动机: ${character.motivation || '未设定'}`,
    `当前状态: ${character.currentState || '未设定'}`,
  ].join('\n');
  return soulContext ? `${base}\n${soulContext}` : base;
}

/** 清理 AI 输出可能的 markdown 包裹 */
function cleanOutput(raw: string): string {
  return raw.replace(/^```[\w]*\n?/g, '').replace(/```$/g, '').trim();
}

/** 角色朋友圈生成器 */
export class MomentsGenerator {
  constructor(
    private readonly momentsService: MomentsService,
    private readonly novelManager: NovelManager,
  ) {}

  /** 该章节的该角色是否已存在剧情动态（去重：每个角色每章最多一条自动触发的剧情朋友圈） */
  hasPlotMomentForChapter(novelId: string, chapterNumber: number, characterId?: string): boolean {
    return this.momentsService.hasPlotMomentForChapter(novelId, chapterNumber, characterId);
  }

  /** 生成一条朋友圈动态并保存 */
  async generateMoment(params: {
    novelId: string;
    characterId: string;
    type: MomentType;
    relatedChapterNum?: number;
    agents?: Map<string, NovelAgent>;
    modelClient?: ModelClient;
  }): Promise<{ momentId: string; content: string } | { error: string }> {
    const { novelId, characterId, type, relatedChapterNum } = params;
    const agent = params.agents?.get('character-moments');
    if (!agent || !params.modelClient) {
      return { error: 'AI 生成能力未就绪，请先配置模型' };
    }

    const novel = await this.novelManager.getNovel(novelId);
    if (!novel) return { error: '作品未找到' };

    const characters = await this.novelManager.getCharacters?.(novelId) ?? [];
    const character = (characters as any[]).find((c) => c.id === characterId);
    if (!character) return { error: '角色未找到' };
    if (character.status === 'dead' || character.status === 'exited') {
      return { error: '该角色已退场，无法发动态' };
    }

    // 世界观上下文
    let worldContext = '';
    try {
      const worldEntries = await (this.novelManager as any).getWorldEntries?.(novelId) ?? [];
      worldContext = (worldEntries as any[]).map((e: any) =>
        `[${e.category || '设定'}] ${e.name}: ${e.description || ''}`,
      ).join('\n');
    } catch { /* 忽略 */ }

    // 获取角色最新状态快照（情绪/压力/信念）
    let latestSnapshot: any = null;
    try {
      const snapshots = await this.novelManager.getCharacterStateSnapshots(novelId, characterId);
      if (snapshots.length > 0) {
        latestSnapshot = snapshots.sort((a: any, b: any) => b.chapterNumber - a.chapterNumber)[0];
      }
    } catch { /* 忽略 */ }

    // 获取认知边界数据（角色事件 + 章节事实）
    let knowledgeBoundary: {
      events: any[];
      facts: Array<{ chapterNumber: number; fact: any }>;
      latestFinalizedChapter: number;
      detailLevel: 'full' | 'summary' | 'brief';
    } | undefined;
    try {
      const novelMeta = await this.novelManager.getNovel(novelId);
      const latestFinal = (novelMeta as any).finalizedChapterCount ?? 0;
      if (latestFinal > 0) {
        const [events, factsRecord] = await Promise.all([
          this.novelManager.getCharacterEvents(novelId, characterId),
          (this.novelManager as any).getChapterFacts?.(novelId) ?? {},
        ]);
        const facts = Object.entries(factsRecord)
          .map(([ch, fact]) => ({ chapterNumber: Number(ch), fact }))
          .filter(f => f.chapterNumber <= latestFinal);
        if (events.length > 0 || facts.length > 0) {
          knowledgeBoundary = { events, facts, latestFinalizedChapter: latestFinal, detailLevel: 'summary' };
        }
      }
    } catch { /* 忽略，无数据时优雅降级 */ }

    // 构建灵魂上下文（V2深度字段 + 成长轨迹 + 情绪状态 + 认知边界）
    const soulContext = buildFullSoulPrompt(character, {
      snapshot: latestSnapshot,
      includeGrowth: true,
      includeKnowledgeBoundary: true,
      knowledgeBoundary,
    });

    const characterContext = buildCharacterContext(character, soulContext);

    const typeDesc: Record<MomentType, string> = {
      mood: '发一条心情动态，表达角色此刻的内心感受',
      plot: relatedChapterNum
        ? `发一条剧情吐槽，以角色视角感慨第 ${relatedChapterNum} 章发生的事（只能基于已发布章节，不剧透未来）`
        : '发一条剧情吐槽，以角色视角感慨最近发生的事',
      daily: '发一条日常碎片动态，展现角色人设的日常一面，不涉及具体剧情',
      dream: '发一条梦境/潜意识动态，展现角色内心深处的幻想、恐惧、或荒谬念头。脱离现实逻辑，可以有诗意、荒诞、超现实的表达',
      reveal: '发一条独家爆料动态，角色以一种半遮半掩的语气透露关于另一角色的秘密、八卦或内幕消息。要带有神秘感，不说透但引人遐想',
      night: '发一条深夜话题动态，角色在深夜独处时的内心独白。可以是感叹人生、回忆往事、暗示脆弱面。语气低回、感性，带有深夜特有的情绪氛围',
      challenge: '发一条公开挑衅动态，以挑衅的语气直接喊话对手。要带有火药味但不粗俗，展现角色的气势和立场。语气嚣张、轻蔑、或者冷峻',
    };

    const context: AgentContext = {
      novelId,
      genre: (novel as any).genre || '奇幻',
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis || novel.description || '',
      characterContext,
      worldContext,
      userDirection: `你现在要作为「${character.name}」发一条朋友圈动态。

任务：${typeDesc[type]}

要求：
1. 严格保持角色的性格、语言风格和口头禅
2. 50-150 字，朋友圈体，像真人在社交媒体分享
3. 不要出戏，绝对不提及"AI""语言模型""小说""章节"等
4. 直接输出动态正文，不要加引号、标题或解释
5. 如果是剧情吐槽，只允许引用到第 ${relatedChapterNum ?? '最新'} 章为止的已发生剧情`,
    };

    const output = await agent.execute(context, params.modelClient);
    const content = cleanOutput(output.content || '');
    if (!content) return { error: '生成内容为空' };

    // daily 类型有 30% 概率标记为私密动态（卡牌收集联动：需收藏角色才可见）
    const isPrivate = type === 'daily' && Math.random() < 0.3;

    const moment = this.momentsService.createMoment({
      novelId,
      novelTitle: novel.title,
      characterId,
      characterName: character.name,
      characterRole: getRoleLabel(character.role),
      type,
      content,
      relatedChapterNum,
      isPrivate,
    });

    // 自动互赞：其他活跃角色随机给新动态点赞
    this.autoLikeMoment(moment.id, novelId, characterId, characters as any[]);

    return { momentId: moment.id, content };
  }

  /** 为一条动态生成角色互评（最多 maxComments 条） */
  async generateCommentsForMoment(params: {
    momentId: string;
    maxComments?: number;
    agents?: Map<string, NovelAgent>;
    modelClient?: ModelClient;
  }): Promise<{ generated: number; error?: string }> {
    const { momentId } = params;
    const max = params.maxComments ?? 3;
    const agent = params.agents?.get('character-moments');
    if (!agent || !params.modelClient) {
      return { generated: 0, error: 'AI 生成能力未就绪' };
    }

    const moment = this.momentsService.getById(momentId);
    if (!moment) return { generated: 0, error: '动态未找到' };

    const novel = await this.novelManager.getNovel(moment.novelId);
    if (!novel) return { generated: 0, error: '作品未找到' };

    const characters = await this.novelManager.getCharacters?.(moment.novelId) ?? [];
    const author = (characters as any[]).find((c) => c.id === moment.characterId);
    if (!author) return { generated: 0, error: '动态作者角色未找到' };

    // 取与作者有关系、且活跃的其他角色（优先有关系者，补足主角/反派）
    // 对手戏联动：对立/竞争关系的角色会被加权，提高选中概率
    const relationshipIds = new Set(
      (author.relationships || []).map((r: any) => r.targetId).filter(Boolean),
    );
    const rivalIds = new Set(
      (author.relationships || [])
        .filter((r: any) =>
          r.type === '敌对' || r.type === '竞争' || r.type === '仇敌' ||
          r.powerDynamic === 'dominant' || r.type === '冲突',
        )
        .map((r: any) => r.targetId)
        .filter(Boolean),
    );

    const socialCoreRoles = new Set(['protagonist', 'deuteragonist', 'antagonist', 'rival', 'love_interest', 'mentor', 'ally', 'faction_leader']);
    let candidates = (characters as any[]).filter((c) =>
      c.id !== moment.characterId &&
      c.status !== 'dead' &&
      c.status !== 'exited' &&
      c.momentsEnabled !== false &&
      (relationshipIds.has(c.id) || socialCoreRoles.has(c.role)),
    );

    // 对手戏角色双倍加权：在候选池中重复一次，提升选中概率
    const rivals = candidates.filter(c => rivalIds.has(c.id));
    candidates = candidates.concat(rivals);

    const selected = candidates.sort(() => Math.random() - 0.5).slice(0, max);

    let generated = 0;
    for (const commenter of selected) {
      const content = await this.generateSingleComment(moment, author, commenter, novel, agent, params.modelClient);
      if (!content) continue;
      const comment = this.momentsService.addComment(momentId, {
        authorType: 'character',
        authorId: commenter.id,
        authorName: commenter.name,
        content,
      });
      if (!comment) continue;
      generated++;
    }

    // 随机化互评深化：发帖人回评 + 评论者之间互相回复
    if (generated >= 1) {
      await this.generateRandomReplies(momentId, author, selected, moment, novel, agent, params.modelClient);
    }

    return { generated };
  }

  /** @某角色回应指定动态（读者召唤） */
  async generateMentionReply(params: {
    momentId: string;
    commenterId: string;
    agents?: Map<string, NovelAgent>;
    modelClient?: ModelClient;
  }): Promise<{ comment?: any; error?: string }> {
    const { momentId, commenterId } = params;
    const agent = params.agents?.get('character-moments');
    if (!agent || !params.modelClient) {
      return { error: 'AI 生成能力未就绪' };
    }

    const moment = this.momentsService.getById(momentId);
    if (!moment) return { error: '动态未找到' };

    const novel = await this.novelManager.getNovel(moment.novelId);
    if (!novel) return { error: '作品未找到' };

    const characters = await this.novelManager.getCharacters?.(moment.novelId) ?? [];
    const author = (characters as any[]).find((c) => c.id === moment.characterId);
    const commenter = (characters as any[]).find((c) => c.id === commenterId);
    if (!author || !commenter) return { error: '角色未找到' };
    if (commenter.status === 'dead' || commenter.status === 'exited') {
      return { error: '该角色已退场' };
    }

    const content = await this.generateSingleComment(moment, author, commenter, novel, agent, params.modelClient);
    if (!content) return { error: '角色暂时无法回应' };

    const comment = this.momentsService.addComment(momentId, {
      authorType: 'character',
      authorId: commenter.id,
      authorName: commenter.name,
      content,
    });
    if (!comment) return { error: '动态不存在或评论已满' };
    return { comment };
  }

  /** 自动互赞：其他活跃角色随机点赞新动态（模拟朋友圈社交感） */
  private autoLikeMoment(
    momentId: string,
    _novelId: string,
    authorCharId: string,
    allCharacters: any[],
  ): void {
    const candidates = allCharacters.filter(
      (c: any) =>
        c.id !== authorCharId &&
        c.status !== 'dead' &&
        c.status !== 'exited' &&
        c.momentsEnabled !== false,
    );
    // 随机选 30%-70% 的候选角色点赞
    for (const c of candidates) {
      if (Math.random() < 0.5) {
        this.momentsService.toggleLike(momentId, c.id);
      }
    }
  }

  /** 生成单条角色评论（私有，被互评与 @召唤 复用） */
  private async generateSingleComment(
    moment: CharacterMoment,
    author: any,
    commenter: any,
    novel: any,
    agent: NovelAgent,
    modelClient: ModelClient,
  ): Promise<string | null> {
    try {
      const commenterContext = buildCharacterContext(commenter);
      const relationDesc = (author.relationships || []).find((r: any) => r.targetId === commenter.id);

      const context: AgentContext = {
        novelId: moment.novelId,
        genre: (novel as any).genre || '奇幻',
        novelTitle: moment.novelTitle,
        novelSynopsis: '',
        characterContext: commenterContext,
        userDirection: `你现在要作为「${commenter.name}」在朋友圈评论「${author.name}」的动态。

${author.name}的动态：
"""
${moment.content}
"""

${relationDesc ? `你和${author.name}的关系：${relationDesc.description || relationDesc.type || '未说明'}` : ''}

要求：
1. 严格保持你（${commenter.name}）的性格、语言风格和口头禅
2. 20-80 字，短评，像微信评论
3. 可以调侃、安慰、反驳、附和——取决于你们的关系
4. 不要出戏，绝对不提及"AI""语言模型""小说""章节"等
5. 直接输出评论内容，不要加引号或解释`,
      };

      const output = await agent.execute(context, modelClient);
      return cleanOutput(output.content || '') || null;
    } catch {
      return null;
    }
  }

  /** 生成一条回复评论（针对已有评论的回应） */
  private async generateSingleReply(
    moment: CharacterMoment,
    replier: any,
    targetComment: { authorName: string; content: string },
    relationContext: string,
    novel: any,
    agent: NovelAgent,
    modelClient: ModelClient,
  ): Promise<string | null> {
    try {
      const context: AgentContext = {
        novelId: moment.novelId,
        genre: (novel as any).genre || '奇幻',
        novelTitle: moment.novelTitle,
        novelSynopsis: '',
        characterContext: buildCharacterContext(replier),
        userDirection: `你现在要作为「${replier.name}」在朋友圈回复「${targetComment.authorName}」的评论。

主贴（${moment.characterName}）：
"""
${moment.content}
"""

${targetComment.authorName}的评论：
"""
${targetComment.content}
"""
${relationContext}

要求：
1. 严格保持你（${replier.name}）的性格、语言风格和口头禅
2. 15-60 字，短回复，像微信对话
3. 可以调侃、反驳、赞同、追问——随关系而定
4. 不要出戏，绝对不提及"AI""语言模型"等
5. 直接输出回复内容，不要加引号或解释`,
      };

      const output = await agent.execute(context, modelClient);
      return cleanOutput(output.content || '') || null;
    } catch {
      return null;
    }
  }

  /** 随机化深化互动：发帖人回评 + 评论者之间互相回复 */
  private async generateRandomReplies(
    momentId: string,
    author: any,
    commenters: any[],
    moment: CharacterMoment,
    novel: any,
    agent: NovelAgent,
    modelClient: ModelClient,
  ): Promise<void> {
    // 获取当前动态的最新评论列表
    const latestMoment = this.momentsService.getById(momentId);
    if (!latestMoment || latestMoment.comments.length === 0) return;

    const characterComments = latestMoment.comments.filter(c => c.authorType === 'character');

    // 1. 发帖人回评：40% 概率，随机选一条角色评论回复
    if (characterComments.length >= 1 && Math.random() < 0.4) {
      const target = characterComments[Math.floor(Math.random() * characterComments.length)];
      const replierRelation = (author.relationships || [])
        .find((r: any) => r.targetId === target.authorId);
      const relationCtx = replierRelation
        ? `你和${target.authorName}的关系：${replierRelation.description || replierRelation.type || '未说明'}`
        : '';
      const reply = await this.generateSingleReply(
        moment, author, { authorName: target.authorName, content: target.content },
        relationCtx, novel, agent, modelClient,
      );
      if (reply) {
        this.momentsService.addComment(momentId, {
          authorType: 'character',
          authorId: author.id,
          authorName: author.name,
          content: reply,
        });
      }
    }

    // 2. 评论者互回：30% 概率，随机选一个评论者回复另一个评论者的评论
    if (characterComments.length >= 2 && Math.random() < 0.3) {
      // 随机选两个不同评论者的评论（一作目标、一作回复者）
      const shuffled = [...characterComments].sort(() => Math.random() - 0.5);
      const target = shuffled[0];
      const replierCandidates = shuffled.filter(c => c.authorId !== target.authorId);
      if (replierCandidates.length > 0) {
        const replierComment = replierCandidates[0];
        const replier = commenters.find(c => c.id === replierComment.authorId)
          ?? { id: replierComment.authorId, name: replierComment.authorName };

        const relationDesc = (replier.relationships || [])
          .find((r: any) => r.targetId === target.authorId);
        const relationCtx = relationDesc
          ? `你和${target.authorName}的关系：${relationDesc.description || relationDesc.type || '未说明'}`
          : `你注意到了${target.authorName}的评论，忍不住想说点什么`;
        const reply = await this.generateSingleReply(
          moment, replier, { authorName: target.authorName, content: target.content },
          relationCtx, novel, agent, modelClient,
        );
        if (reply) {
          this.momentsService.addComment(momentId, {
            authorType: 'character',
            authorId: replier.id,
            authorName: replier.name,
            content: reply,
          });
        }
      }
    }
  }
}
