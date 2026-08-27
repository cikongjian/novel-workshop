/**
 * 剧情投票 composable
 */
import { ref, type Ref } from 'vue';
import {
  fetchVoteByChapter,
  fetchVotesByNovel,
  createVotePoint,
  updateVotePoint,
  deleteVotePoint,
  closeVotePoint,
  adoptVotePoint,
  castVote,
  type VotePointWithStats,
  type VotePoint,
} from '../api/plot-votes';

export function usePlotVote() {
  const currentVote = ref<VotePointWithStats | null>(null) as Ref<VotePointWithStats | null>;
  const voteList = ref<VotePointWithStats[]>([]) as Ref<VotePointWithStats[]>;
  const loading = ref(false);
  const voting = ref(false);
  const saving = ref(false);
  const error = ref('');

  async function loadByChapter(novelId: string, chapterId: string) {
    loading.value = true;
    error.value = '';
    try {
      currentVote.value = await fetchVoteByChapter(novelId, chapterId);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '加载投票失败';
      currentVote.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function loadByNovel(novelId: string) {
    loading.value = true;
    error.value = '';
    try {
      voteList.value = await fetchVotesByNovel(novelId);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '加载投票列表失败';
      voteList.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function create(params: {
    novelId: string;
    chapterId: string;
    question: string;
    options: string[];
    deadlineHours: number;
  }): Promise<VotePoint | null> {
    saving.value = true;
    error.value = '';
    try {
      return await createVotePoint(params);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '创建投票失败';
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function update(
    id: string,
    updates: { question?: string; options?: string[]; deadlineHours?: number },
  ): Promise<VotePoint | null> {
    saving.value = true;
    error.value = '';
    try {
      return await updateVotePoint(id, updates);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '更新投票失败';
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await deleteVotePoint(id);
      return true;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '删除投票失败';
      return false;
    }
  }

  async function close(id: string): Promise<VotePoint | null> {
    try {
      return await closeVotePoint(id);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '关闭投票失败';
      return null;
    }
  }

  async function adopt(id: string, adopted: boolean): Promise<VotePoint | null> {
    try {
      return await adoptVotePoint(id, adopted);
    } catch (err: any) {
      error.value = err?.response?.data?.error || '操作失败';
      return null;
    }
  }

  async function vote(votePointId: string, optionId: string): Promise<boolean> {
    voting.value = true;
    error.value = '';
    try {
      await castVote(votePointId, optionId);
      return true;
    } catch (err: any) {
      error.value = err?.response?.data?.error || '投票失败';
      return false;
    } finally {
      voting.value = false;
    }
  }

  return {
    currentVote,
    voteList,
    loading,
    voting,
    saving,
    error,
    loadByChapter,
    loadByNovel,
    create,
    update,
    remove,
    close,
    adopt,
    vote,
  };
}
