import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/** 正文截断上限（字符），防止 token 超限 */
const CHAPTER_INPUT_MAX_CHARS = 2000;
/** 下章大纲提示截断上限 */
const NEXT_OUTLINE_MAX_CHARS = 200;
/** 已有条目展示上限 */
const EXISTING_NOTES_MAX_DISPLAY = 5;
/** 单条已有内容截断上限 */
const EXISTING_NOTE_TRUNCATE_CHARS = 150;

/** 7 种表达形态，与提示词中的编号一一对应 */
const EXPRESSION_FORMS = [
  { id: 1, name: '碎碎念', desc: '一段不分段的连续随想流，像刚写完激动地一口气打字' },
  { id: 2, name: '场内余波', desc: '围绕本章角色、物件或结果补一段故事内成立的短余波' },
  { id: 3, name: '自问自答', desc: '模拟读者提出尖锐问题，用故事内已有信息回应但藏一半' },
  { id: 4, name: '角色附身', desc: '用章节中某个角色的口吻写一段内心独白或吐槽' },
  { id: 5, name: '清单体', desc: '3-5 个简短条目，每条一个独立趣味点' },
  { id: 6, name: '短评体', desc: '极简风，仅 1-3 句话（50-120 字），最浓的情绪' },
  { id: 7, name: '书信体', desc: '像故事角色给追更读者写的一封短信，有称呼有落款' },
] as const;

/** 形态特征关键词，用于从已有条目中粗略识别使用过的形态 */
const FORM_SIGNATURES: Record<number, RegExp[]> = {
  4: [/（.*?的OS[：:]/, /（.*?内心独白[：:]/, /「.*?」.*?——.*?（角色/],
  5: [/^[·—\-•]/, /\n[·—\-•]/],
  6: [], // 短评体通过字数判断
  7: [/亲爱的/, /致.*?的你/, /此致/, /你的作者/, /——.*?留$/],
};

/**
 * 根据已有条目粗略识别可能使用过的形态 ID。
 * 这不需要 100% 精确，只是尽量避免连续重复。
 */
function detectUsedForms(existingNotes: string[]): Set<number> {
  const used = new Set<number>();
  for (const note of existingNotes) {
    // 短评体：字数很少
    if (note.length < 130) { used.add(6); continue; }
    // 通过特征正则匹配
    for (const [formId, patterns] of Object.entries(FORM_SIGNATURES)) {
      if (patterns.some(re => re.test(note))) {
        used.add(Number(formId));
      }
    }
  }
  return used;
}

/**
 * 从可选形态中随机选一个。排除已识别使用过的形态。
 * 如果全部被排除，则从全量中随机选。
 */
function pickExpressionForm(existingNotes?: string[]): typeof EXPRESSION_FORMS[number] {
  let candidates = [...EXPRESSION_FORMS];

  if (existingNotes?.length) {
    const usedIds = detectUsedForms(existingNotes);
    const filtered = candidates.filter(f => !usedIds.has(f.id));
    if (filtered.length > 0) candidates = filtered;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 作者有话说 Agent
 * 为章节末尾生成"作者有话说"互动内容，
 * 通过随机表达形态确保每次生成结构上的多样性。
 */
export class AuthorNoteWriterAgent extends BaseAgent {
  readonly role = 'author-note-writer' as const;
  readonly name = '作者有话说助手';
  readonly description = '为章节末尾生成作者有话说互动内容，模拟真人作者与读者交流';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.85, maxTokens: 1024 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    // 先选定本次的表达形态
    const form = pickExpressionForm(context.existingAuthorNotes);

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push('## 当前章节');
      parts.push(`第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.inputText) {
      const truncated = context.inputText.length > CHAPTER_INPUT_MAX_CHARS
        ? context.inputText.slice(0, CHAPTER_INPUT_MAX_CHARS) + '…（正文截断）'
        : context.inputText;
      parts.push('## 本章正文');
      parts.push(truncated);
      parts.push('');
    }

    if (context.outlineContext) {
      const hint = context.outlineContext.length > NEXT_OUTLINE_MAX_CHARS
        ? context.outlineContext.slice(0, NEXT_OUTLINE_MAX_CHARS) + '…'
        : context.outlineContext;
      parts.push('## 下一章大纲提示（可用于悬念预告）');
      parts.push(hint);
      parts.push('');
    }

    if (context.chapterKeyType && context.chapterKeyType !== 'normal') {
      parts.push('## 章节类型');
      parts.push(`本章被判定为：${context.chapterKeyType}`);
      parts.push('请根据"章节类型加成"调整内容侧重。');
      parts.push('');
    }

    // ★ 本次指定形态 — 放在已有条目之前，确保 LLM 优先读到
    parts.push('## ⚡ 本次指定形态（必须严格遵循！）');
    parts.push(`形态：${form.name}`);
    parts.push(`要求：${form.desc}`);
    parts.push('你必须使用此形态的结构来写本次"作者有话说"，不可退化为通用三段式。');
    parts.push('');

    if (context.existingAuthorNotes?.length) {
      const recent = context.existingAuthorNotes.slice(-EXISTING_NOTES_MAX_DISPLAY);
      parts.push(`## 已有的作者有话说（共 ${context.existingAuthorNotes.length} 条，展示最近 ${recent.length} 条）`);
      parts.push('⚠️ 你必须避免与以下已有内容在形态、素材、角度上雷同：');
      recent.forEach((note, i) => {
        const truncated = note.length > EXISTING_NOTE_TRUNCATE_CHARS
          ? note.slice(0, EXISTING_NOTE_TRUNCATE_CHARS) + '…'
          : note;
        parts.push(`[${i + 1}] ${truncated}`);
      });
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 用户指示（务必优先遵循）');
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push(`请使用"${form.name}"形态，直接输出"作者有话说"的正文内容（纯文本）。`);
    return parts.join('\n');
  }
}
