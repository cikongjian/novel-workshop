import type {
  CharacterProfile,
  NovelMetadata,
  OutlineData,
} from '../../../../novel/types.js';
import {
  DEFAULT_COVER_SIZE,
  GENRE_PRESETS,
  buildDefaultNegativePrompt,
  type CoverPromptPayload,
} from './prompt-types.js';
import type { CoverStyleOverrides } from './cover-style-options.js';
import {
  findCoverEra,
  findCoverFormat,
  findCoverMood,
  findCoverVisualStyle,
} from './cover-style-options.js';

export function clipCoverText(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function stringifyRole(role: CharacterProfile['role']): string {
  switch (role) {
    case 'protagonist':
      return '主角';
    case 'deuteragonist':
      return '副主角';
    case 'antagonist':
      return '反派';
    case 'rival':
      return '宿敌';
    case 'love_interest':
      return '感情线';
    case 'mentor':
      return '导师';
    case 'ally':
      return '盟友';
    case 'faction_leader':
      return '势力核心';
    case 'supporting':
      return '配角';
    case 'family':
      return '亲友';
    case 'comic_relief':
      return '气氛担当';
    case 'minor':
      return '路人';
    default:
      return '次要角色';
  }
}

export function pickLeadCharacters(characters: CharacterProfile[]): CharacterProfile[] {
  const roleRank: Record<CharacterProfile['role'], number> = {
    protagonist: 0,
    deuteragonist: 1,
    antagonist: 2,
    rival: 3,
    love_interest: 4,
    mentor: 5,
    ally: 6,
    faction_leader: 7,
    supporting: 8,
    family: 9,
    comic_relief: 10,
    minor: 11,
  };
  return [...characters]
    .sort((a, b) => {
      const roleDiff = roleRank[a.role] - roleRank[b.role];
      if (roleDiff !== 0) return roleDiff;
      return (a.firstAppearance ?? Number.MAX_SAFE_INTEGER) - (b.firstAppearance ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 3);
}

export function buildCharacterSummary(characters: CharacterProfile[]): string {
  const leads = pickLeadCharacters(characters);
  if (leads.length === 0) return '暂无命名角色。';
  return leads
    .map((char) => {
      const descriptors = [
        stringifyRole(char.role),
        clipCoverText(char.position, 20),
        clipCoverText(char.appearance, 42),
        clipCoverText(char.personality || char.motivation || char.arc, 36),
      ].filter(Boolean);
      return `${char.name}：${descriptors.join('，')}`;
    })
    .join(' | ');
}

export function buildOutlineSummary(outline?: OutlineData): string {
  if (!outline) return '';
  const chapterSummaries = outline.chapters
    .slice(0, 3)
    .map(chapter => clipCoverText(chapter.summary || chapter.title, 60))
    .filter(Boolean);
  const threadSummaries = outline.plotThreads
    .slice(0, 3)
    .map(thread => clipCoverText(thread.description || thread.name, 48))
    .filter(Boolean);
  return [...chapterSummaries, ...threadSummaries].slice(0, 4).join(' | ');
}

export function buildCoverContextSummary(
  novel: NovelMetadata,
  characters: CharacterProfile[],
  outline?: OutlineData,
): string {
  const parts = [
    `题材：${GENRE_PRESETS[novel.genre].genreLabel}`,
    novel.tags?.length ? `标签：${novel.tags.slice(0, 4).join(' / ')}` : '',
    novel.synopsis?.trim() ? `简介：${clipCoverText(novel.synopsis, 90)}` : '',
    novel.description?.trim() ? `补充：${clipCoverText(novel.description, 70)}` : '',
    characters.length ? `角色：${pickLeadCharacters(characters).map(char => char.name).join('、')}` : '',
    outline ? `情节：${clipCoverText(buildOutlineSummary(outline), 90)}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export function buildCoverPromptUserMessage(
  novel: NovelMetadata,
  characters: CharacterProfile[],
  outline?: OutlineData,
  generateText?: boolean,
  authorName?: string,
  overrides?: CoverStyleOverrides,
): string {
  const preset = GENRE_PRESETS[novel.genre];
  const leadCharacters = buildCharacterSummary(characters);
  const outlineSummary = buildOutlineSummary(outline);
  const tags = novel.tags?.slice(0, 6).join(', ') || 'none';

  const textConstraint = generateText
    ? `请在画面中直接渲染标题文字"${novel.title}"和作者"${authorName || '无名'}"，文字应为风格化排版并自然融入封面设计。`
    : '重要约束：上方三分之一留出干净的标题安全区，画面中不要出现任何文字。';

  const eraInfo = overrides?.eraKey ? findCoverEra(overrides.eraKey) : null;
  const formatInfo = overrides?.formatKey ? findCoverFormat(overrides.formatKey) : null;
  const moodInfo = overrides?.moodKey ? findCoverMood(overrides.moodKey) : null;
  const styleInfo = overrides?.visualStyleKey ? findCoverVisualStyle(overrides.visualStyleKey) : null;

  const extraLines = [
    eraInfo ? `时代背景：${eraInfo.prompt}` : '',
    styleInfo ? `视觉风格：${styleInfo.anchor}` : '',
    formatInfo ? `构图要求：${formatInfo.anchor}` : '',
    moodInfo ? `色调情绪：${moodInfo.palette}` : '',
  ].filter(Boolean);

  return [
    `书名：${novel.title}`,
    `题材：${preset.genreLabel}`,
    `标签：${tags}`,
    `简介：${clipCoverText(novel.synopsis, 600) || '无'}`,
    `补充描述：${clipCoverText(novel.description, 400) || '无'}`,
    `主要角色：${leadCharacters}`,
    `情节重点：${outlineSummary || '无'}`,
    ...extraLines,
    '需要一段竖版封面 AI 插图提示词。',
    '目标：可读性强的商业网文/书籍封面。',
    textConstraint,
  ].join('\n');
}

export function buildTemplateCoverPrompt(
  novel: NovelMetadata,
  characters: CharacterProfile[],
  outline?: OutlineData,
  generateText?: boolean,
  authorName?: string,
  overrides?: CoverStyleOverrides,
): CoverPromptPayload {
  const preset = GENRE_PRESETS[novel.genre];
  const leadCharacters = pickLeadCharacters(characters);
  const leadCharacterText = leadCharacters.length > 0
    ? leadCharacters
      .map(char => [char.name, clipCoverText(char.appearance, 48), clipCoverText(char.personality || char.motivation || char.arc, 30)]
        .filter(Boolean)
        .join('，'))
      .join('；')
    : '一个与故事紧密相关的标志性角色形象';
  const synopsisText = clipCoverText(novel.synopsis || novel.description, 220);
  const outlineText = clipCoverText(buildOutlineSummary(outline), 160);

  const textInstruction = generateText
    ? `画面中渲染风格化标题文字"${novel.title}"和作者"${authorName || '无名'}"`
    : '上方三分之一标题安全区，画面中不出现文字';

  // 应用维度覆盖
  const visualStyle = overrides?.visualStyleKey
    ? findCoverVisualStyle(overrides.visualStyleKey)?.anchor ?? preset.visualStyle
    : preset.visualStyle;
  const palette = overrides?.moodKey
    ? findCoverMood(overrides.moodKey)?.palette ?? preset.palette
    : preset.palette;

  const eraInfo = overrides?.eraKey ? findCoverEra(overrides.eraKey) : null;
  const formatInfo = overrides?.formatKey ? findCoverFormat(overrides.formatKey) : null;

  const positivePrompt = [
    `${preset.genreLabel} 小说封面插画`,
    visualStyle,
    formatInfo?.anchor ?? '竖版 2:3 构图',
    '精品网文封面',
    textInstruction,
    '单一视觉焦点',
    `主要角色：${leadCharacterText}`,
    synopsisText ? `故事梗概：${synopsisText}` : '',
    outlineText ? `情节冲突：${outlineText}` : '',
    `象征物：${preset.motif}`,
    `配色方案：${palette}`,
    `光影：${preset.lighting}`,
    eraInfo ? `时代氛围：${eraInfo.prompt}` : '',
    '高细节、电影级氛围、清晰轮廓、精致绘画',
  ].filter(Boolean).join('，');

  return {
    positivePrompt,
    negativePrompt: buildDefaultNegativePrompt(generateText).join(', '),
    promptSource: 'template',
    contextSummary: buildCoverContextSummary(novel, characters, outline),
    recommendedSize: DEFAULT_COVER_SIZE,
  };
}

export function composeCoverPromptBlock(positivePrompt: string, negativePrompt: string): string {
  return `Positive: ${positivePrompt.trim()}\nNegative: ${negativePrompt.trim()}`;
}

export function parseCoverPromptBlock(rawPrompt: string): { positivePrompt: string; negativePrompt: string } {
  const trimmed = rawPrompt.trim();
  const positiveMatch = trimmed.match(/positive\s*:\s*([\s\S]*?)(?:\n+\s*negative\s*:|$)/i);
  const negativeMatch = trimmed.match(/negative\s*:\s*([\s\S]*)$/i);
  if (positiveMatch) {
    return {
      positivePrompt: positiveMatch[1]?.trim() ?? '',
      negativePrompt: negativeMatch?.[1]?.trim() ?? '',
    };
  }
  return {
    positivePrompt: trimmed,
    negativePrompt: '',
  };
}
