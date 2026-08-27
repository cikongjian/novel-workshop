/**
 * 角色主动搭话服务
 * 
 * 职责：基于读者行为（章节进度、阅读时间间隔、新番外）自动生成角色语气消息，
 * 让角色"活过来"主动和读者说话，而不是被动等读者写信。
 * 
 * 使用 LLM 根据角色性格标签生成个性化的搭话内容。
 */
import { createLogger } from '../utils/logger.js';
import type { UnifiedMessageService } from './unified-message-service.js';
import type { ModelClient } from '../models/types.js';

const log = createLogger('CharacterOutreachService');

// ===== 类型 =====

export interface CharacterBrief {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  personality: string;
  personalityTraits: string[];
  backstory?: string;
  speechStyle?: string;
  speechExamples?: string[];
  portraitImagePath?: string;
  mailboxEnabled?: boolean;
  /** V2 深度字段（灵魂上下文） */
  drives?: any;
  persona?: any;
  psychology?: any;
  symbolism?: any;
  growthTrack?: any;
  /** 最新状态快照（情绪/压力/信念） */
  latestSnapshot?: {
    emotionState?: { primary: string; intensity: number; trigger?: string };
    stress: number;
    beliefShift: string;
    goalProgress: number;
    chapterNumber: number;
  } | null;
}

export interface OutreachContext {
  novelId: string;
  novelTitle: string;
  /** 读者当前读到的章节号 */
  currentChapterNumber?: number;
  /** 当前章节标题 */
  currentChapterTitle?: string;
  /** 读者最近一次阅读时间 */
  lastReadAt?: string;
  /** 触发场景 */
  scenario: 'chapter_milestone' | 'daily_greeting' | 'inactive_reminder' | 'new_side_story'
    | 'emotional_breakdown' | 'belief_crisis' | 'relationship_shift';
  /** 番外标题（new_side_story 场景） */
  sideStoryTitle?: string;
}

// ===== 频率限制 =====

const MAX_OUTREACH_PER_CHARACTER_DAILY = 2;
const MAX_OUTREACH_TOTAL_DAILY = 5;

// ===== 服务 =====

export class CharacterOutreachService {
  private dailyCounts: Map<string, { date: string; counts: Map<string, number> }> = new Map();

  constructor(
    private readonly msgService: UnifiedMessageService,
    private readonly modelClient?: ModelClient,
  ) {}

