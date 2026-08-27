/**
 * 划线批注后端路由
 * 职责：划线和批注的 CRUD、点赞、热门划线查询
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface AnnotationRecord {
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

interface AnnotationStore {
  annotations: AnnotationRecord[];
}

export interface AnnotationService {
  getAnnotations(novelId: string, chapterNumber: number): AnnotationRecord[];
  addAnnotation(annotation: Omit<AnnotationRecord, 'id' | 'createdAt' | 'likeCount'>): AnnotationRecord;
  deleteAnnotation(id: string, userId: string): boolean;
  likeAnnotation(id: string): boolean;
}

export function createAnnotationService(dataDir: string): AnnotationService {
  const storePath = path.join(dataDir, 'annotations.json');

  function loadStore(): AnnotationStore {
    try {
      if (!fs.existsSync(storePath)) return { annotations: [] };
      return JSON.parse(fs.readFileSync(storePath, 'utf-8')) as AnnotationStore;
    } catch {
      return { annotations: [] };
    }
  }

  function saveStore(store: AnnotationStore) {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  return {
    getAnnotations(novelId, chapterNumber) {
      const store = loadStore();
      return store.annotations.filter(
        (a) => a.novelId === novelId && a.chapterNumber === chapterNumber,
      );
    },

    addAnnotation(annotation) {
      const store = loadStore();
      const record: AnnotationRecord = {
        ...annotation,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        likeCount: 0,
      };
      store.annotations.push(record);
      saveStore(store);
      return record;
    },

    deleteAnnotation(id, userId) {
      const store = loadStore();
      const idx = store.annotations.findIndex((a) => a.id === id && a.userId === userId);
      if (idx < 0) return false;
      store.annotations.splice(idx, 1);
      saveStore(store);
      return true;
    },

    likeAnnotation(id) {
      const store = loadStore();
      const target = store.annotations.find((a) => a.id === id);
      if (!target) return false;
      target.likeCount++;
      saveStore(store);
      return true;
    },
  };
}

export function createAnnotationRouter(annotationService: AnnotationService) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as { id?: string } | undefined;
    return auth?.id;
  }

  // 获取章节划线列表
  router.get('/:novelId/chapters/:chapterNumber', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const novelId = String(req.params.novelId);
    const chapterNumber = Number(req.params.chapterNumber);

    if (!novelId || Number.isNaN(chapterNumber)) {
      res.status(400).json({ error: 'Invalid parameters' });
      return;
    }

    const all = annotationService.getAnnotations(novelId, chapterNumber);
    // 返回当前用户的划线 + 公开划线
    const annotations = all.filter(
      (a) => a.visibility === 'public' || a.userId === userId,
    );

    res.json({ annotations });
  });

  // 添加划线/批注
  router.post('/', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      novelId,
      chapterNumber,
      paragraphIndex,
      startOffset,
      endOffset,
      textHash,
      selectedText,
      type,
      note,
      visibility,
    } = req.body ?? {};

    if (!novelId || chapterNumber == null || paragraphIndex == null ||
        startOffset == null || endOffset == null || !textHash || !selectedText) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const annotation = annotationService.addAnnotation({
      novelId,
      chapterNumber: Number(chapterNumber),
      paragraphIndex: Number(paragraphIndex),
      startOffset: Number(startOffset),
      endOffset: Number(endOffset),
      textHash,
      selectedText,
      type: type === 'note' ? 'note' : 'highlight',
      note: note ?? undefined,
      visibility: visibility === 'private' ? 'private' : 'public',
      userId,
    });

    res.json({ annotation });
  });

  // 删除划线
  router.delete('/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ok = annotationService.deleteAnnotation(String(req.params.id), userId);
    if (!ok) {
      res.status(404).json({ error: 'Annotation not found' });
      return;
    }
    res.json({ ok: true });
  });

  // 点赞划线
  router.post('/:id/like', (req: Request, res: Response) => {
    const ok = annotationService.likeAnnotation(String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Annotation not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
