/**
 * 阅读器划线批注统一 composable
 * 封装文本选中、划线CRUD、分享卡片生成、段落高亮渲染
 * 供 MobileNovelReader / MobileBookReader 使用
 */
import { ref, reactive, watch, type Ref } from 'vue';
import { useTextSelection, type TextSelectionInfo } from './useTextSelection';
import { useTextAnnotation } from './useTextAnnotation';
import { useShareCard, type ShareCardData } from './useShareCard';

export function useReaderAnnotations(
  novelId: Ref<string>,
  chapterNumber: Ref<number | null>,
  paragraphs: Ref<string[]>,
  contentContainerRef: Ref<HTMLElement | null>,
  novelTitle: Ref<string>,
  authorName: Ref<string>,
) {
  const textSelection = useTextSelection(contentContainerRef);
  const annotation = useTextAnnotation(novelId, chapterNumber, paragraphs);
  const shareCard = useShareCard();

  // UI 状态
  const actionBarVisible = ref(false);
  const actionBarX = ref(0);
  const actionBarY = ref(0);
  const actionBarType = ref<'select' | 'highlight'>('select');

  const annotationPanelVisible = ref(false);
  const annotationPanelAnnotations = ref<any[]>([]);
  const annotationPanelText = ref('');

  const shareCardViewerVisible = ref(false);
  const shareCardData = ref<ShareCardData>({
    text: '',
    novelTitle: '',
    authorName: '',
  });

  // 写想法弹窗
  const noteInputVisible = ref(false);
  const noteInputText = ref('');
  const pendingNoteSelection = ref<TextSelectionInfo | null>(null);

  // 监听选中变化，显示/隐藏操作栏
  watch(
    () => textSelection.selection.value,
    (sel) => {
      if (sel && sel.rect) {
        actionBarType.value = 'select';
        actionBarX.value = sel.rect.left + sel.rect.width / 2 - 80;
        actionBarY.value = sel.rect.top;
        actionBarVisible.value = true;
      } else {
        actionBarVisible.value = false;
      }
    },
  );

  // 监听章节切换，重新拉取划线
  watch([novelId, chapterNumber], () => {
    annotation.fetchAnnotations();
  }, { immediate: true });

  /** 点击划线 */
  function handleHighlight() {
    const sel = textSelection.selection.value;
    if (!sel) return;
    actionBarVisible.value = false;
    annotation.addAnnotation({
      paragraphIndex: sel.paragraphIndex,
      startOffset: sel.startOffset,
      endOffset: sel.endOffset,
      textHash: sel.textHash,
      selectedText: sel.text,
      type: 'highlight',
    }).then(() => {
      textSelection.clearSelection();
    });
  }

  /** 点击写想法 → 弹出备注输入弹窗 */
  function handleNote() {
    const sel = textSelection.selection.value;
    if (!sel) return;
    actionBarVisible.value = false;
    pendingNoteSelection.value = sel;
    noteInputText.value = '';
    noteInputVisible.value = true;
  }

  /** 确认写想法 */
  async function confirmNote() {
    const sel = pendingNoteSelection.value;
    if (!sel) return;
    noteInputVisible.value = false;
    const created = await annotation.addAnnotation({
      paragraphIndex: sel.paragraphIndex,
      startOffset: sel.startOffset,
      endOffset: sel.endOffset,
      textHash: sel.textHash,
      selectedText: sel.text,
      type: 'note',
      note: noteInputText.value.trim() || undefined,
    });
    if (created) {
      textSelection.clearSelection();
      pendingNoteSelection.value = null;
      noteInputText.value = '';
    }
  }

  /** 取消写想法 */
  function cancelNote() {
    noteInputVisible.value = false;
    pendingNoteSelection.value = null;
    noteInputText.value = '';
    textSelection.clearSelection();
  }

  /** 点击分享 */
  function handleShare() {
    const sel = textSelection.selection.value;
    if (!sel) return;
    actionBarVisible.value = false;
    shareCardData.value = {
      text: sel.text,
      novelTitle: novelTitle.value,
      authorName: authorName.value,
    };
    shareCardViewerVisible.value = true;
  }

  /** 点击已有划线的段落 → 查看划线列表 */
  function handleAnnotationClick(annotationId: string) {
    const anns = annotation.annotations.value.filter((a) => a.id === annotationId);
    const ann = anns[0];
    if (!ann) return;

    annotationPanelAnnotations.value = annotation.getAnnotationsForSpan(
      ann.paragraphIndex,
      ann.startOffset,
      ann.endOffset,
    );
    annotationPanelText.value = ann.selectedText;
    annotationPanelVisible.value = true;
  }

  /** 点赞标注 */
  function handleLike(id: string) {
    annotation.likeAnnotation(id);
  }

  /** 删除标注 */
  function handleDelete(id: string) {
    annotation.deleteAnnotation(id);
    annotationPanelVisible.value = false;
  }

  function closeAll() {
    actionBarVisible.value = false;
    annotationPanelVisible.value = false;
    shareCardViewerVisible.value = false;
    noteInputVisible.value = false;
  }

  return {
    // 划线数据
    richParagraphs: annotation.richParagraphs,
    annotationCountForParagraph: annotation.getAnnotationCountForParagraph,
    annotationsLoading: annotation.loading,

    // 文本选中
    isSelecting: textSelection.isSelecting,
    clearSelection: textSelection.clearSelection,

    // 操作栏
    actionBarVisible,
    actionBarX,
    actionBarY,
    actionBarType,

    // 标注面板
    annotationPanelVisible,
    annotationPanelAnnotations,
    annotationPanelText,

    // 分享卡片
    shareCardViewerVisible,
    shareCardData,
    shareCard,

    // 写想法弹窗
    noteInputVisible,
    noteInputText,
    pendingNoteSelection,
    confirmNote,
    cancelNote,

    // 动作
    handleHighlight,
    handleNote,
    handleShare,
    handleAnnotationClick,
    handleLike,
    handleDelete,
    closeAll,
  };
}
