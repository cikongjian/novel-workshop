import {
  CangjieChecklistItemSchema,
  CangjieSeedIdeaCardSchema,
  type CangjieChecklistDraftItem,
  type CangjieChecklistGroup,
  type CangjieChecklistItem,
  type CangjieConversationTurn,
  type CangjieSeedIdeaCard,
} from './cangjie-schemas.js';

const TITLE_KEYWORD_PAIRS = [
  ['直播', '社死'],
  ['直播', '翻车'],
  ['娱乐圈', '逆袭'],
  ['娱乐圈', '社死'],
  ['退婚', '打脸'],
  ['重生', '复仇'],
  ['穿书', '改命'],
  ['系统', '逆袭'],
  ['修仙', '飞升'],
  ['末世', '求生'],
  ['豪门', '翻身'],
  ['校园', '暗恋'],
  ['权谋', '夺位'],
  ['星际', '逃亡'],
  ['悬疑', '追凶'],
  ['猫', '奇缘'],
  ['妖', '奇缘'],
] as const;

const SINGLE_TITLE_KEYWORDS = [
  '系统',
  '直播',
  '退婚',
  '重生',
  '穿书',
  '娱乐圈',
  '豪门',
  '修仙',
  '末世',
  '星际',
  '校园',
  '权谋',
  '悬疑',
  '猫',
  '妖',
  '副本',
  '游戏',
  '婚',
  '离婚',
  '破局',
  '翻身',
] as const;

function stripWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function trimText(value: string, maxLength: number): string {
  return stripWhitespace(value).slice(0, maxLength);
}

export function extractJsonObject(text: string): unknown | null {
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

export function normalizeConversation(messages: CangjieConversationTurn[], limit = 24): CangjieConversationTurn[] {
  return messages
    .slice(-limit)
    .map(message => ({
      role: message.role,
      content: trimText(message.content, 1000),
    }))
    .filter(message => Boolean(message.content));
}

export function conversationTranscript(messages: CangjieConversationTurn[], limit = 24): string {
  const sliced = normalizeConversation(messages, limit);
  if (sliced.length === 0) return '';
  return sliced.map(message => `${message.role === 'user' ? '用户' : 'AI'}：${message.content}`).join('\n');
}

export function latestUserMessage(messages: CangjieConversationTurn[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && message.content.trim()) {
      return trimText(message.content, 240);
    }
  }
  return '';
}

function userMessages(messages: CangjieConversationTurn[]): string[] {
  return messages
    .filter(message => message.role === 'user')
    .map(message => trimText(message.content, 240))
    .filter(Boolean);
}

function firstMatchingMessage(messages: CangjieConversationTurn[], patterns: RegExp[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    if (!patterns.some(pattern => pattern.test(message.content))) continue;
    return trimText(message.content, 160);
  }
  return '';
}

function collectConversationKernel(messages: CangjieConversationTurn[]): string {
  const lines = userMessages(messages);
  if (lines.length === 0) return '';
  return trimText(lines.slice(0, 3).join('；'), 180);
}

function buildChecklistItem(
  group: CangjieChecklistGroup,
  title: string,
  content: string,
  index: number,
): CangjieChecklistItem {
  return CangjieChecklistItemSchema.parse({
    id: `${group}-${index + 1}`,
    group,
    title: trimText(title, 24),
    content: trimText(content, 180),
    selected: true,
  });
}

function fallbackTitleFromText(text: string): string {
  const cleaned = stripWhitespace(text);
  for (const [left, right] of TITLE_KEYWORD_PAIRS) {
    if (cleaned.includes(left) && cleaned.includes(right)) {
      return trimText(`${left}${right}`, 16);
    }
  }
  for (const keyword of SINGLE_TITLE_KEYWORDS) {
    if (cleaned.includes(keyword)) {
      return trimText(`${keyword}故事`, 16);
    }
  }
  const compact = cleaned.replace(/[，。！？、；：]/g, '');
  if (!compact) return '故事开书';
  return trimText(`${compact.slice(0, 6)}开书`, 16);
}

export function buildFallbackOpeningReply(messages: CangjieConversationTurn[]): string {
  const latest = latestUserMessage(messages);
  if (!latest) {
    return '把你脑子里最亮的那一幕先丢给我。你可以直接说主角、冲突，或者只给一个开局场面。';
  }
  if (/(先别问|别追问|你先帮我想|先帮我想|帮我想)/.test(latest)) {
    return '好，我先给你铺方向。你继续补一个主角身份，或者直接丢第一章场面，我来往下接。';
  }
  if (/(差不多|整理一下|整理|收口|进入整理)/.test(latest)) {
    return '行，我开始收口。再补一条最关键的冲突或第一章画面，就能进入整理。';
  }
  return `我抓到的主线是：${trimText(latest, 90)}。现在最值得先定的是主角目标、第一重冲突和开局画面。`;
}

