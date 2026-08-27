import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { createBookStoreRoutes } from './bookstore.js';

// 评论功能默认关闭（.env: COMMENT_ENABLED=false），评论审核用例需要开启才能走到审核逻辑。
// 此处先于首次 getConfig() 调用设置，使缓存的配置中 commentEnabled=true。
process.env.COMMENT_ENABLED = 'true';

function getRouteHandler(router: any, method: 'get' | 'post' | 'put' | 'delete', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    headers: {},
    query: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as Request;
}

function mockResponse(): Response & { statusCode: number; body?: unknown } {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response as Response & { statusCode: number; body?: unknown };
}

describe('bookstore routes', () => {
  it('returns chapter management summary for the owner', async () => {
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 1,
            status: 'published',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
            publishedAt: new Date('2026-03-14T00:20:00.000Z'),
          },
          {
            chapterNumber: 2,
            status: 'scheduled',
            submittedAt: new Date('2026-03-14T00:30:00.000Z'),
            scheduledAt: new Date('2026-03-15T08:00:00.000Z'),
          },
          {
            chapterNumber: 3,
            status: 'hidden',
            submittedAt: new Date('2026-03-14T00:40:00.000Z'),
          },
          {
            chapterNumber: 5,
            status: 'pending_audit',
            submittedAt: new Date('2026-03-14T00:50:00.000Z'),
          },
        ]),
      } as any,
      {} as any,
      {
        listChapterPage: vi.fn().mockResolvedValue({
          total: 5,
          page: 1,
          pageSize: 100,
          hasMore: false,
          items: [
            { chapterNumber: 1, title: '第1章', wordCount: 1200, updatedAt: '2026-03-14T00:00:00.000Z' },
            { chapterNumber: 2, title: '第2章', wordCount: 1300, updatedAt: '2026-03-14T00:00:00.000Z' },
            { chapterNumber: 3, title: '第3章', wordCount: 1400, updatedAt: '2026-03-14T00:00:00.000Z' },
            { chapterNumber: 4, title: '第4章', wordCount: 1500, updatedAt: '2026-03-14T00:00:00.000Z' },
            { chapterNumber: 5, title: '第5章', wordCount: 1600, updatedAt: '2026-03-14T00:00:00.000Z' },
          ],
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'get', '/:id/manage/chapters');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      bookId: 'book-1',
      novelId: 'novel-1',
      summary: {
        total: 5,
        published: 1,
        scheduled: 1,
        pendingAudit: 1,
        hidden: 1,
        unpublished: 1,
        lastPublishedChapterNumber: 1,
        nextScheduledAt: '2026-03-15T08:00:00.000Z',
      },
    });
    expect((res.body as any).items.map((item: any) => [item.chapterNumber, item.status])).toEqual([
      [1, 'published'],
      [2, 'scheduled'],
      [3, 'hidden'],
      [4, 'unpublished'],
      [5, 'pending_audit'],
    ]);
  });

  it('rejects admin book listing for non-admin users', async () => {
    const adminListBooks = vi.fn();
    const router = createBookStoreRoutes(
      {
        adminListBooks,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'get', '/admin/books');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(adminListBooks).not.toHaveBeenCalled();
  });

  it('rejects admin auto update access for non-admin users', async () => {
    const getBookAutoUpdate = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Book 1',
          publishStatus: 'approved',
        }),
      } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      {
        getBookAutoUpdate,
      } as any,
    );
    const handler = getRouteHandler(router, 'get', '/admin/books/:id/auto-update');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getBookAutoUpdate).not.toHaveBeenCalled();
  });

  it('allows admins to update auto update config', async () => {
    const updateBookAutoUpdate = vi.fn().mockResolvedValue({
      enabled: true,
      timeOfDay: '08:30',
      timezone: 'Asia/Shanghai',
      maxWordCount: 3200,
      userDirection: '推进主线',
      updatedAt: new Date('2026-03-23T00:00:00.000Z'),
      updatedBy: 'admin-1',
      queue: [],
      history: [],
    });
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Book 1',
          publishStatus: 'approved',
        }),
      } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      {
        updateBookAutoUpdate,
      } as any,
    );
    const handler = getRouteHandler(router, 'put', '/admin/books/:id/auto-update');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: {
          enabled: true,
          timeOfDay: '08:30',
          timezone: 'Asia/Shanghai',
          maxWordCount: 3200,
          userDirection: '推进主线',
        },
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(updateBookAutoUpdate).toHaveBeenCalledWith('book-1', {
      enabled: true,
      timeOfDay: '08:30',
      timezone: 'Asia/Shanghai',
      maxWordCount: 3200,
      userDirection: '推进主线',
    }, 'admin-1');
    expect(res.body).toMatchObject({
      bookId: 'book-1',
      novelId: 'novel-1',
      title: 'Book 1',
    });
  });

  it('rejects run-now for books that are not currently approved', async () => {
    const runNow = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Book 1',
          publishStatus: 'offline',
        }),
      } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      {
        runNow,
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/admin/books/:id/auto-update/run-now');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(runNow).not.toHaveBeenCalled();
  });

  it('uses the storefront default sort when the public list request does not provide one', async () => {
    const listBooks = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    const router = createBookStoreRoutes(
      {
        listBooks,
      } as any,
      {} as any,
      {
        getInteractiveFlagsByNovelIds: vi.fn().mockResolvedValue(new Map()),
      } as any,
      undefined,
      undefined,
      undefined,
      {
        getConfig: vi.fn().mockResolvedValue({
          defaultSort: 'hot',
          updatedAt: new Date('2026-03-23T00:00:00.000Z'),
          updatedBy: 'admin-1',
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'get', '/list');
    const res = mockResponse();

    await handler(
      mockRequest({
        query: { page: '1', pageSize: '20' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(listBooks).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      sort: 'hot',
    });
    expect(res.body).toMatchObject({
      items: [],
      appliedSort: 'hot',
    });
  });

  it('rejects storefront config access for non-admin users', async () => {
    const getConfig = vi.fn();
    const router = createBookStoreRoutes(
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      {
        getConfig,
      } as any,
    );
    const handler = getRouteHandler(router, 'get', '/admin/storefront-config');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('allows admins to update storefront config', async () => {
    const updateConfig = vi.fn().mockResolvedValue({
      defaultSort: 'new',
      updatedAt: new Date('2026-03-23T00:00:00.000Z'),
      updatedBy: 'admin-1',
    });
    const router = createBookStoreRoutes(
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      {
        updateConfig,
      } as any,
    );
    const handler = getRouteHandler(router, 'put', '/admin/storefront-config');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: { defaultSort: 'new' },
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(updateConfig).toHaveBeenCalledWith({ defaultSort: 'new' }, 'admin-1');
    expect(res.body).toMatchObject({ defaultSort: 'new' });
  });

  it('hides internal review fields from public book detail responses', async () => {
    const incrementViewCount = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          title: 'Public Book',
          publishStatus: 'approved',
          auditStatus: 'pass',
          auditResult: 'ok',
          auditTime: '2026-03-14T00:00:00.000Z',
          offlineReason: 'none',
          offlineTime: '2026-03-14T00:00:00.000Z',
          coverAuditStatus: 'pass',
          coverLocked: false,
          coverAuditRejectReason: null,
          likedBy: ['u1'],
          favoritedBy: ['u2'],
        }),
        incrementViewCount,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'get', '/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(incrementViewCount).toHaveBeenCalledWith('book-1');
    expect(res.body).toMatchObject({
      id: 'book-1',
      novelId: 'novel-1',
      title: 'Public Book',
      publishStatus: 'approved',
    });
    // userId 对公开详情可见（用于作者等级徽章）
    expect(res.body).toHaveProperty('userId', 'author-1');
    expect(res.body).not.toHaveProperty('auditStatus');
    expect(res.body).not.toHaveProperty('likedBy');
  });

  it('hides public reader chapter list when the book is not approved', async () => {
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'pending',
        }),
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'get', '/:id/reader/chapters');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('blocks public reader access to an unpublished chapter when other chapters are already published', async () => {
    const getChapter = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 1,
            status: 'published',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
            publishedAt: new Date('2026-03-14T00:20:00.000Z'),
          },
        ]),
      } as any,
      {} as any,
      {
        getChapter,
      } as any,
    );
    const handler = getRouteHandler(router, 'get', '/:id/reader/chapters/:chapterNumber');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1', chapterNumber: '2' },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(getChapter).not.toHaveBeenCalled();
  });

  it('requires login before liking a book', async () => {
    const toggleLike = vi.fn();
    const router = createBookStoreRoutes(
      {
        toggleLike,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/like');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(toggleLike).not.toHaveBeenCalled();
  });

  it('returns false for like status when the user is anonymous', async () => {
    const hasLiked = vi.fn();
    const router = createBookStoreRoutes(
      {
        hasLiked,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'get', '/:id/like-status');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
    expect(hasLiked).not.toHaveBeenCalled();
  });

  it('passes the admin flag when deleting a comment', async () => {
    const removeComment = vi.fn().mockResolvedValue({ removed: true });
    const router = createBookStoreRoutes(
      {
        removeComment,
        getBook: vi.fn().mockResolvedValue({ id: 'book-1', novelId: 'novel-1', title: 'Book 1' }),
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'delete', '/:id/comments/:commentId');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1', commentId: 'comment-1' },
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(removeComment).toHaveBeenCalledWith('book-1', 'comment-1', 'admin-1', true);
    expect(res.body).toMatchObject({ success: true, removed: true });
  });

  it('blocks abusive comments before publishing', async () => {
    const addComment = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Book 1',
        }),
        addComment,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/comments');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: { content: '你这个傻逼别来了' },
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'COMMENT_CONTENT_BLOCKED' });
    expect(addComment).not.toHaveBeenCalled();
  });

  it('blocks comments flagged by the content audit service', async () => {
    const addComment = vi.fn();
    const auditText = vi.fn().mockResolvedValue({
      violations: [
        {
          type: 'ad',
          confidence: 72,
          position: { start: 0, end: 4 },
          keyword: '加我微信',
          context: '加我微信领取福利',
        },
      ],
      overallScore: 72,
      suggestion: 'review',
    });
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Book 1',
        }),
        addComment,
      } as any,
      {} as any,
      {} as any,
      {
        auditText,
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/comments');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: { content: '加我微信领取福利' },
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'COMMENT_CONTENT_BLOCKED' });
    expect(auditText).toHaveBeenCalledTimes(1);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('rejects publishing a novel without a cover image', async () => {
    const publishBook = vi.fn();
    const enqueue = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBookByNovelId: vi.fn().mockResolvedValue(null),
        getUserBooks: vi.fn().mockResolvedValue([]),
        publishBook,
      } as any,
      {
        enqueue,
      } as any,
      {
        getNovel: vi.fn().mockResolvedValue({
          id: 'novel-1',
          title: 'Novel 1',
          ownerId: 'author-1',
          coverImage: '',
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/publish');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: { novelId: 'novel-1', category: 'fantasy', description: 'desc', tags: ['tag'] },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(publishBook).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps regular users subject to the monthly publish limit', async () => {
    const publishBook = vi.fn();
    const enqueue = vi.fn();
    const now = new Date();
    const currentMonthPublishTime = new Date(now.getFullYear(), now.getMonth(), 2);
    const getNovel = vi.fn().mockImplementation(async (novelId: string) => {
      if (novelId === 'novel-1') {
        return {
          id: 'novel-1',
          title: 'Novel 1',
          ownerId: 'author-1',
          coverImage: '/cover.png',
        };
      }
      return { id: novelId, chapterCount: 0 };
    });
    const router = createBookStoreRoutes(
      {
        getBookByNovelId: vi.fn().mockResolvedValue(null),
        getUserBooks: vi.fn().mockResolvedValue([
          {
            id: 'book-old-1',
            novelId: 'book-old-novel-1',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
          {
            id: 'book-old-2',
            novelId: 'book-old-novel-2',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
          {
            id: 'book-old-3',
            novelId: 'book-old-novel-3',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
          {
            id: 'book-old-4',
            novelId: 'book-old-novel-4',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
        ]),
        publishBook,
      } as any,
      {
        enqueue,
      } as any,
      {
        getNovel,
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/publish');
    const res = mockResponse();
    await handler(
      mockRequest({
        body: { novelId: 'novel-1', category: 'fantasy', description: 'desc', tags: ['tag'] },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: 'PUBLISH_MONTHLY_LIMIT' });
    expect(publishBook).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('allows admins to publish even when cooldown and monthly limits are active', async () => {
    const publishBook = vi.fn().mockResolvedValue({
      id: 'book-1',
      auditStatus: 'pass',
    });
    const enqueue = vi.fn();
    const now = new Date();
    const currentMonthPublishTime = new Date(now.getFullYear(), now.getMonth(), 2);
    const getNovel = vi.fn().mockImplementation(async (novelId: string) => {
      if (novelId === 'novel-1') {
        return {
          id: 'novel-1',
          title: 'Novel 1',
          ownerId: 'author-1',
          coverImage: '/cover.png',
        };
      }
      return { id: novelId, chapterCount: 0 };
    });
    const execute = vi.fn().mockResolvedValue([[
      {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        creator_status: 'approved',
        creator_applied_at: null,
        creator_approved_at: null,
        creator_rejected_at: null,
        creator_reject_reason: null,
        real_name_verified_at: null,
        real_name_masked: null,
        real_name_id_number_masked: null,
        real_name_phone_masked: null,
        phone: '',
        pen_name: 'Admin',
        avatar_url: null,
        bio: null,
        email: null,
        created_at: now,
      },
    ], []]);
    const router = createBookStoreRoutes(
      {
        getBookByNovelId: vi.fn().mockResolvedValue(null),
        getUserBooks: vi.fn().mockResolvedValue([
          {
            id: 'book-old-1',
            novelId: 'book-old-novel-1',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
          {
            id: 'book-old-2',
            novelId: 'book-old-novel-2',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
          {
            id: 'book-old-3',
            novelId: 'book-old-novel-3',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
          {
            id: 'book-old-4',
            novelId: 'book-old-novel-4',
            publishStatus: 'approved',
            publishTime: currentMonthPublishTime,
          },
        ]),
        publishBook,
      } as any,
      {
        enqueue,
      } as any,
      {
        getNovel,
      } as any,
      undefined,
      {
        execute,
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/publish');
    const res = mockResponse();
    await handler(
      mockRequest({
        body: { novelId: 'novel-1', category: 'fantasy', description: 'desc', tags: ['tag'] },
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      bookstoreId: 'book-1',
      auditStatus: 'pass',
    });
    expect(publishBook).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('blocks risky public book fields before publishing', async () => {
    const publishBook = vi.fn();
    const enqueue = vi.fn();
    const auditText = vi.fn().mockResolvedValue({
      violations: [
        {
          type: 'ad',
          confidence: 76,
          position: { start: 0, end: 4 },
          keyword: '加我微信',
          context: '加我微信领福利',
        },
      ],
      overallScore: 76,
      suggestion: 'review',
    });
    const router = createBookStoreRoutes(
      {
        getBookByNovelId: vi.fn().mockResolvedValue(null),
        getUserBooks: vi.fn().mockResolvedValue([]),
        publishBook,
      } as any,
      {
        enqueue,
      } as any,
      {
        getNovel: vi.fn().mockResolvedValue({
          id: 'novel-1',
          title: 'Novel 1',
          ownerId: 'author-1',
          coverImage: '/cover.png',
        }),
      } as any,
      {
        auditText,
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/publish');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: { novelId: 'novel-1', category: '奇幻', description: '加我微信领福利', tags: ['连载'] },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'BOOK_PUBLIC_TEXT_BLOCKED' });
    expect(publishBook).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('blocks risky public book fields before updating', async () => {
    const updateBook = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Book 1',
        }),
        updateBook,
      } as any,
      {} as any,
      {} as any,
      {
        auditText: vi.fn().mockResolvedValue({
          violations: [
            {
              type: 'abuse',
              confidence: 90,
              position: { start: 0, end: 2 },
              keyword: '废物',
              context: '废物新书',
            },
          ],
          overallScore: 90,
          suggestion: 'block',
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'put', '/:id/update');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: { title: '废物新书' },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'BOOK_PUBLIC_TEXT_BLOCKED' });
    expect(updateBook).not.toHaveBeenCalled();
  });

  it('requires a reason when rejecting cover audit', async () => {
    const updateCoverAuditStatus = vi.fn();
    const router = createBookStoreRoutes(
      {
        updateCoverAuditStatus,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/cover-audit/reject');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: {},
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(updateCoverAuditStatus).not.toHaveBeenCalled();
  });

  it('rejects duplicate immediate publish when the chapter is already published or under audit', async () => {
    const submitChapterForAudit = vi.fn();
    const enqueue = vi.fn();
    const getChapter = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 2,
            status: 'pending_audit',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
          },
        ]),
        submitChapterForAudit,
      } as any,
      {
        enqueue,
      } as any,
      {
        getChapter,
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/chapters/:chapterNumber/publish');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1', chapterNumber: '2' },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(submitChapterForAudit).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(getChapter).not.toHaveBeenCalled();
  });

  it('publishes multiple chapters in one batch request', async () => {
    const submitChaptersForAuditBatch = vi.fn();
    const markChapterPublished = vi.fn().mockResolvedValue(undefined);
    const enqueueBatch = vi.fn().mockResolvedValue([
      { jobId: 'job-1', position: 1 },
      { jobId: 'job-3', position: 2 },
    ]);
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 2,
            status: 'pending_audit',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
          },
        ]),
        submitChaptersForAuditBatch,
        markChapterPublished,
      } as any,
      {
        enqueueBatch,
      } as any,
      {
        getChapter: vi.fn().mockImplementation(async (_novelId: string, chapterNumber: number) => {
          if (chapterNumber === 1 || chapterNumber === 3) {
            return {
              chapterNumber,
              title: `Chapter ${chapterNumber}`,
              content: `content-${chapterNumber}`,
            };
          }
          return null;
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/chapters/publish-batch');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: { chapterNumbers: [1, 2, 3] },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      successCount: 2,
      failureCount: 1,
    });
    expect((res.body as any).results).toHaveLength(3);
    expect((res.body as any).results).toEqual(expect.arrayContaining([
      // 演示模式下批量发布直接标记为已发布，results 仅含 chapterNumber/success
      expect.objectContaining({ chapterNumber: 1, success: true }),
      expect.objectContaining({ chapterNumber: 2, success: false }),
      expect.objectContaining({ chapterNumber: 3, success: true }),
    ]));
    expect(submitChaptersForAuditBatch).toHaveBeenCalledTimes(1);
    expect(submitChaptersForAuditBatch).toHaveBeenCalledWith('book-1', [
      { chapterNumber: 1, contentHash: BookStoreManager.hashContent('content-1') },
      { chapterNumber: 3, contentHash: BookStoreManager.hashContent('content-3') },
    ]);
    // 演示模式：批量发布直接标记为已发布（submitChaptersForAuditBatch + markChapterPublished），不走 auditQueueManager.enqueueBatch
    expect(markChapterPublished).toHaveBeenCalledTimes(2);
    expect(markChapterPublished).toHaveBeenCalledWith('book-1', 1);
    expect(markChapterPublished).toHaveBeenCalledWith('book-1', 3);
  });

  it('schedules a chapter for future publication', async () => {
    const scheduleChapterPublication = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([]),
        scheduleChapterPublication,
      } as any,
      {} as any,
      {
        getChapter: vi.fn().mockResolvedValue({
          chapterNumber: 3,
          title: '第3章',
          content: 'future chapter',
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/chapters/:chapterNumber/schedule');
    const res = mockResponse();
    const scheduledAt = '2099-01-01T08:00:00.000Z';

    await handler(
      mockRequest({
        params: { id: 'book-1', chapterNumber: '3' },
        body: { scheduledAt },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      chapterNumber: 3,
      status: 'scheduled',
      scheduledAt,
    });
    expect(scheduleChapterPublication).toHaveBeenCalledTimes(1);
    expect(scheduleChapterPublication).toHaveBeenCalledWith(
      'book-1',
      3,
      BookStoreManager.hashContent('future chapter'),
      expect.any(Date),
    );
    expect(scheduleChapterPublication.mock.calls[0][3].toISOString()).toBe(scheduledAt);
  });

  it('schedules multiple chapters in one batch request', async () => {
    const scheduleChaptersPublicationBatch = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 4,
            status: 'published',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
            publishedAt: new Date('2026-03-14T00:20:00.000Z'),
          },
        ]),
        scheduleChaptersPublicationBatch,
      } as any,
      {} as any,
      {
        getChapter: vi.fn().mockImplementation(async (_novelId: string, chapterNumber: number) => {
          if (chapterNumber === 2 || chapterNumber === 3) {
            return {
              chapterNumber,
              title: `Chapter ${chapterNumber}`,
              content: `future-${chapterNumber}`,
            };
          }
          return null;
        }),
      } as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/chapters/schedule-batch');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: {
          items: [
            { chapterNumber: 2, scheduledAt: '2099-01-01T08:00:00.000Z' },
            { chapterNumber: 3, scheduledAt: '2099-01-01T08:30:00.000Z' },
            { chapterNumber: 4, scheduledAt: '2099-01-01T09:00:00.000Z' },
          ],
        },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      successCount: 2,
      failureCount: 1,
    });
    expect((res.body as any).results).toHaveLength(3);
    expect((res.body as any).results).toEqual(expect.arrayContaining([
      expect.objectContaining({ chapterNumber: 2, success: true, status: 'scheduled' }),
      expect.objectContaining({ chapterNumber: 3, success: true, status: 'scheduled' }),
      expect.objectContaining({ chapterNumber: 4, success: false }),
    ]));
    expect(scheduleChaptersPublicationBatch).toHaveBeenCalledTimes(1);
    expect(scheduleChaptersPublicationBatch).toHaveBeenCalledWith('book-1', [
      {
        chapterNumber: 2,
        contentHash: BookStoreManager.hashContent('future-2'),
        scheduledAt: expect.any(Date),
      },
      {
        chapterNumber: 3,
        contentHash: BookStoreManager.hashContent('future-3'),
        scheduledAt: expect.any(Date),
      },
    ]);
  });

  it('blocks schedule cancellation for non-owners', async () => {
    const cancelScheduledChapter = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        cancelScheduledChapter,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'delete', '/:id/chapters/:chapterNumber/schedule');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1', chapterNumber: '3' },
        auth: { id: 'other-user', role: 'user', username: 'other-user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(cancelScheduledChapter).not.toHaveBeenCalled();
  });

  it('cancels multiple scheduled chapters in one batch request', async () => {
    const cancelScheduledChaptersBatch = vi.fn();
    const router = createBookStoreRoutes(
      {
        getBook: vi.fn().mockResolvedValue({
          id: 'book-1',
          novelId: 'novel-1',
          userId: 'author-1',
          publishStatus: 'approved',
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 2,
            status: 'scheduled',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
            scheduledAt: new Date('2099-01-01T08:00:00.000Z'),
          },
          {
            chapterNumber: 3,
            status: 'scheduled',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
            scheduledAt: new Date('2099-01-01T08:30:00.000Z'),
          },
          {
            chapterNumber: 4,
            status: 'published',
            submittedAt: new Date('2026-03-14T00:10:00.000Z'),
            publishedAt: new Date('2026-03-14T00:20:00.000Z'),
          },
        ]),
        cancelScheduledChaptersBatch,
      } as any,
      {} as any,
      {} as any,
    );
    const handler = getRouteHandler(router, 'post', '/:id/chapters/cancel-schedule-batch');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'book-1' },
        body: { chapterNumbers: [2, 3, 4] },
        auth: { id: 'author-1', role: 'user', username: 'author-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      successCount: 2,
      failureCount: 1,
    });
    expect((res.body as any).results).toHaveLength(3);
    expect((res.body as any).results).toEqual(expect.arrayContaining([
      expect.objectContaining({ chapterNumber: 2, success: true, status: 'hidden' }),
      expect.objectContaining({ chapterNumber: 3, success: true, status: 'hidden' }),
      expect.objectContaining({ chapterNumber: 4, success: false }),
    ]));
    expect(cancelScheduledChaptersBatch).toHaveBeenCalledTimes(1);
    expect(cancelScheduledChaptersBatch).toHaveBeenCalledWith('book-1', [2, 3]);
  });
});