  /** 检查频率限制 */
  private checkRateLimit(userId: string, characterId: string): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const record = this.dailyCounts.get(userId);
    if (!record || record.date !== today) {
      this.dailyCounts.set(userId, { date: today, counts: new Map() });
      return true;
    }
    const total = [...record.counts.values()].reduce((a, b) => a + b, 0);
    if (total >= MAX_OUTREACH_TOTAL_DAILY) return false;
    if ((record.counts.get(characterId) || 0) >= MAX_OUTREACH_PER_CHARACTER_DAILY) return false;
    return true;
  }

  private recordOutreach(userId: string, characterId: string) {
    const record = this.dailyCounts.get(userId)!;
    record.counts.set(characterId, (record.counts.get(characterId) || 0) + 1);
  }

  /**
   * 检查是否需要触发搭话，如果需要则生成消息
   * 应在用户读完一章后调用
   */
  async tryOutreach(
    userId: string,
    characters: CharacterBrief[],
    context: OutreachContext,
  ): Promise<number> {
    const enabled = characters.filter((c) => c.mailboxEnabled !== false && c.name && c.name.length >= 2);
    if (enabled.length === 0) return 0;

    let triggered = 0;
    for (const char of enabled) {
      if (!this.checkRateLimit(userId, char.id)) continue;

      // 情绪驱动场景检测：如果角色状态快照显示强烈情绪，
      // 覆盖原始场景，改用情绪爆发型搭话
      const effectiveContext = this.detectEmotionalScenario(char, context);

      try {
        const message = await this.generateOutreachMessage(char, effectiveContext);
        if (!message) continue;

        this.msgService.notifyCharacterOutreach({
          userId,
          characterId: char.id,
          characterName: char.name,
          novelId: context.novelId,
          message,
          portraitImagePath: char.portraitImagePath,
        });

        this.recordOutreach(userId, char.id);
        triggered++;
      } catch (err) {
        log.warn(`搭话生成失败 (${char.name})`, { error: String(err) });
      }
    }

    if (triggered > 0) {
      log.info(`角色搭话触发: ${triggered} 条 (用户 ${userId}, 小说 ${context.novelId})`);
    }
    return triggered;
  }

  /**
   * 情绪驱动场景检测：基于角色最新状态快照判断是否需要触发情绪型搭话
   * - stress > 75 → emotional_breakdown（情绪爆发）
   * - beliefShift 非空 → belief_crisis（信念动摇）
   * - 默认保持原始场景
   */
  private detectEmotionalScenario(
    char: CharacterBrief,
    originalContext: OutreachContext,
  ): OutreachContext {
    const snapshot = char.latestSnapshot;
    if (!snapshot) return originalContext;

    // 优先级：情绪爆发 > 信念动摇 > 原始场景
    // 只在 chapter_milestone 场景下触发情绪型搭话（避免日常问候被覆盖）
    if (originalContext.scenario !== 'chapter_milestone' && originalContext.scenario !== 'daily_greeting') {
      return originalContext;
    }

    // stress 极高 → 情绪爆发
    if (snapshot.stress > 75) {
      return { ...originalContext, scenario: 'emotional_breakdown' };
    }

    // 信念动摇
    if (snapshot.beliefShift && snapshot.beliefShift.trim().length > 0) {
      return { ...originalContext, scenario: 'belief_crisis' };
    }

    return originalContext;
  }

  /**
   * 默认搭话生成（无 LLM 时的规则模板）
   */
  private getTemplateMessage(char: CharacterBrief, ctx: OutreachContext): string {
    const { name, roleLabel, personalityTraits } = char;
    const traits = personalityTraits.length > 0 ? personalityTraits : [];

    switch (ctx.scenario) {
      case 'chapter_milestone': {
        const chapter = ctx.currentChapterNumber ? `第${ctx.currentChapterNumber}章` : '这里';
        const lines = [
          `你看完了${chapter}？有趣。`,
          `${chapter}的剧情，你觉得怎么样？`,
          `读到${chapter}了……后面还有更精彩的等着你。`,
          `嘿，${chapter}那一段，我有很多话想说。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      case 'daily_greeting': {
        const hour = new Date().getHours();
        const timeWord = hour < 10 ? '早上' : hour < 14 ? '中午' : hour < 19 ? '下午' : '晚上';
        const lines = [
          `${timeWord}好。今天有空聊几句吗？`,
          `${timeWord}好，我还以为你今天不来了呢。`,
          `又是新的一天。你来了就好。`,
          `${timeWord}好。今天想看点什么？`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      case 'inactive_reminder': {
        const lines = [
          `你很久没来了……是不是把我忘了？`,
          `好久不见，这边的故事还在等你。`,
          `我以为你不会再来了。`,
          `你不在的这些天，发生了不少事。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      case 'new_side_story': {
        const storyTitle = ctx.sideStoryTitle || '一篇番外';
        const lines = [
          `有人写了《${storyTitle}》，说的是我的故事…来看看？`,
          `你看到《${storyTitle}》了吗？我觉得……写得还行。`,
          `新出了《${storyTitle}》，关于我的过去。有兴趣吗？`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      case 'emotional_breakdown': {
        const lines = [
          `我快撑不住了……你还在吗？`,
          `有些话不知道该跟谁说。你愿意听吗？`,
          `今天的事……我没办法假装没事。`,
          `我需要跟人聊聊，哪怕只是听我说完。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      case 'belief_crisis': {
        const lines = [
          `你有没有过那种……突然不知道自己一直以来坚持的对不对的时候？`,
          `我一直在想一件事，可能我之前想错了。`,
          `有些东西动摇了，我不确定该怎么办。`,
          `能跟你聊聊吗？我好像需要重新审视一些事。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      case 'relationship_shift': {
        const lines = [
          `我们之间的关系……是不是变了？`,
          `最近发生的事让我重新看待一些人。`,
          `我对你的看法，可能跟以前不一样了。`,
          `有些事我想当面跟你说。`,
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }

      default:
        return '想和你聊聊。';
    }
  }

  /**
   * 通过 LLM 生成角色语气搭话
   */
  private async generateOutreachMessage(
    char: CharacterBrief,
    ctx: OutreachContext,
  ): Promise<string | null> {
    // 无 LLM 时用模板
    if (!this.modelClient) {
      return this.getTemplateMessage(char, ctx);
    }

    const scenarioPrompt: Record<string, string> = {
      chapter_milestone: `读者刚读完《${ctx.novelTitle}》的第${ctx.currentChapterNumber ?? '?'}章"${ctx.currentChapterTitle ?? ''}"。角色要以第一人称对读者说一句简短的话，内容与当前阅读进度有关，语气要符合角色性格。`,
      daily_greeting: `读者今天首次打开 App。角色要以第一人称对读者说一句简短的问候或吐槽（不要"早安"模板话术），内容要像角色真的在跟读者说话，而不是系统消息。`,
      inactive_reminder: `读者已经两三天没来了。角色要表达一点幽怨或想念，但不要太过分，语气要符合角色性格。`,
      new_side_story: `有一篇关于这个角色的新番外上线了："${ctx.sideStoryTitle ?? '一篇番外'}"。角色要向读者安利这篇番外，语气要自然、符合角色性格，不要像广告。`,
      emotional_breakdown: `角色刚刚经历了非常严重的打击，压力值极高（${char.latestSnapshot?.stress ?? 80}/100），处于情绪濒临崩溃的状态。角色要主动找读者倾诉，语气要体现角色的脆弱和崩溃感——但仍然保持角色的性格底色（比如傲娇角色不会直接说"我需要你"，而是用别扭的方式表达；反派角色会试图掩饰但掩饰不住）。不要说"我压力很大"这种直白的描述，要让读者从语气和用词中感受到。`,
      belief_crisis: `角色最近经历了信念动摇（${char.latestSnapshot?.beliefShift ?? ''}）。角色要主动跟读者聊起这个话题，语气要体现迷茫和动摇——但仍然保持角色的性格底色。不要直接复述信念变化的内容，而是用角色的方式暗示"有些事跟以前想的不一样了"。`,
      relationship_shift: `角色对读者的关系感知发生了变化。角色要以第一人称表达这种变化——如果关系变近了，语气会更亲近；如果关系疏远了，语气会更冷淡或带刺。`,
    };

    const sceneRule = scenarioPrompt[ctx.scenario] || '';

    const traitsDesc = char.personalityTraits.length > 0
      ? char.personalityTraits.join('、')
      : (char.personality || '未设定');

    const speechDesc = [char.speechStyle, char.speechExamples?.join('；')].filter(Boolean).join('；');

    // 构建灵魂上下文（V2深度字段）
    const soulParts: string[] = [];
    if (char.drives?.fear) soulParts.push(`核心恐惧：${char.drives.fear}`);
    if (char.drives?.secret) soulParts.push(`隐藏秘密：${char.drives.secret}`);
    if (char.persona?.publicPersona) soulParts.push(`人前形象：${char.persona.publicPersona}`);
    if (char.persona?.privatePersona) soulParts.push(`独处面目：${char.persona.privatePersona}`);
    if (char.psychology?.emotionalTriggers?.length) soulParts.push(`情绪雷区：${char.psychology.emotionalTriggers.join('、')}`);
    if (char.growthTrack?.unresolvedTrauma?.length) soulParts.push(`未愈合创伤：${char.growthTrack.unresolvedTrauma.join('；')}`);
    const soulDesc = soulParts.length > 0 ? `\n\n${soulParts.join('\n')}` : '';

    const systemPrompt = `你是《${ctx.novelTitle}》中的角色「${char.name}」（${char.roleLabel}）。

角色性格标签：${traitsDesc}
${char.personality ? `性格描述：${char.personality}` : ''}
${speechDesc ? `语言风格/口头禅：${speechDesc}` : ''}
${char.backstory ? `背景：${char.backstory.slice(0, 200)}` : ''}${soulDesc}

要求：
1. 以角色身份说一句话（20-40字）
2. 绝对不要提"AI""语言模型""我是程序"等
3. 不要用角色名+冒号的格式
4. 直接输出对话内容，不要加引号、标题或解释
5. 语气严格符合角色性格（反派带刺、傲娇带酸味、温柔角色发糖）`;

    try {
      const resp = await this.modelClient.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sceneRule },
      ], { temperature: 0.9, maxTokens: 120 });

      const text = (resp?.content ?? '').trim()
        .replace(/^[""]/, '').replace(/[""]$/, '')
        .replace(/^\s*[-–—]\s*/, '')
        .slice(0, 80);

      if (!text || text.length < 5) return null;
      return text;
    } catch (err) {
      log.warn('LLM 搭话生成失败，降级到模板', { error: String(err) });
      return this.getTemplateMessage(char, ctx);
    }
  }
}
