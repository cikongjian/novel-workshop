import { computed, nextTick, ref, type Ref } from 'vue';

export type OverlayInsertItem = {
  key: string;
  label: string;
  text: string;
};

const INSERT_ITEMS: OverlayInsertItem[] = [
  { key: 'scene-break', label: '场景分割', text: '\n\n* * *\n\n' },
  { key: 'chapter-break', label: '章节分隔', text: '\n\n---\n\n' },
  { key: 'dialogue', label: '对话模板', text: '\n\n""\n\n' },
  { key: 'thought', label: '内心独白', text: '\n\n（）\n\n' },
  { key: 'flashback', label: '回忆标记', text: '\n\n【回忆】\n\n' },
  { key: 'time-skip', label: '时间跳跃', text: '\n\n……\n\n三天后。\n\n' },
];

export function useEditorOverlaysModel(options: {
  editContent: Ref<string>;
  getTextareaEl: () => HTMLTextAreaElement | null;
}) {
  const insertMenuVisible = ref(false);
  const paragraphNavVisible = ref(false);

  function insertQuickText(text: string) {
    const el = options.getTextareaEl();
    const pos = el?.selectionStart ?? options.editContent.value.length;
    options.editContent.value =
      options.editContent.value.substring(0, pos) + text + options.editContent.value.substring(pos);
    insertMenuVisible.value = false;

    // 把光标移到插入内容的合适位置
    nextTick(() => {
      const newEl = options.getTextareaEl();
      if (newEl) {
        const newPos = pos + text.length;
        newEl.focus();
        newEl.setSelectionRange(newPos, newPos);
      }
    });
  }

  function toggleInsertPanel() {
    if (insertMenuVisible.value) {
      insertMenuVisible.value = false;
      return;
    }
    paragraphNavVisible.value = false;
    insertMenuVisible.value = true;
  }

  function toggleParagraphNavPanel() {
    if (paragraphNavVisible.value) {
      paragraphNavVisible.value = false;
      return;
    }
    insertMenuVisible.value = false;
    paragraphNavVisible.value = true;
  }

  const paragraphList = computed(() => {
    if (!options.editContent.value) return [];
    return options.editContent.value
      .split(/\n\n+/)
      .map((p, i) => ({
        index: i,
        preview: p.trim().substring(0, 40) + (p.trim().length > 40 ? '...' : ''),
        offset: options.editContent.value.indexOf(p),
      }))
      .filter(p => p.preview);
  });

  function jumpToParagraph(offset: number) {
    const el = options.getTextareaEl();
    if (!el) return;
    el.focus();
    el.setSelectionRange(offset, offset);
    const linesBefore = el.value.substring(0, offset).split('\n').length;
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 28;
    el.scrollTop = Math.max(0, linesBefore * lineHeight - 60);
    paragraphNavVisible.value = false;
  }

  return {
    insertItems: INSERT_ITEMS,
    insertMenuVisible,
    paragraphNavVisible,
    insertQuickText,
    toggleInsertPanel,
    toggleParagraphNavPanel,
    paragraphList,
    jumpToParagraph,
  };
}
