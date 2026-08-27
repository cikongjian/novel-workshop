<script setup lang="ts">
/**
 * 分叉溯源横幅 — 分叉作品顶部显示"分叉自《XXX》第 N 章"
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Connection } from '@element-plus/icons-vue';

const props = defineProps<{
  forkedFrom?: {
    originalNovelId: string;
    originalTitle: string;
    chapter: number;
    forkedBy: string;
  } | null;
}>();

const router = useRouter();

const visible = computed(() => !!props.forkedFrom);

function goToOriginal() {
  if (!props.forkedFrom) return;
  router.push(`/m/novel/${props.forkedFrom.originalNovelId}`);
}
</script>

<template>
  <div v-if="visible && forkedFrom" class="fork-banner" @click="goToOriginal">
    <span class="fork-banner__icon">
      <el-icon><Connection /></el-icon>
    </span>
    <div class="fork-banner__content">
      <span class="fork-banner__text">
        分叉自《{{ forkedFrom.originalTitle }}》第 {{ forkedFrom.chapter }} 章
      </span>
      <span class="fork-banner__action">
        查看原作
        <el-icon><ArrowRight /></el-icon>
      </span>
    </div>
  </div>
</template>

<style scoped>
.fork-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin: 8px 12px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, var(--nw-bg-secondary)),
    color-mix(in srgb, var(--mobile-focus-accent-strong) 5%, var(--nw-bg-secondary))
  );
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent-strong) 20%, transparent);
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s;
}

.fork-banner:active {
  transform: scale(0.98);
}

.fork-banner__icon {
  font-size: 20px;
  flex-shrink: 0;
  color: var(--mobile-focus-accent-strong);
  line-height: 1;
}

.fork-banner__content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.fork-banner__text {
  font-size: 13px;
  color: color-mix(in srgb, var(--mobile-focus-accent-strong) 86%, var(--nw-text-primary));
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fork-banner__action {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--mobile-focus-accent-strong);
  font-weight: 700;
  flex-shrink: 0;
}
</style>
