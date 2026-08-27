/**
 * 角色朋友圈类型定义
 */

/** 朋友圈动态类型 */
export type MomentType = 'mood' | 'plot' | 'daily' | 'dream' | 'reveal' | 'night' | 'challenge';

/** 朋友圈评论作者类型 */
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
  /** 心情标签，如「怅然」「得意」 */
  mood?: string;
  /** plot 类型关联的已发布章节号 */
  relatedChapterNum?: number;
  /** 可选配图路径 */
  imageUrl?: string;
  /** 是否私密动态（仅收藏该角色的读者可见，用于卡牌收集联动） */
  isPrivate?: boolean;
  likes: number;
  likedBy: string[];
  /** 读者送花 */
  flowers?: number;
  floweredBy?: string[];
  comments: MomentComment[];
  createdAt: number;
}

/** 存储结构 */
export interface MomentStore {
  moments: CharacterMoment[];
}
