/**
 * AI 番外生成逻辑封装
 */
import { ref } from 'vue';
import {
  fetchSideStories,
  fetchSideStory,
  reviewSideStory,
  toggleSideStoryLike,
  deleteSideStory,
  generateSideStoryStream,
  type SideStory,
  type SideStorySceneType,
  type SideStoryStatus,
} from '../api/side-stories';

export function useSideStory() {
  const stories = ref<SideStory[]>([]);
  const currentStory = ref<SideStory | null>(null);
  const loading = ref(false);
  const generating = ref(false);
  const streamingContent = ref('');
  const error = ref<string | null>(null);

  /** 加载列表 */
  async function loadStories(novelId: string) {
    loading.value = true;
    error.value = null;
    try {
      stories.value = await fetchSideStories(novelId);
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败';
    } finally {
      loading.value = false;
    }
  }

  /** 加载详情 */
  async function loadStory(id: string) {
    loading.value = true;
    try {
      currentStory.value = await fetchSideStory(id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败';
    } finally {
      loading.value = false;
    }
  }

  /** 生成番外 */
  async function generate(params: {
    novelId: string;
    characterIds: string[];
    sceneType: SideStorySceneType;
    customScene?: string;
    wordCount?: number;
  }) {
    generating.value = true;
    streamingContent.value = '';
    error.value = null;

    try {
      await generateSideStoryStream(params, {
        onChunk: (chunk) => {
          streamingContent.value += chunk;
        },
        onDone: (storyId, title, status) => {
          // 生成完成，刷新列表
          void loadStories(params.novelId);
          streamingContent.value = '';
        },
        onError: (msg) => {
          error.value = msg;
          streamingContent.value = '';
        },
      });
    } finally {
      generating.value = false;
    }
  }

  /** 审核 */
  async function review(id: string, status: SideStoryStatus) {
    try {
      const updated = await reviewSideStory(id, status);
      const idx = stories.value.findIndex((s) => s.id === id);
      if (idx >= 0) stories.value[idx] = updated;
      return updated;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '审核失败';
      return null;
    }
  }

  /** 点赞 */
  async function like(id: string) {
    try {
      const result = await toggleSideStoryLike(id);
      const story = stories.value.find((s) => s.id === id);
      if (story) {
        // 更新点赞数（likes 数组长度）
        story.likes = result.liked
          ? [...story.likes, 'me']
          : story.likes.slice(0, -1);
      }
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '点赞失败';
      return null;
    }
  }

  /** 删除 */
  async function remove(id: string) {
    try {
      await deleteSideStory(id);
      stories.value = stories.value.filter((s) => s.id !== id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除失败';
    }
  }

  function reset() {
    stories.value = [];
    currentStory.value = null;
    loading.value = false;
    generating.value = false;
    streamingContent.value = '';
    error.value = null;
  }

  return {
    stories,
    currentStory,
    loading,
    generating,
    streamingContent,
    error,
    loadStories,
    loadStory,
    generate,
    review,
    like,
    remove,
    reset,
  };
}
