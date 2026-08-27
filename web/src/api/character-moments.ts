/**
 * 角色朋友圈 API
 */
import { http } from './http';

/** 动态类型 */
export type MomentType = 'mood' | 'plot' | 'daily' | 'dream' | 'reveal' | 'night' | 'challenge';

/** 评论作者类型 */
export type CommentAuthorType = 'character' | 'reader';

/** 单条评论 */
export interface MomentComment {
  id: string;
  authorType: CommentAuthorType;
  authorId: string;
  authorName: string;
  content: string;
  likes: number;
  createdAt: number;
}

/** 单条朋友圈动态 */
export interface CharacterMoment {
  id: string;
  novelId: string;
  novelTitle: string;
  characterId: string;
  characterName: string;
  characterRole: string;
  type: MomentType;
  content: string;
  mood?: string;
  relatedChapterNum?: number;
  imageUrl?: string;
  /** 是否私密动态（仅收藏该角色的读者可见） */
  isPrivate?: boolean;
  likes: number;
  likedBy: string[];
  flowers?: number;
  floweredBy?: string[];
  comments: MomentComment[];
  createdAt: number;
}

/** 获取朋友圈流 */
export async function fetchMoments(
  novelId: string,
  options?: { limit?: number; before?: number },
): Promise<{ moments: CharacterMoment[]; hasMore: boolean; hotMoment: CharacterMoment | null }> {
  const res = await http.get('/character-moments', {
    params: {
      novelId,
      limit: options?.limit,
      before: options?.before,
    },
  });
  return res.data;
}

/** 获取单条动态 */
export async function fetchMoment(momentId: string): Promise<CharacterMoment> {
  const res = await http.get(`/character-moments/${momentId}`);
  return res.data.moment;
}

/** 点赞 toggle */
export async function toggleMomentLike(
  momentId: string,
): Promise<{ liked: boolean; likes: number }> {
  const res = await http.post(`/character-moments/${momentId}/like`);
  return res.data;
}

/** 读者评论 */
export async function postMomentComment(
  momentId: string,
  content: string,
): Promise<MomentComment> {
  const res = await http.post(`/character-moments/${momentId}/comments`, { content });
  return res.data.comment;
}

/** @某角色回应 */
export async function mentionCharacter(
  momentId: string,
  characterId: string,
): Promise<MomentComment> {
  const res = await http.post(`/character-moments/${momentId}/mention/${characterId}`);
  return res.data.comment;
}

/** 作者手动触发生成 */
export async function generateMoment(params: {
  novelId: string;
  characterId: string;
  type: MomentType;
  relatedChapterNum?: number;
  withComments?: boolean;
}): Promise<{ moment: CharacterMoment; commentsGenerated: number }> {
  const res = await http.post('/character-moments/generate', params);
  return res.data;
}

/** 作者禁言读者 */
export async function muteReader(novelId: string, targetUserId: string): Promise<void> {
  await http.post('/character-moments/mute', { novelId, targetUserId });
}

/** 作者解除禁言 */
export async function unmuteReader(novelId: string, targetUserId: string): Promise<void> {
  await http.delete('/character-moments/mute/' + targetUserId, { params: { novelId } });
}

/** 获取禁言列表 */
export async function fetchMutedReaders(novelId: string): Promise<string[]> {
  const { data } = await http.get('/character-moments/muted', { params: { novelId } });
  return data.mutedUserIds ?? [];
}

/** 举报评论 */
export async function reportMomentComment(params: {
  momentId: string;
  commentId: string;
  reason?: string;
}): Promise<void> {
  await http.post(`/character-moments/${params.momentId}/comments/${params.commentId}/report`, { reason: params.reason });
}

/** 作者删除评论 */
export async function deleteMomentComment(momentId: string, commentId: string): Promise<void> {
  await http.delete(`/character-moments/${momentId}/comments/${commentId}`);
}

/** 送花 toggle */
export async function toggleMomentFlower(momentId: string): Promise<{ flowered: boolean; flowers: number }> {
  const { data } = await http.post(`/character-moments/${momentId}/flower`);
  return data;
}
