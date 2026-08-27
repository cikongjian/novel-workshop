<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  ArrowRight,
  Calendar,
  Close,
  Document,
  MagicStick,
  Plus,
  Promotion,
  Star,
  User,
} from '@element-plus/icons-vue';
import { fetchSideStories } from '../../api/side-stories';
import { useSideStoryPermission } from '../../composables/useSideStoryPermission';
import type { SideStory } from '../../api/side-stories';
import '../../styles/side-story-plaza.css';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  novelOwnerId?: string;
}>();

const emit = defineEmits<{
  close: [];
  openReader: [storyId: string];
  openGenerate: [];
}>();

const stories = ref<SideStory[]>([]);
const loading = ref(false);
const permission = useSideStoryPermission();

const sceneLabels: Record<string, string> = {
  childhood: '童年',
  daily: '日常',
  'what-if': '如果线',
  prequel: '前传',
  custom: '自定义',
};

const statusInfo: Record<string, { text: string; tone: string }> = {
  pending: { text: '待审核', tone: 'pending' },
  approved: { text: '已通过', tone: 'approved' },
  rejected: { text: '已退回', tone: 'rejected' },
  published: { text: '已发布', tone: 'published' },
};

async function loadStories() {
  if (!props.novelId) return;
  loading.value = true;
  try {
    stories.value = await fetchSideStories(props.novelId);
  } catch {
    stories.value = [];
  } finally {
    loading.value = false;
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function handleGenerateClick() {
  emit('openGenerate');
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void loadStories();
      void permission.checkPermission();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ss-plaza-overlay">
      <section class="ss-plaza-sheet" role="dialog" aria-modal="true" aria-label="番外广场">
        <header class="ss-plaza__header">
          <button class="ss-plaza__icon-btn" type="button" aria-label="关闭" @click="emit('close')">
            <el-icon><Close /></el-icon>
          </button>
          <div class="ss-plaza__heading">
            <span class="ss-plaza__heading-icon"><el-icon><Promotion /></el-icon></span>
            <div>
              <span class="ss-plaza__kicker">Side Stories</span>
              <h3 class="ss-plaza__title">番外广场</h3>
            </div>
          </div>
          <button class="ss-plaza__icon-btn ss-plaza__icon-btn--primary" type="button" aria-label="生成番外" @click="handleGenerateClick">
            <el-icon><Plus /></el-icon>
          </button>
        </header>

        <main class="ss-plaza__body">
          <div v-if="loading" class="ss-plaza__loading">
            <span class="ss-plaza__spinner"></span>
            <p>正在读取番外内容</p>
          </div>

          <section v-else-if="stories.length === 0" class="ss-plaza__empty">
            <span class="ss-plaza__empty-icon"><el-icon><Promotion /></el-icon></span>
            <strong>当前还没有番外</strong>
            <p>从角色切入，补出正文之外的高光、日常或如果线，让这部作品多一个可分享的入口。</p>
            <div class="ss-plaza__empty-points">
              <span><el-icon><User /></el-icon> 选择角色</span>
              <span><el-icon><Document /></el-icon> 设定场景</span>
              <span><el-icon><MagicStick /></el-icon> 生成故事</span>
            </div>
            <button class="ss-plaza__empty-btn" type="button" @click="handleGenerateClick">
              <el-icon><MagicStick /></el-icon>
              生成第一篇番外
            </button>
          </section>

          <div v-else class="ss-plaza__list">
            <article
              v-for="story in stories"
              :key="story.id"
              class="ss-plaza__card"
              @click="emit('openReader', story.id)"
            >
              <div class="ss-plaza__card-header">
                <h4 class="ss-plaza__card-title">{{ story.title }}</h4>
                <span
                  v-if="story.status !== 'published'"
                  class="ss-plaza__card-status"
                  :class="`is-${statusInfo[story.status]?.tone}`"
                >
                  {{ statusInfo[story.status]?.text }}
                </span>
              </div>
              <p class="ss-plaza__card-excerpt">{{ story.content.slice(0, 80) }}...</p>
              <div class="ss-plaza__card-meta">
                <span class="ss-plaza__card-meta-item"><el-icon><User /></el-icon>{{ story.characterNames.join('、') }}</span>
                <span class="ss-plaza__card-meta-item"><el-icon><Promotion /></el-icon>{{ sceneLabels[story.sceneType] }}</span>
                <span class="ss-plaza__card-meta-item"><el-icon><Document /></el-icon>{{ story.wordCount }} 字</span>
                <span class="ss-plaza__card-meta-item"><el-icon><Calendar /></el-icon>{{ formatDate(story.createdAt) }}</span>
                <span class="ss-plaza__card-meta-item"><el-icon><Star /></el-icon>{{ story.likes.length }}</span>
              </div>
              <span class="ss-plaza__card-arrow"><el-icon><ArrowRight /></el-icon></span>
            </article>
          </div>
        </main>

        <footer class="ss-plaza__footer">
          <p v-if="permission.needsLogin.value" class="ss-plaza__footer-hint">
            登录后即可使用自己的 AI Key 生成番外
          </p>
          <p v-else-if="permission.checked.value && !permission.hasApiKey.value" class="ss-plaza__footer-hint">
            配置个人 AI Key 后，即可为喜欢的角色生成番外
          </p>
          <p v-else-if="permission.loading.value" class="ss-plaza__footer-hint">
            正在确认生成权限
          </p>
          <button class="ss-plaza__footer-btn" type="button" @click="handleGenerateClick">
            <el-icon><MagicStick /></el-icon>
            生成番外
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
