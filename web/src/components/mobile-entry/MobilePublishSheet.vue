<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import RealNameStatusBanner from '../auth/RealNameStatusBanner.vue';
import { getMyPublishedBooks, publishToBookstore } from '../../api/bookstore';
import { checkForkPublish } from '../../api/forks';
import { useRealNameAccess } from '../../composables/useRealNameAccess';
import { BOOKSTORE_CATEGORIES, BOOKSTORE_TAGS } from '../../constants/bookstore-options';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  novelTitle?: string;
  novelSynopsis?: string;
  hasCover: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'published'): void;
  (e: 'fork-approval-needed', novelId: string): void;
}>();

const router = useRouter();
const route = useRoute();
const {
  ensureRealNameAction,
  handleRealNameBlockedError,
  realNameEnabled,
} = useRealNameAccess();

const publishing = ref(false);
const checking = ref(false);
const publishForm = ref({
  category: '',
  tags: [] as string[],
  description: '',
});

const showRealNameBanner = computed(() => realNameEnabled.value);

watch(() => props.visible, async (open) => {
  if (!open) return;

  // Pre-check: cover image required
  if (!props.hasCover) {
    ElMessage.warning('先把封面亮出来，再把这本书送进书城抢首波曝光');
    emit('update:visible', false);
    return;
  }

  // Pre-check: real-name verification
  if (!(await ensureRealNameAction('bookPublishing', {
    router,
    isMobile: true,
    redirect: route.fullPath,
  }))) {
    emit('update:visible', false);
    return;
  }

  // Pre-check: duplicate publish
  checking.value = true;
  try {
    const forkCheck = await checkForkPublish(props.novelId);
    if (forkCheck.isFork && !forkCheck.canPublish) {
      emit('update:visible', false);
      emit('fork-approval-needed', props.novelId);
      return;
    }

    const published = await getMyPublishedBooks();
    if (published.some((book) => book.novelId === props.novelId)) {
      ElMessage.warning('这部作品已经在书城占位了');
      emit('update:visible', false);
      return;
    }
  } catch {
    // Allow opening even if check fails
  } finally {
    checking.value = false;
  }

  // Initialize form
  publishForm.value = {
    category: '',
    tags: [],
    description: props.novelSynopsis || '',
  };
});

function close() {
  emit('update:visible', false);
}

async function submitPublish() {
  if (!publishForm.value.category) {
    ElMessage.warning('先给作品定个赛道，书城才好分发');
    return;
  }
  if (!(await ensureRealNameAction('bookPublishing', {
    router,
    isMobile: true,
    redirect: route.fullPath,
  }))) {
    return;
  }

  publishing.value = true;
  try {
    await publishToBookstore({
      novelId: props.novelId,
      category: publishForm.value.category,
      tags: publishForm.value.tags,
      description: publishForm.value.description,
    });
    ElMessage.success('作品已送审，过审后就能进书城抢曝光');
    close();
    emit('published');
  } catch (error: any) {
    if (handleRealNameBlockedError(error, {
      scene: 'bookPublishing',
      router,
      isMobile: true,
      redirect: route.fullPath,
    })) {
      return;
    }
    const status = error?.response?.status;
    const message = String(error?.response?.data?.error ?? '');
    if (status === 403 && message.includes('分叉作品')) {
      close();
      emit('fork-approval-needed', props.novelId);
      return;
    }
    ElMessage.error(error?.response?.data?.error || '发布失败');
  } finally {
    publishing.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="送上书城"
    width="92%"
    class="mobile-published-dialog mobile-publish-sheet"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
  >
    <div v-if="checking" style="text-align: center; padding: 24px 0;">
      <el-skeleton animated :rows="3" />
    </div>
    <div v-else class="mobile-focus-input-stack">
      <RealNameStatusBanner v-if="showRealNameBanner" scene="bookPublishing" is-mobile compact />
      <div v-if="novelTitle" class="mobile-publish-sheet__novel-hint">
        准备把这本书送进书城：<strong>{{ novelTitle }}</strong>
      </div>
      <el-select v-model="publishForm.category" placeholder="选一个更容易吃到流量的分类">
        <el-option v-for="category in BOOKSTORE_CATEGORIES" :key="category" :label="category" :value="category" />
      </el-select>
      <el-select
        v-model="publishForm.tags"
        multiple
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        :multiple-limit="8"
        placeholder="补几个更容易被点开的标签，最多 8 个"
      >
        <el-option v-for="tag in BOOKSTORE_TAGS" :key="tag" :label="tag" :value="tag" />
      </el-select>
      <el-input v-model="publishForm.description" type="textarea" :rows="5" placeholder="用一句更抓人的话，告诉读者为什么要点开" />
    </div>
    <template #footer>
      <button class="mobile-focus-button--ghost" type="button" @click="close">取消</button>
      <button class="mobile-focus-button--primary" type="button" :disabled="publishing || checking" @click="submitPublish">
        {{ publishing ? '发布中...' : '发布到书城' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mobile-publish-sheet__novel-hint {
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent);
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.mobile-publish-sheet__novel-hint strong {
  color: var(--nw-text-primary);
}
</style>
