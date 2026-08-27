/**
 * 角色灵魂上下文构建器
 *
 * 将 V2 深度角色模型（drives / persona / psychology / symbolism / growthTrack）
 * 以及关系向量、状态快照等"已建好但未使用"的深度数据，
 * 转化为 LLM prompt 可直接拼接的结构化文本。
 *
 * 职责单一：纯函数，从角色档案 + 可选状态数据 → prompt 字符串。
 * 不做 IO，不调 AI，不依赖 Express。
 */
import type { CharacterProfile, CharacterStateSnapshot, CharacterEvent, ChapterFact } from './types.js';
import { buildKnowledgeScope, renderKnowledgeBoundaryPrompt } from './character-knowledge-boundary.js';

/** 截断辅助 */
function clamp(text: string | undefined | null, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** 安全获取数组 join */
function joinArr(arr: string[] | undefined | null, sep = '、'): string {
  if (!arr || arr.length === 0) return '';
  return arr.filter(Boolean).join(sep);
}

/**
 * 构建角色"灵魂"上下文 —— 内心驱动力、公私面具、心理画像。
 * 这是让角色从"知道剧情的AI"变成"有内心矛盾的角色本人"的关键。
 */
export function buildSoulContext(character: any): string {
  const parts: string[] = [];

  // ── 内心驱动力（drives）──
  const drives = character.drives;
  if (drives) {
    const lines: string[] = [];
    if (drives.want) lines.push(`表层渴望：${clamp(drives.want, 100)}`);
    if (drives.need) lines.push(`深层需求：${clamp(drives.need, 100)}`);
    if (drives.fear) lines.push(`核心恐惧：${clamp(drives.fear, 100)}`);
    if (drives.secret) lines.push(`隐藏秘密：${clamp(drives.secret, 150)}`);
    if (drives.taboo && drives.taboo.length > 0) lines.push(`不可触碰的禁忌：${joinArr(drives.taboo)}`);
    if (lines.length > 0) {
      parts.push(`【内心驱动力】\n${lines.join('\n')}`);
    }
  }

  // ── 公私面具（persona）──
  const persona = character.persona;
  if (persona && (persona.publicPersona || persona.privatePersona)) {
    const lines: string[] = [];
    if (persona.publicPersona) lines.push(`人前形象：${clamp(persona.publicPersona, 100)}`);
    if (persona.privatePersona) lines.push(`独处面目：${clamp(persona.privatePersona, 100)}`);
    if (persona.maskTrigger) lines.push(`面具崩裂触发点：${clamp(persona.maskTrigger, 100)}`);
    if (lines.length > 0) {
      parts.push(`【公私面具】\n${lines.join('\n')}`);
    }
  }

  // ── 心理画像（psychology）──
  const psych = character.psychology;
  if (psych && (psych.worldview || psych.copingMechanisms?.length || psych.emotionalTriggers?.length)) {
    const lines: string[] = [];
    if (psych.worldview) lines.push(`核心信念：${clamp(psych.worldview, 120)}`);
    if (psych.copingMechanisms?.length) lines.push(`应对压力的方式：${joinArr(psych.copingMechanisms)}`);
    if (psych.emotionalTriggers?.length) lines.push(`情绪雷区：${joinArr(psych.emotionalTriggers)}`);
    if (lines.length > 0) {
      parts.push(`【心理画像】\n${lines.join('\n')}`);
    }
  }

  // ── 象征系统（symbolism）──
  const sym = character.symbolism;
  if (sym && (sym.symbolObject || sym.recurringMotif || sym.themeWord)) {
    const lines: string[] = [];
    if (sym.symbolObject) lines.push(`象征物：${clamp(sym.symbolObject, 60)}`);
    if (sym.recurringMotif) lines.push(`标志性动作：${clamp(sym.recurringMotif, 60)}`);
    if (sym.themeWord) lines.push(`主题词：${clamp(sym.themeWord, 30)}`);
    if (lines.length > 0) {
      parts.push(`【象征系统】\n${lines.join('\n')}`);
    }
  }

  // ── 性格 V2（personalityModel）──
  const pm = character.personalityModel;
  if (pm) {
    const lines: string[] = [];
    if (pm.traits?.length) lines.push(`性格标签：${joinArr(pm.traits)}`);
    if (pm.innerContradictions?.length) lines.push(`内在矛盾：${joinArr(pm.innerContradictions, '；')}`);
    if (pm.moralBoundary?.length) lines.push(`道德底线：${joinArr(pm.moralBoundary, '；')}`);
    if (lines.length > 0) {
      parts.push(`【性格深描】\n${lines.join('\n')}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * 构建角色成长轨迹上下文 —— 未解决创伤、未兑现承诺、里程碑。
 * 让角色聊天时能"带出过去的事"，而不是永远活在当下。
 */
export function buildGrowthContext(character: any): string {
  const track = character.growthTrack;
  if (!track) return '';

  const parts: string[] = [];

  if (track.unresolvedTrauma?.length > 0) {
    parts.push(`【未愈合的创伤】\n${track.unresolvedTrauma.map((t: string) => `· ${clamp(t, 80)}`).join('\n')}`);
  }

  if (track.pendingPromises?.length > 0) {
    parts.push(`【未兑现的承诺】\n${track.pendingPromises.map((p: string) => `· ${clamp(p, 80)}`).join('\n')}`);
  }

  // 最近 3 个里程碑
  if (track.milestones?.length > 0) {
    const recent = track.milestones.slice(-3);
    const milestoneText = recent.map((m: any) =>
      `· 第${m.chapter}章 ${clamp(m.event, 60)}${m.insight ? ` → ${clamp(m.insight, 50)}` : ''}`
    ).join('\n');
    parts.push(`【近期成长节点】\n${milestoneText}`);
  }

  if (track.archivedMilestonesSummary) {
    parts.push(`【早期经历摘要】\n${clamp(track.archivedMilestonesSummary, 150)}`);
  }

  return parts.join('\n\n');
}

/**
 * 构建情绪状态上下文 —— 从 CharacterStateSnapshot 提取。
 * 让角色聊天时情绪与剧情进度一致，而不是永远情绪稳定。
 */
export function buildEmotionContext(snapshot?: CharacterStateSnapshot | null): string {
  if (!snapshot) return '';

  const parts: string[] = [];

  // 情绪状态
  if (snapshot.emotionState && snapshot.emotionState.primary !== 'neutral') {
    const emo = snapshot.emotionState;
    const intensityDesc = emo.intensity > 70 ? '强烈' : emo.intensity > 40 ? '明显' : '微微';
    parts.push(`【当前情绪】${emo.primary}（${intensityDesc}，强度${emo.intensity}/100）${emo.trigger ? `，触发原因：${clamp(emo.trigger, 60)}` : ''}`);
  }

  // 压力水平
  if (snapshot.stress > 50) {
    const stressDesc = snapshot.stress > 75 ? '濒临崩溃' : snapshot.stress > 60 ? '高度紧张' : '压力较大';
    parts.push(`【心理压力】${stressDesc}（${snapshot.stress}/100）`);
  }

  // 信念动摇
  if (snapshot.beliefShift) {
    parts.push(`【信念动摇】${clamp(snapshot.beliefShift, 100)}`);
  }

  // 目标进度
  if (snapshot.goalProgress !== undefined && snapshot.goalProgress !== 50) {
    if (snapshot.goalProgress < 30) {
      parts.push(`【目标推进】陷入困境（${snapshot.goalProgress}%）`);
    } else if (snapshot.goalProgress > 80) {
      parts.push(`【目标推进】接近达成（${snapshot.goalProgress}%）`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

/**
 * 构建信息边界上下文 —— 角色知道什么、不知道什么。
 * 这是悬疑/推理类小说角色聊天的杀手锏。
 *
 * 注意：此函数仅构建"秘密/面具"层级的边界（不需要事件数据）。
 * 完整的认知时间线边界由 character-knowledge-boundary.ts 提供。
 */
export function buildKnowledgeBoundaryContext(character: any): string {
  const secrets: string[] = [];
  if (character.drives?.secret) {
    secrets.push('你有一个不能让人知道的秘密');
  }
  if (character.persona?.publicPersona && character.persona?.privatePersona) {
    secrets.push('你对外展示的形象和真实的自己不一样');
  }

  const parts: string[] = [];
  if (secrets.length > 0) {
    parts.push(`【秘密边界】\n${secrets.map(s => `· ${s}`).join('\n')}`);
    parts.push(`注意：如果读者追问你的秘密，你应该本能地回避、转移话题或反问，而不是坦诚相告。`);
  }

  return parts.join('\n');
}

/**
 * 构建关系感知上下文 —— 读者与角色的关系。
 * 让角色态度随关系变化而不同（如信任度低时冷淡，信任度高时吐露心声）。
 */
export function buildRelationshipContext(
  character: any,
  readerRelationship?: { trust?: number; affection?: number; closeness?: number } | null,
): string {
  if (!readerRelationship) return '';

  const parts: string[] = [];
  const trust = readerRelationship.trust ?? 0;
  const affection = readerRelationship.affection ?? 0;

  if (trust < -30) {
    parts.push('你对这个读者很不信任，说话会防备、简短、带刺。');
  } else if (trust < 0) {
    parts.push('你对这个读者略有戒心，不会轻易吐露心声。');
  } else if (trust > 60) {
    parts.push('你对这个读者很信任，愿意分享一些内心想法。');
  } else if (trust > 30) {
    parts.push('你对这个读者比较友善，但还不会说太深的话。');
  }

  if (affection > 60) {
    parts.push('你对这个读者有好感，语气会更温柔。');
  } else if (affection < -30) {
    parts.push('你对这个读者反感，语气会更冷硬。');
  }

  return parts.length > 0 ? `【关系感知】\n${parts.join('\n')}` : '';
}

/**
 * 一站式构建：将所有灵魂上下文合并为一段 prompt。
 * 可按需选择启用哪些维度。
 *
 * 如果传入 events + facts + latestFinalizedChapter，会生成完整的
 * 认知时间线边界（角色只知道亲历过的事），否则只生成秘密/面具层级的边界。
 */
export function buildFullSoulPrompt(
  character: any,
  options?: {
    snapshot?: CharacterStateSnapshot | null;
    readerRelationship?: { trust?: number; affection?: number; closeness?: number } | null;
    includeGrowth?: boolean;
    includeKnowledgeBoundary?: boolean;
    knowledgeBoundary?: {
      events: CharacterEvent[];
      facts: Array<{ chapterNumber: number; fact: ChapterFact }>;
      latestFinalizedChapter: number;
      detailLevel?: 'full' | 'summary' | 'brief';
    };
  },
): string {
  const sections: string[] = [];

  const soul = buildSoulContext(character);
  if (soul) sections.push(soul);

  if (options?.includeGrowth !== false) {
    const growth = buildGrowthContext(character);
    if (growth) sections.push(growth);
  }

  if (options?.snapshot) {
    const emotion = buildEmotionContext(options.snapshot);
    if (emotion) sections.push(emotion);
  }

  const opts = options ?? {};
  if (opts.includeKnowledgeBoundary !== false) {
    if (opts.knowledgeBoundary) {
      const kb = opts.knowledgeBoundary;
      const scope = buildKnowledgeScope(
        character,
        kb.events,
        kb.facts,
        kb.latestFinalizedChapter,
      );
      const fullBoundary = renderKnowledgeBoundaryPrompt({
        character,
        events: kb.events,
        scope,
        detailLevel: kb.detailLevel,
      });
      if (fullBoundary) sections.push(fullBoundary);
    } else {
      const boundary = buildKnowledgeBoundaryContext(character);
      if (boundary) sections.push(boundary);
    }
  }

  if (options?.readerRelationship) {
    const rel = buildRelationshipContext(character, options.readerRelationship);
    if (rel) sections.push(rel);
  }

  return sections.length > 0 ? sections.join('\n\n') : '';
}
