/**
 * 角色朋友圈 composable — 管理动态流/点赞/评论/生成状态
 */
import { ref, type Ref } from 'vue';
import {
  fetchMoments,
  toggleMomentLike,
  postMomentComment,
  mentionCharacter,
  generateMoment,
  type CharacterMoment,
  type MomentComment,
  type MomentType,
} from '../api/character-moments';

export function useCharacterMoments() {
  /** 朋友圈动态流 */
  const moments = ref<CharacterMoment[]>([]) as Ref<CharacterMoment[]>;
  const loading = ref(false);
  const generating = ref(false);
  const hasMore = ref(false);
  const hotMoment = ref<CharacterMoment | null>(null);
  const error = ref('');

  /** 加载朋友圈流 */
  async function load(novelId: string, before?: number) {
    loading.value = true;
    error.value = '';
    try {
      const res = await fetchMoments(novelId, { limit: 20, before });
      if (before) {
        moments.value.push(...res.moments);
      } else {
        moments.value = res.moments;
        hotMoment.value = res.hotMoment;
      }
      hasMore.value = res.hasMore;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '加载失败';
      moments.value = [];
    } finally {
      loading.value = false;
    }
  }

  /** 加载更多（分页） */
  async function loadMore(novelId: string) {
    if (!hasMore.value || moments.value.length === 0) return;
    const last = moments.value[moments.value.length - 1];
    await load(novelId, last.createdAt);
  }

  /** 点赞 toggle */
  async function like(momentId: string) {
    try {
      const res = await toggleMomentLike(momentId);
      const moment = moments.value.find((m) => m.id === momentId);
      if (moment) {
        moment.likes = res.likes;
      }
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '操作失败';
      return null;
    }
  }

  /** 读者评论 */
  async function comment(momentId: string, content: string): Promise<MomentComment | null> {
    try {
      const c = await postMomentComment(momentId, content);
      const moment = moments.value.find((m) => m.id === momentId);
      if (moment) moment.comments.push(c);
      return c;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '评论失败';
      return null;
    }
  }

  /** @某角色回应 */
  async function mention(momentId: string, characterId: string): Promise<MomentComment | null> {
    try {
      const c = await mentionCharacter(momentId, characterId);
      const moment = moments.value.find((m) => m.id === momentId);
      if (moment) moment.comments.push(c);
      return c;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '召唤失败';
      return null;
    }
  }

  /** 作者触发生成动态（可选带互评） */
  async function generate(params: {
    novelId: string;
    characterId: string;
    type: MomentType;
    relatedChapterNum?: number;
    withComments?: boolean;
  }): Promise<CharacterMoment | null> {
    generating.value = true;
    error.value = '';
    try {
      const res = await generateMoment(params);
      moments.value.unshift(res.moment);
      return res.moment;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '生成失败';
      return null;
    } finally {
      generating.value = false;
    }
  }

  return {
    moments,
    loading,
    generating,
    hasMore,
    hotMoment,
    error,
    load,
    loadMore,
    like,
    comment,
    mention,
    generate,
  };
}
