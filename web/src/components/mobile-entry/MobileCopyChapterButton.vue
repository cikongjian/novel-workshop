<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';

interface Props {
  content: string;
  chapterNumber: number;
  chapterTitle?: string;
}

const props = defineProps<Props>();

const copyButtonLabel = computed(() => `复制第 ${props.chapterNumber} 章`);

async function handleCopy() {
  if (!props.content || props.content.trim().length === 0) {
    ElMessage.warning('章节内容为空，无法复制');
    return;
  }

  try {
    await navigator.clipboard.writeText(props.content);
    ElMessage.success('章节内容已复制到剪贴板');
  } catch (err) {
    console.error('复制失败:', err);

    // 降级方案：使用传统方法
    try {
      const textarea = document.createElement('textarea');
      textarea.value = props.content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      ElMessage.success('章节内容已复制到剪贴板');
    } catch (fallbackErr) {
      console.error('降级复制也失败:', fallbackErr);
      ElMessage.error('复制失败，请手动选择文本复制');
    }
  }
}
</script>

<template>
  <button
    type="button"
    class="mobile-copy-chapter-button"
    :aria-label="copyButtonLabel"
    @click="handleCopy"
  >
    <el-icon class="copy-icon">
      <CopyDocument />
    </el-icon>
    <span class="copy-label">复制全文</span>
  </button>
</template>

<style scoped>
.mobile-copy-chapter-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  opacity: 0.72;
}

.mobile-copy-chapter-button:active {
  transform: scale(0.96);
  opacity: 1;
}

.copy-icon {
  font-size: 14px;
}

.copy-label {
  line-height: 1;
}
</style>
