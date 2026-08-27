/**
 * 文本选中监听 composable
 * 监听阅读器内容区域内的文本选中事件，提供选中状态、位置、文本信息
 * 用于驱动划线批注和章节卡片分享的触发入口
 */
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

export interface TextSelectionInfo {
  /** 选中的纯文本 */
  text: string;
  /** 选中文本的 MD5 类 hash（用于跨版本定位） */
  textHash: string;
  /** 段落索引（在 readingParagraphs 中的位置） */
  paragraphIndex: number;
  /** 在该段落中的起始字符偏移 */
  startOffset: number;
  /** 在该段落中的结束字符偏移 */
  endOffset: number;
  /** 选区在视口中的位置信息 */
  rect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  } | null;
}

export function useTextSelection(containerRef: Ref<HTMLElement | null>) {
  const selection = ref<TextSelectionInfo | null>(null);
  const isSelecting = ref(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** 简单文本 hash（DJB2 32-bit 取 hex） */
  function hashText(text: string): string {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * 根据选中 Range 确定在段落列表中的准确位置
   * 遍历段落元素，找到包含选区的段落并计算偏移
   */
  function resolveSelectionInfo(): TextSelectionInfo | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text) return null;

    // 确认选区在指定的容器内
    const container = containerRef.value;
    if (!container || !container.contains(range.commonAncestorContainer)) return null;

    // 获取选区边界矩形
    const rects = range.getClientRects();
    const rect = rects.length > 0 ? {
      top: rects[0].top,
      bottom: rects[rects.length - 1].bottom,
      left: rects[0].left,
      right: rects[rects.length - 1].right,
      width: rects[rects.length - 1].right - rects[0].left,
      height: rects[rects.length - 1].bottom - rects[0].top,
    } : null;

    // 找到选区所在的起始和结束段落
    const paragraphs = container.querySelectorAll('p');
    let startPIdx = -1;
    let endPIdx = -1;
    let startOffset = 0;
    let endOffset = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p.contains(range.startContainer)) {
        startPIdx = i;
        startOffset = computeTextOffset(p, range.startContainer, range.startOffset);
      }
      if (p.contains(range.endContainer)) {
        endPIdx = i;
        endOffset = computeTextOffset(p, range.endContainer, range.endOffset);
        break;
      }
    }

    if (startPIdx < 0) return null;

    const paragraphIndex = startPIdx;
    const fullParagraphText = paragraphs[startPIdx]?.textContent ?? '';
    const selectedTextInParagraph = fullParagraphText.slice(startOffset, endPIdx === startPIdx ? endOffset : undefined);

    return {
      text: selectedTextInParagraph || text,
      textHash: hashText(selectedTextInParagraph || text),
      paragraphIndex,
      startOffset,
      endOffset: endPIdx === startPIdx ? endOffset : fullParagraphText.length,
      rect,
    };
  }

  /** 计算某个 node+offset 在段落中的绝对字符偏移 */
  function computeTextOffset(paragraph: HTMLElement, targetNode: Node, targetOffset: number): number {
    let offset = 0;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node === targetNode) {
        offset += targetOffset;
        break;
      }
      offset += node.textContent?.length ?? 0;
    }
    return offset;
  }

  function handleSelectionChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const info = resolveSelectionInfo();
      selection.value = info;
      isSelecting.value = !!info;
    }, 150);
  }

  /** 清除当前选中 */
  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    selection.value = null;
    isSelecting.value = false;
  }

  onMounted(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('selectionchange', handleSelectionChange);
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return {
    selection,
    isSelecting,
    clearSelection,
    resolveSelectionInfo,
  };
}
