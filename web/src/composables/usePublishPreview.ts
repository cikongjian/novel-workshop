import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import { useNovelStore } from '../stores/novel';
import type { Chapter } from '../types';
import { cleanReaderContent } from '../utils/clean-reader-content';

export function usePublishPreview(deps: {
  novelId: Ref<string>;
  editContent: Ref<string>;
  currentChapter: Ref<Chapter | null>;
}) {
  const { novelId, editContent, currentChapter } = deps;
  const novelStore = useNovelStore();

  const publishPreviewVisible = ref(false);

  /** 去除所有 (#角色) 标记后的干净文本。 */
  const cleanContent = computed(() => {
    return cleanReaderContent(editContent.value);
  });

  function openPublishPreview() {
    if (!editContent.value.trim()) {
      ElMessage.warning('章节内容为空');
      return;
    }
    publishPreviewVisible.value = true;
  }

  async function copyCleanContent() {
    try {
      await navigator.clipboard.writeText(cleanContent.value);
      ElMessage.success('已复制到剪贴板（不含标记）');
    } catch {
      // fallback: 使用 textarea
      const ta = document.createElement('textarea');
      ta.value = cleanContent.value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      ElMessage.success('已复制到剪贴板（不含标记）');
    }
  }

  function downloadCleanChapter() {
    const title = currentChapter.value?.title
      || `${currentChapter.value?.chapterNumber ?? ''}章`;
    const fileName = `${title}.txt`;

    const blob = new Blob([cleanContent.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success(`已下载 ${fileName}（不含标记）`);
  }

  async function downloadAllChapters() {
    try {
      const result = await api.exportNovel(novelId.value, 'txt', { stripSpeakerMarkers: true });
      const novel = novelStore.currentNovel;
      const fileName = `${novel?.title ?? '小说'}.txt`;

      const content = result instanceof Blob ? await result.text() : result.content;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ElMessage.success(`已下载全本 ${fileName}（不含标记）`);
    } catch {
      ElMessage.error('导出失败');
    }
  }

  return {
    publishPreviewVisible,
    cleanContent,
    openPublishPreview,
    copyCleanContent,
    downloadCleanChapter,
    downloadAllChapters,
  };
}
