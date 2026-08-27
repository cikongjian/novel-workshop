/**
 * 划线模式 composable
 * - 开启后点击文中文字自动选中词句
 * - 选中触发 selectionchange → useReaderAnnotations 弹出操作栏
 * - 划线/批注完成后自动退出该模式
 * - 专为解决微信等内置浏览器劫持长按菜单的问题
 */
import { ref, watch, onUnmounted, type Ref } from 'vue';

export interface TapSelectOptions {
  /** 阅读内容容器 ref */
  containerRef: Ref<HTMLElement | null>;
}

export function useTapSelect(options: TapSelectOptions) {
  /** 划线模式开关 */
  const selectMode = ref(false);

  let boundContainer: HTMLElement | null = null;

  function bindListeners(container: HTMLElement) {
    container.addEventListener('pointerdown', onPointerDown, { passive: true });
  }

  function unbindListeners(container: HTMLElement) {
    container.removeEventListener('pointerdown', onPointerDown);
  }

  watch(
    () => options.containerRef.value,
    (el) => {
      if (boundContainer) {
        unbindListeners(boundContainer);
        boundContainer = null;
      }
      if (el) {
        bindListeners(el);
        boundContainer = el;
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (boundContainer) {
      unbindListeners(boundContainer);
      boundContainer = null;
    }
  });

  // ── CJK 词句扩展 ──

  function isCJKChar(ch: string): boolean {
    const code = ch.codePointAt(0);
    if (code == null) return false;
    return (
      (code >= 0x4E00 && code <= 0x9FFF)
      || (code >= 0x3400 && code <= 0x4DBF)
    );
  }

  function isCJKPause(ch: string): boolean {
    return /[。！？…、，；：\u3000\s"'「」『』（）【】《》\n]/.test(ch);
  }

  function expandToWord(range: Range): void {
    const text = range.startContainer.textContent ?? '';
    const startOffset = range.startOffset;
    const maxLen = text.length;

    const charAtTap = startOffset < maxLen
      ? text.charAt(startOffset)
      : (startOffset > 0 ? text.charAt(startOffset - 1) : '');
    const isCJK = isCJKChar(charAtTap);

    if (isCJK) {
      let left = startOffset;
      let right = startOffset;
      while (left > 0 && (startOffset - left) < 10) {
        if (isCJKPause(text.charAt(left - 1))) break;
        left--;
      }
      while (right < maxLen && (right - startOffset) < 10) {
        if (isCJKPause(text.charAt(right))) break;
        right++;
      }
      if (left === right) {
        range.selectNodeContents(range.startContainer);
      } else {
        range.setStart(range.startContainer, left);
        range.setEnd(range.startContainer, right);
      }
    } else {
      while (range.startOffset > 0) {
        if (!/[\w]/.test(text.charAt(range.startOffset - 1))) break;
        range.setStart(range.startContainer, range.startOffset - 1);
      }
      while (range.endOffset < maxLen) {
        if (!/[\w]/.test(text.charAt(range.endOffset))) break;
        range.setEnd(range.startContainer, range.endOffset + 1);
      }
    }
  }

  function selectWordAtPoint(x: number, y: number): boolean {
    const doc = document;
    let range: Range | null = null;

    if (doc.caretRangeFromPoint) {
      range = doc.caretRangeFromPoint(x, y);
    }
    if (!range && doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    }

    if (!range || !range.startContainer) return false;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return false;

    const container = options.containerRef.value;
    if (container && !container.contains(range.startContainer)) return false;

    expandToWord(range);

    if (range.collapsed) {
      range.selectNodeContents(range.startContainer);
    }

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }

    return true;
  }

  function onPointerDown(e: PointerEvent) {
    if (!selectMode.value) return;
    // 只处理触摸/鼠标左键点击
    if (e.pointerType === 'touch' && !e.isPrimary) return;

    const selected = selectWordAtPoint(e.clientX, e.clientY);
    if (selected) {
      // 选中成功 → 退出划线模式，后续由 useReaderAnnotations 接管
      selectMode.value = false;
    }
  }

  function toggleSelectMode() {
    selectMode.value = !selectMode.value;
  }

  function exitSelectMode() {
    selectMode.value = false;
  }

  return {
    selectMode,
    toggleSelectMode,
    exitSelectMode,
  };
}
