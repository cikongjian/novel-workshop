/**
 * 统一消息中心 API
 */
import { http } from './http';

export type UnifiedMessageType = 'character_letter' | 'side_story_recommend' | 'update_reminder' | 'character_outreach' | 'comic_published' | 'system';

export interface UnifiedMessage {
  id: string;
  userId: string;
  type: UnifiedMessageType;
  conversationId: string;
  conversationName: string;
  conversationAvatar?: string;
  title: string;
  body: string;
  data?: {
    novelId?: string;
    characterId?: string;
    chapterNumber?: number;
    sideStoryId?: string;
    letterId?: string;
    route?: string;
    actionLabel?: string;
  };
  read: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  conversationId: string;
  conversationName: string;
  conversationAvatar?: string;
  lastMessage: Pick<UnifiedMessage, 'id' | 'type' | 'title' | 'createdAt' | 'data'>;
  unreadCount: number;
  lastTime: string;
}

/** 获取会话列表 */
export async function fetchConversations(): Promise<{ conversations: ConversationSummary[]; totalUnread: number }> {
  const res = await http.get('/unified-messages/conversations');
  return res.data;
}

/** 获取某会话所有消息 */
export async function fetchConversationMessages(conversationId: string): Promise<{ messages: UnifiedMessage[] }> {
  const res = await http.get(`/unified-messages/conversation/${conversationId}`);
  return res.data;
}

/** 获取未读数 */
export async function fetchUnreadCount(): Promise<number> {
  const res = await http.get('/unified-messages/unread-count');
  return res.data.count ?? 0;
}

/** 标记单条已读 */
export async function markRead(messageId: string): Promise<void> {
  await http.post(`/unified-messages/read/${messageId}`);
}

/** 标记会话已读 */
export async function markConversationRead(conversationId: string): Promise<void> {
  await http.post(`/unified-messages/read-conversation/${conversationId}`);
}

/** 全部已读 */
export async function markAllRead(): Promise<void> {
  await http.post('/unified-messages/read-all');
}

/** 删除单条消息 */
export async function deleteMessage(messageId: string): Promise<void> {
  await http.delete(`/unified-messages/${messageId}`);
}

/** 批量删除消息 */
export async function batchDeleteMessages(messageIds: string[]): Promise<{ deleted: number }> {
  const res = await http.post('/unified-messages/delete-batch', { ids: messageIds });
  return res.data;
}

/** 触发搭话检查 */
export async function checkOutreach(params: {
  novelId: string;
  currentChapterNumber?: number;
  currentChapterTitle?: string;
  scenario: 'chapter_milestone' | 'daily_greeting' | 'inactive_reminder' | 'new_side_story';
}): Promise<{ triggered: number }> {
  const res = await http.post('/unified-messages/outreach/check', params);
  return res.data;
}
