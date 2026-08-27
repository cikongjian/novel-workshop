<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchSideStories, fetchSideStory, toggleSideStoryLike, type SideStory } from '../../api/side-stories';
import { extractApiErrorMessage } from '../../api/errors';
import { useAuthStore } from '../../stores/auth';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';
import StateView from '../../components/shared/StateView.vue';

const props = defineProps<{ visible: boolean; novelId: string; title?: string }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();

const auth = useAuthStore();
const loading = ref(false);
const readerLoading = ref(false);
const stories = ref<SideStory[]>([]);
const readerStory = ref<SideStory | null>(null);
const liked = ref(false);
const likeCount = ref(0);

const publishedStories = computed(() => stories.value.filter((story) => story.status === 'published' || story.status === 'approved'));
const sceneLabels: Record<string, string> = {
  childhood: '角色童年',
  daily: '日常番外',
  'what-if': '如果线',
  prequel: '前传故事',
  custom: '自定义',
};

function close(): void {
  emit('update:visible', false);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '刚刚' : d.toLocaleDateString('zh-CN');
}

async function loadStories(): Promise<void> {
  if (!props.novelId) return;
  loading.value = true;
  try {
    stories.value = await fetchSideStories(props.novelId);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '番外加载失败'));
  } finally {
    loading.value = false;
  }
}

async function openStory(storyId: string): Promise<void> {
  readerLoading.value = true;
  try {
    readerStory.value = await fetchSideStory(storyId);
    liked.value = readerStory.value.likes.includes(auth.userId ?? '');
    likeCount.value = readerStory.value.likes.length;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '番外读取失败'));
  } finally {
    readerLoading.value = false;
  }
}

async function toggleLike(): Promise<void> {
  if (!auth.isAuthenticated) {
    ElMessage.warning('请先登录');
    return;
  }
  if (!readerStory.value) return;
  try {
    const result = await toggleSideStoryLike(readerStory.value.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '点赞失败'));
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadStories();
    else readerStory.value = null;
  },
);
</script>

<template>
  <Modal :model-value="visible" width="980px" title="番外广场" @update:model-value="emit('update:visible', $event)">
    <div class="desktop-ss-reader-plaza">
      <aside class="desktop-ss-list">
        <div class="desktop-ss-list-head">
          <div>
            <p>Side Stories</p>
            <strong>{{ title || '作品番外' }}</strong>
          </div>
          <button class="desktop-btn" type="button" :disabled="loading" @click="loadStories"><Icon name="refresh" :size="14" /> 刷新</button>
        </div>
        <StateView :loading="loading" :empty="!loading && !publishedStories.length">
          <template #empty>
            <p class="nw-state__title">还没有公开番外</p>
            <p class="nw-state__desc">作者或读者生成并发布后，会在这里展示。</p>
          </template>
          <div class="desktop-ss-list-body">
            <button v-for="story in publishedStories" :key="story.id" class="desktop-ss-card" :class="{ active: readerStory?.id === story.id }" type="button" @click="openStory(story.id)">
              <span>{{ sceneLabels[story.sceneType] || '番外' }}</span>
              <strong>{{ story.title }}</strong>
              <p>{{ story.content.slice(0, 70) }}...</p>
              <small>{{ story.characterNames.join('、') || '群像' }} · {{ story.wordCount }} 字 · {{ fmtDate(story.createdAt) }}</small>
            </button>
          </div>
        </StateView>
      </aside>

      <section class="desktop-ss-reader">
        <StateView :loading="readerLoading" :empty="!readerLoading && !readerStory">
          <template #empty>
            <p class="nw-state__title">选择一篇番外阅读</p>
            <p class="nw-state__desc">番外会补充正文之外的角色高光、日常片段或如果线。</p>
          </template>
          <article v-if="readerStory" class="desktop-ss-reader-doc">
            <p class="desktop-ss-kicker">{{ sceneLabels[readerStory.sceneType] }}</p>
            <h2>{{ readerStory.title }}</h2>
            <div class="desktop-ss-reader-meta">
              <span>{{ readerStory.characterNames.join('、') || '群像' }}</span>
              <span>{{ readerStory.wordCount }} 字</span>
              <span>{{ fmtDate(readerStory.createdAt) }}</span>
            </div>
            <div class="desktop-ss-reader-text">{{ readerStory.content }}</div>
            <footer class="desktop-ss-reader-actions">
              <button class="desktop-btn" :class="{ 'interact-active': liked }" type="button" @click="toggleLike">
                <Icon name="star" :size="14" /> {{ likeCount }}
              </button>
            </footer>
          </article>
        </StateView>
      </section>
    </div>
    <template #footer>
      <button class="desktop-btn" type="button" @click="close">关闭</button>
    </template>
  </Modal>
</template>
