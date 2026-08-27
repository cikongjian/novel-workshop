import { http } from './http';

export type CangjieChecklistGroup =
  | 'premise'
  | 'protagonist'
  | 'world'
  | 'conflict'
  | 'relationship'
  | 'opening'
  | 'payoff'
  | 'boundary';

export const CANGJIE_CHECKLIST_GROUP_ORDER: CangjieChecklistGroup[] = [
  'premise',
  'protagonist',
  'world',
  'conflict',
  'relationship',
  'opening',
  'payoff',
  'boundary',
];

export const CANGJIE_CHECKLIST_GROUP_LABELS: Record<CangjieChecklistGroup, string> = {
  premise: '故事题眼',
  protagonist: '主角设定',
  world: '世界规则',
  conflict: '核心冲突',
  relationship: '关键关系',
  opening: '第一章开局',
  payoff: '爽点承诺',
  boundary: '禁写边界',
};

export type CangjieConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type CangjieChatMessage = CangjieConversationTurn & {
  id: string;
  createdAt: string;
};

export type CangjieChecklistItem = {
  id: string;
  group: CangjieChecklistGroup;
  title: string;
  content: string;
  selected: boolean;
};

export type CangjieSeedIdea = {
  title: string;
  synopsis: string;
  seedIdea: string;
  protagonist: string;
  world: string;
  conflict: string;
  opening: string;
  storyCoreBrief: string;
};

type CangjieChatResponse = {
  message: CangjieConversationTurn;
};

type CangjieOrganizeResponse = {
  checklist: CangjieChecklistItem[];
};

type CangjieSeedIdeaResponse = {
  idea: CangjieSeedIdea;
};

function toConversationPayload(messages: CangjieConversationTurn[]): CangjieConversationTurn[] {
  return messages
    .map(message => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter(message => Boolean(message.content));
}

export async function sendCangjieChat(messages: CangjieConversationTurn[]): Promise<CangjieConversationTurn> {
  const { data } = await http.post<CangjieChatResponse>('/fun/cangjie/chat', {
    messages: toConversationPayload(messages),
  });
  return data.message;
}

export async function organizeCangjieStory(messages: CangjieConversationTurn[]): Promise<CangjieChecklistItem[]> {
  const { data } = await http.post<CangjieOrganizeResponse>('/fun/cangjie/organize', {
    messages: toConversationPayload(messages),
  });
  return data.checklist;
}

export async function generateCangjieSeedIdea(
  messages: CangjieConversationTurn[],
  checklist: CangjieChecklistItem[],
): Promise<CangjieSeedIdea> {
  const { data } = await http.post<CangjieSeedIdeaResponse>('/fun/cangjie/seed-idea', {
    messages: toConversationPayload(messages),
    checklist,
  });
  return data.idea;
}
