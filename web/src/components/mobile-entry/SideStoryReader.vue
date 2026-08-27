<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Calendar, Close, Delete, Film, Reading, Star, StarFilled, User } from '@element-plus/icons-vue';
import { fetchSideStory, toggleSideStoryLike, deleteSideStory, reviewSideStory } from '../../api/side-stories';
import { useAuthStore } from '../../stores/auth';
import type { SideStory } from '../../api/side-stories';

const props = defineProps<{
  visible: boolean;
  storyId: string | null;
  isOwner?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  deleted: [];
  reviewed: [];
}>();

const auth = useAuthStore();
const story = ref<SideStory | null>(null);
const loading = ref(false);
const liked = ref(false);
const likeCount = ref(0);

const sceneLabels: Record<string, string> = {
  childhood: '角色童年',
  daily: '日常番外',
  'what-if': '如果线',
  prequel: '前传故事',
  custom: '自定义',
};

const statusLabels: Record<string, { text: string; tone: 'gold' | 'success' | 'danger' | 'accent' }> = {
  pending: { text: '待审核', tone: 'gold' },
  approved: { text: '已通过', tone: 'success' },
  rejected: { text: '已拒绝', tone: 'danger' },
  published: { text: '已发布', tone: 'accent' },
};

const formattedDate = computed(() => {
  if (!story.value) return '';
  const d = new Date(story.value.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

async function loadStory() {
  if (!props.storyId) return;
  loading.value = true;
  try {
    story.value = await fetchSideStory(props.storyId);
    liked.value = story.value.likes.includes(auth.userId ?? '');
    likeCount.value = story.value.likes.length;
  } catch {
    ElMessage.error('加载番外失败');
  } finally {
    loading.value = false;
  }
}

async function handleLike() {
  if (!auth.isAuthenticated) {
    ElMessage.warning('请先登录');
    return;
  }
  if (!story.value) return;
  try {
    const result = await toggleSideStoryLike(story.value.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    ElMessage.error('点赞失败');
  }
}

async function handleReview(status: 'approved' | 'rejected' | 'published') {
  if (!story.value) return;
  try {
    await reviewSideStory(story.value.id, status);
    ElMessage.success(status === 'published' ? '已发布' : status === 'approved' ? '已通过' : '已拒绝');
    await loadStory();
    emit('reviewed');
  } catch {
    ElMessage.error('操作失败');
  }
}

async function handleDelete() {
  if (!story.value) return;
  try {
    await deleteSideStory(story.value.id);
    ElMessage.success('已删除');
    emit('deleted');
    emit('close');
  } catch {
    ElMessage.error('删除失败');
  }
}

watch(
  () => [props.visible, props.storyId] as const,
  ([visible, id]) => {
    if (visible && id) {
      void loadStory();
    } else {
      story.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ss-reader-overlay mobile-focus-light-vars">
      <div class="ss-reader-sheet">
        <!-- 顶部栏 -->
        <div class="ss-reader__header">
          <button class="ss-reader__back" @click="emit('close')">
            <el-icon><Close /></el-icon>
          </button>
          <span class="ss-reader__title">番外阅读</span>
          <div class="ss-reader__header-actions">
            <button
              v-if="isOwner || story?.generatedBy === auth.userId"
              class="ss-reader__header-btn"
              @click="handleDelete"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="ss-reader__content">
          <div v-if="loading" class="ss-reader__loading">加载中...</div>
          <template v-else-if="story">
            <!-- 元信息 -->
            <div class="ss-reader__meta">
              <h1 class="ss-reader__story-title">{{ story.title }}</h1>
              <div class="ss-reader__meta-info">
                <span class="ss-reader__meta-item">
                  <el-icon><Reading /></el-icon>
                  <span>{{ story.wordCount }} 字</span>
                </span>
                <span class="ss-reader__meta-item">
                  <el-icon><Calendar /></el-icon>
                  <span>{{ formattedDate }}</span>
                </span>
                <span class="ss-reader__meta-item">
                  <el-icon><User /></el-icon>
                  <span>{{ story.characterNames.join('、') }}</span>
                </span>
                <span class="ss-reader__meta-item">
                  <el-icon><Film /></el-icon>
                  <span>{{ sceneLabels[story.sceneType] }}</span>
                </span>
                <span
                  v-if="story.status !== 'published'"
                  class="ss-reader__status"
                  :class="`ss-reader__status--${statusLabels[story.status]?.tone ?? 'accent'}`"
                >
                  {{ statusLabels[story.status]?.text }}
                </span>
              </div>
            </div>

            <!-- 正文 -->
            <div class="ss-reader__text">{{ story.content }}</div>

            <!-- 作者审核区 -->
            <div v-if="isOwner && story.status === 'pending'" class="ss-reader__review">
              <p class="ss-reader__review-title">作者审核</p>
              <div class="ss-reader__review-actions">
                <button class="ss-reader__review-btn ss-reader__review-btn--publish" @click="handleReview('published')">
                  发布
                </button>
                <button class="ss-reader__review-btn ss-reader__review-btn--reject" @click="handleReview('rejected')">
                  拒绝
                </button>
              </div>
            </div>

            <!-- 底部互动 -->
            <div class="ss-reader__footer">
              <button class="ss-reader__like-btn" :class="{ 'ss-reader__like-btn--active': liked }" @click="handleLike">
                <el-icon v-if="liked"><StarFilled /></el-icon>
                <el-icon v-else><Star /></el-icon>
                <span>{{ likeCount }}</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ss-reader-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: var(--nw-bg-primary);
}

.ss-reader-sheet {
  width: 100%;
  max-width: 540px;
  margin: 0 auto;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.ss-reader__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--nw-bg-secondary);
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}

.ss-reader__back {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nw-text-secondary);
}

.ss-reader__back:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
}

.ss-reader__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.ss-reader__header-actions {
  display: flex;
  gap: 4px;
}

.ss-reader__header-btn {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nw-text-muted);
}

.ss-reader__header-btn:hover {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 10%, transparent);
  color: var(--mobile-focus-status-danger);
}

.ss-reader__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
}