export function buildFallbackChecklist(messages: CangjieConversationTurn[]): CangjieChecklistItem[] {
  const kernel = collectConversationKernel(messages);
  const latest = latestUserMessage(messages) || kernel || '先把故事核心定下来';
  const opening = firstMatchingMessage(messages, [/开局/, /第一章/, /开场/, /一上来/, /场面/, /现场/]) || latest;
  const conflict = firstMatchingMessage(messages, [/冲突/, /对抗/, /阻碍/, /矛盾/, /敌人/, /反派/]) || latest;
  const world = firstMatchingMessage(messages, [/世界/, /设定/, /背景/, /规则/, /体系/, /行业/, /赛道/]) || latest;
  const relationship = firstMatchingMessage(messages, [/关系/, /恋人/, /搭档/, /盟友/, /朋友/, /仇/, /老师/, /队友/]) || latest;
  const payoff = firstMatchingMessage(messages, [/爽点/, /打脸/, /逆袭/, /反转/, /高光/, /回报/, /兑现/]) || '前三章必须至少兑现一次读者期待的爽点。';
  const boundary = firstMatchingMessage(messages, [/不要/, /别/, /不想/, /拒绝/, /避开/, /不能/]);

  const items: CangjieChecklistItem[] = [
    buildChecklistItem('premise', '故事题眼', kernel ? `把这段对话收束成一个核心故事核：${kernel}` : '先把故事最想讲的那件事定下来。', 0),
    buildChecklistItem('protagonist', '主角设定', `主角要围着当前想法行动：${trimText(latest, 120)}`, 1),
    buildChecklistItem('world', '世界规则', `世界规则要能直接推动剧情：${trimText(world, 120)}`, 2),
    buildChecklistItem('conflict', '核心冲突', `主角的目标必须被一个明确阻碍压住：${trimText(conflict, 120)}`, 3),
    buildChecklistItem('relationship', '关键关系', `至少保留一条能推动剧情的关系线：${trimText(relationship, 120)}`, 4),
    buildChecklistItem('opening', '第一章开局', `第一章从最能抓人的画面切入：${trimText(opening, 120)}`, 5),
    buildChecklistItem('payoff', '爽点承诺', `前三章必须给出明确回报：${trimText(payoff, 120)}`, 6),
  ];

  if (boundary) {
    items.push(buildChecklistItem('boundary', '禁写边界', `避免写成：${trimText(boundary, 120)}`, 7));
  }

  return items;
}

export function normalizeChecklistDraft(items: CangjieChecklistDraftItem[]): CangjieChecklistItem[] {
  const counts = new Map<CangjieChecklistGroup, number>();
  return items
    .map((item) => {
      const count = (counts.get(item.group) ?? 0) + 1;
      counts.set(item.group, count);
      return CangjieChecklistItemSchema.parse({
        id: item.id?.trim() || `${item.group}-${count}`,
        group: item.group,
        title: trimText(item.title, 24),
        content: trimText(item.content, 180),
        selected: item.selected !== false,
      });
    })
    .filter(item => Boolean(item.title && item.content));
}

export function buildFallbackSeedIdea(
  messages: CangjieConversationTurn[],
  checklist: CangjieChecklistItem[],
): CangjieSeedIdeaCard {
  const effective = checklist.length > 0 ? checklist.filter(item => item.selected) : checklist;
  const activeItems = effective.length > 0 ? effective : checklist;
  const get = (group: CangjieChecklistGroup): string =>
    activeItems.find(item => item.group === group)?.content
    || checklist.find(item => item.group === group)?.content
    || '';

  const premise = get('premise') || collectConversationKernel(messages) || '先把故事核心定下来';
  const protagonist = get('protagonist') || '主角必须有明确身份、欲望和行动方式。';
  const world = get('world') || '世界规则要服务剧情推进，而不是只做背景说明。';
  const conflict = get('conflict') || '主角需要被一个足够具体的阻碍压住。';
  const opening = get('opening') || '第一章从高压场面或强钩子切入。';
  const payoff = get('payoff') || '前三章必须有明确爽点回报。';
  const boundary = get('boundary');

  const title = fallbackTitleFromText([
    premise,
    protagonist,
    world,
    conflict,
    opening,
  ].join(' '));

  const synopsis = trimText([
    `${title}讲的是${premise}`,
    `主角${protagonist}`,
    `故事里${world}`,
    `核心冲突是${conflict}`,
    `开局从${opening}展开`,
  ].join('。'), 180) || `${title}讲的是${premise}`;

  const seedIdea = trimText([
    premise,
    protagonist,
    world,
    conflict,
    opening,
    payoff,
    boundary ? `禁写边界：${boundary}` : '',
  ].filter(Boolean).join('；'), 220) || `${title}，围绕${premise}展开。`;

  const storyCoreBrief = trimText([
    `用户想把故事写成${premise}`,
    `主角必须围绕${protagonist}推进`,
    `开局要先兑现${opening}`,
    `前三章必须落地${payoff}`,
  ].join('；'), 180);

  return CangjieSeedIdeaCardSchema.parse({
    title,
    synopsis,
    seedIdea,
    protagonist,
    world,
    conflict,
    opening,
    storyCoreBrief,
  });
}
