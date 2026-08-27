<script setup lang="ts">
import { Delete, Star, StarFilled } from '@element-plus/icons-vue';
import type { CoverCandidate } from '../dashboard/ai-cover-candidate-types';
import '../../styles/mobile-cover-candidates.css';

defineProps<{
  candidates: CoverCandidate[];
  applyingCandidate: string | null;
  restoringHistory: boolean;
}>();

const emit = defineEmits<{
  (e: 'apply-candidate', candidateId: string): void;
  (e: 'toggle-pinned', candidateId: string): void;
  (e: 'remove-candidate', candidateId: string): void;
}>();
</script>

<template>
  <section v-if="restoringHistory || candidates.length > 0" class="mobile-cover-candidates">
    <div class="mobile-cover-candidates__header">
      <strong>候选封面</strong>
      <span>{{ restoringHistory ? '正在恢复历史' : `${candidates.length} 张可选` }}</span>
    </div>

    <div v-if="restoringHistory" class="mobile-cover-candidates__loading">
      <span class="mobile-cover-editor__spinner"></span>
      <span>正在恢复候选封面...</span>
    </div>

    <div v-else class="mobile-cover-candidates__grid">
      <article
        v-for="candidate in candidates"
        :key="candidate.id"
        class="mobile-cover-candidate"
      >
        <button
          class="mobile-cover-candidate__preview"
          type="button"
          :disabled="applyingCandidate === candidate.id"
          @click="emit('apply-candidate', candidate.id)"
        >
          <img :src="candidate.previewUrl" :alt="candidate.preset.label" />
          <span v-if="candidate.usedFallbackSize" class="mobile-cover-candidate__badge">降级尺寸</span>
          <span class="mobile-cover-candidate__apply">点击应用</span>
          <span v-if="applyingCandidate === candidate.id" class="mobile-cover-candidate__busy">
            应用中...
          </span>
        </button>

        <div class="mobile-cover-candidate__actions">
          <button
            class="mobile-cover-candidate__action"
            :class="{ 'is-active': candidate.pinnedAt }"
            type="button"
            @click="emit('toggle-pinned', candidate.id)"
          >
            <el-icon>
              <StarFilled v-if="candidate.pinnedAt" />
              <Star v-else />
            </el-icon>
            <span>{{ candidate.pinnedAt ? '已保留' : '保留' }}</span>
          </button>
          <button
            class="mobile-cover-candidate__action"
            type="button"
            @click="emit('remove-candidate', candidate.id)"
          >
            <el-icon><Delete /></el-icon>
            <span>移除</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
