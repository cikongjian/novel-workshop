import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { http } from '../api/http';

export interface Annotation {
  id: string;
  novelId: string;
  chapterNumber: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  textHash: string;
  selectedText: string;
  type: 'highlight' | 'note';
  note?: string;
  visibility: 'public' | 'private';
  userId: string;
  createdAt: string;
  likeCount: number;
}

export interface RichSegment {
  text: string;
  isHighlighted: boolean;
  annotationCount: number;
  annotationId?: string;
}

export function useTextAnnotation(
  novelId: Ref<string>,
  chapterNumber: Ref<number | null>,
  paragraphs: Ref<string[]>,
) {
  const annotations = ref<Annotation[]>([]);
  const loading = ref(false);

  const richParagraphs: ComputedRef<RichSegment[][]> = computed(() => {
    return paragraphs.value.map((para, pIdx) => {
      const paraAnnotations = annotations.value.filter(
        (a) => a.paragraphIndex === pIdx,
      );
      if (!paraAnnotations.length) {
        return [{ text: para, isHighlighted: false, annotationCount: 0 }];
      }

      const sorted = [...paraAnnotations].sort((a, b) => a.startOffset - b.startOffset);
      const segments: RichSegment[] = [];
      let pos = 0;

      for (const a of sorted) {
        if (a.startOffset > pos) {
          segments.push({
            text: para.slice(pos, a.startOffset),
            isHighlighted: false,
            annotationCount: 0,
          });
        }
        segments.push({
          text: para.slice(a.startOffset, a.endOffset),
          isHighlighted: true,
          annotationCount: 1,
          annotationId: a.id,
        });
        pos = a.endOffset;
      }
      if (pos < para.length) {
        segments.push({
          text: para.slice(pos),
          isHighlighted: false,
          annotationCount: 0,
        });
      }

      const merged: RichSegment[] = [];
      for (const seg of segments) {
        const last = merged[merged.length - 1];
        if (last?.isHighlighted && seg.isHighlighted) {
          last.text += seg.text;
          last.annotationCount += seg.annotationCount;
        } else {
          merged.push(seg);
        }
      }
      return merged.length ? merged : [{ text: para, isHighlighted: false, annotationCount: 0 }];
    });
  });

  function getAnnotationCountForParagraph(paragraphIndex: number): number {
    return annotations.value.filter((a) => a.paragraphIndex === paragraphIndex).length;
  }

  async function fetchAnnotations() {
    const nid = novelId.value;
    const cn = chapterNumber.value;
    if (!nid || cn == null) return;
    loading.value = true;
    try {
      const { data } = await http.get(`/annotations/${nid}/chapters/${cn}`);
      annotations.value = (data.annotations ?? []) as Annotation[];
    } catch {
      // 静默
    } finally {
      loading.value = false;
    }
  }

  async function addAnnotation(payload: {
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    textHash: string;
    selectedText: string;
    type: 'highlight' | 'note';
    note?: string;
    visibility?: 'public' | 'private';
  }): Promise<Annotation | null> {
    const nid = novelId.value;
    const cn = chapterNumber.value;
    if (!nid || cn == null) return null;
    try {
      const { data } = await http.post('/annotations', {
        novelId: nid,
        chapterNumber: cn,
        ...payload,
      });
      const created = data.annotation as Annotation;
      annotations.value = [created, ...annotations.value];
      return created;
    } catch {
      return null;
    }
  }

  async function deleteAnnotation(id: string) {
    try {
      await http.delete(`/annotations/${id}`);
      annotations.value = annotations.value.filter((a) => a.id !== id);
    } catch {
      // 静默
    }
  }

  async function likeAnnotation(id: string) {
    const target = annotations.value.find((a) => a.id === id);
    if (!target) return;
    try {
      await http.post(`/annotations/${id}/like`);
      target.likeCount++;
    } catch {
      // 静默
    }
  }

  function getAnnotationsForSpan(paragraphIndex: number, startOffset: number, endOffset: number): Annotation[] {
    return annotations.value.filter(
      (a) =>
        a.paragraphIndex === paragraphIndex &&
        a.startOffset === startOffset &&
        a.endOffset === endOffset,
    );
  }

  return {
    annotations,
    loading,
    richParagraphs,
    fetchAnnotations,
    addAnnotation,
    deleteAnnotation,
    likeAnnotation,
    getAnnotationCountForParagraph,
    getAnnotationsForSpan,
  };
}