.ss-reader__loading {
  text-align: center;
  padding: 40px;
  color: var(--nw-text-muted);
}

.ss-reader__meta {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}

.ss-reader__story-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0 0 12px;
  line-height: 1.4;
}

.ss-reader__meta-info {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.ss-reader__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ss-reader__status {
  font-size: 12px;
  font-weight: 600;
}

.ss-reader__status--gold {
  color: var(--mobile-focus-status-gold);
}

.ss-reader__status--success {
  color: var(--mobile-focus-status-success);
}

.ss-reader__status--danger {
  color: var(--mobile-focus-status-danger);
}

.ss-reader__status--accent {
  color: var(--mobile-focus-accent);
}

.ss-reader__text {
  font-size: 16px;
  line-height: 1.9;
  color: var(--nw-text-secondary);
  white-space: pre-wrap;
  letter-spacing: 0;
}

/* 审核区 */
.ss-reader__review {
  margin-top: 32px;
  padding: 16px;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 14%, var(--nw-bg-secondary));
  border-radius: 12px;
}

.ss-reader__review-title {
  font-size: 14px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 88%, var(--nw-text-primary));
  margin: 0 0 12px;
}

.ss-reader__review-actions {
  display: flex;
  gap: 10px;
}

.ss-reader__review-btn {
  flex: 1;
  padding: 10px;
  border: 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ss-reader__review-btn--publish {
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
}

.ss-reader__review-btn--reject {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 12%, var(--nw-bg-secondary));
  color: var(--mobile-focus-status-danger);
}

/* 底部互动 */
.ss-reader__footer {
  margin-top: 32px;
  display: flex;
  justify-content: center;
  gap: 16px;
}

.ss-reader__like-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
  border-radius: 24px;
  background: var(--nw-bg-secondary);
  cursor: pointer;
  font-size: 14px;
  color: var(--nw-text-muted);
  transition: all 0.15s;
}

.ss-reader__like-btn--active {
  border-color: var(--mobile-focus-status-gold);
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 14%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 88%, var(--nw-text-primary));
}

.ss-reader__like-btn:active {
  transform: scale(0.95);
}
</style>
