import { ref, computed, watch, nextTick } from 'vue';
import type { Ref } from 'vue';

export function useFindReplaceEditor(deps: {
  editContent: Ref<string>;
  getTextareaEl: () => HTMLTextAreaElement | null;
}) {
  const { editContent, getTextareaEl } = deps;

  const findReplaceVisible = ref(false);
  const findMatches = ref<{ start: number; end: number }[]>([]);
  const findCurrentIndex = ref(-1);
  const highlightMirrorRef = ref<HTMLDivElement | null>(null);

  function openFindReplace() {
    findReplaceVisible.value = true;
  }

  // 关闭查找面板时清除高亮
  watch(findReplaceVisible, (v) => {
    if (!v) {
      findMatches.value = [];
      findCurrentIndex.value = -1;
    }
  });

  function handleFindMatchesChange(matches: { start: number; end: number }[], currentIndex: number) {
    findMatches.value = matches;
    findCurrentIndex.value = currentIndex;
    // 滚动到当前匹配
    if (currentIndex >= 0 && matches[currentIndex]) {
      scrollToMatch(matches[currentIndex].start);
    }
  }

  /** 生成高亮 overlay 的 HTML */
  const highlightMirrorHtml = computed(() => {
    if (findMatches.value.length === 0) return '';
    const text = editContent.value;
    const parts: string[] = [];
    let lastEnd = 0;
    for (let i = 0; i < findMatches.value.length; i++) {
      const m = findMatches.value[i];
      if (m.start > lastEnd) {
        parts.push(escapeHtml(text.slice(lastEnd, m.start)));
      }
      const cls = i === findCurrentIndex.value ? 'find-hl find-hl-current' : 'find-hl';
      parts.push(`<mark class="${cls}">${escapeHtml(text.slice(m.start, m.end))}</mark>`);
      lastEnd = m.end;
    }
    if (lastEnd < text.length) {
      parts.push(escapeHtml(text.slice(lastEnd)));
    }
    // 末尾加一个换行，保证 mirror 高度与 textarea 一致
    parts.push('\n');
    return parts.join('');
  });

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function syncMirrorScroll() {
    const el = getTextareaEl();
    const mirror = highlightMirrorRef.value;
    if (el && mirror) {
      mirror.scrollTop = el.scrollTop;
      mirror.scrollLeft = el.scrollLeft;
    }
  }

  function scrollToMatch(startOffset: number) {
    const el = getTextareaEl();
    if (!el) return;
    // 等待 v-html 渲染 + 浏览器完成布局后再计算位置
    nextTick(() => {
      requestAnimationFrame(() => {
        const mirror = highlightMirrorRef.value;
        if (!mirror) {
          scrollToMatchFallback(el, startOffset);
          return;
        }
        const mark = mirror.querySelector('.find-hl-current') as HTMLElement | null;
        if (!mark) {
          scrollToMatchFallback(el, startOffset);
          return;
        }
        // 使用 getBoundingClientRect 精确计算 inline 元素位置
        const mirrorRect = mirror.getBoundingClientRect();
        const markRect = mark.getBoundingClientRect();
        const markTopInContent = markRect.top - mirrorRect.top + mirror.scrollTop;
        const viewHeight = el.clientHeight;
        const targetScroll = Math.max(0, markTopInContent - viewHeight / 2 + markRect.height / 2);
        el.scrollTop = targetScroll;
        syncMirrorScroll();
      });
    });
  }

  /** 回退方案：根据文本偏移量估算滚动位置 */
  function scrollToMatchFallback(el: HTMLTextAreaElement, startOffset: number) {
    const text = editContent.value.substring(0, startOffset);
    const lineCount = (text.match(/\n/g) || []).length;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 27;
    const targetScroll = Math.max(0, lineCount * lineHeight - el.clientHeight / 2);
    el.scrollTop = targetScroll;
    syncMirrorScroll();
  }

  function handleFindHighlight(_start: number, _end: number) {
    // 保留接口兼容，实际高亮由 overlay 处理
  }

  function handleFindReplace(start: number, end: number, newText: string) {
    editContent.value =
      editContent.value.substring(0, start) + newText + editContent.value.substring(end);
  }

  return {
    findReplaceVisible,
    findMatches,
    findCurrentIndex,
    highlightMirrorRef,
    highlightMirrorHtml,
    openFindReplace,
    handleFindMatchesChange,
    handleFindHighlight,
    handleFindReplace,
    syncMirrorScroll,
  };
}
