import { describe, expect, it, vi } from 'vitest';
import { ZhihuPostAssistantService } from './zhihu-post-assistant-service.js';
import type { ModelClient } from '../models/types.js';

describe('ZhihuPostAssistantService', () => {
  it('builds a knowledge snapshot from platform features and recent assets', async () => {
    const service = new ZhihuPostAssistantService({
      novelManager: {
        listNovels: vi.fn().mockResolvedValue([
          {
            id: 'novel-1',
            title: '测试长篇一',
            genre: 'fantasy',
            status: 'writing',
            synopsis: '这是第一本测试小说。',
            chapterCount: 12,
            createdAt: '2026-03-10T08:00:00.000Z',
            updatedAt: '2026-03-14T08:00:00.000Z',
          },
        ]),
      },
      bookStoreManager: {
        adminListBooks: vi.fn().mockResolvedValue([
          {
            id: 'book-1',
            novelId: 'novel-1',
            title: '测试上架书',
            category: '玄幻',
            publishStatus: 'approved',
            description: '书城里的测试作品。',
            tags: ['升级', '热血'],
            publishTime: new Date('2026-03-13T08:00:00.000Z'),
            updateTime: new Date('2026-03-14T09:00:00.000Z'),
            viewCount: 42,
          },
        ]),
      },
      modelClient: {
        provider: 'openai',
        model: 'test-model',
        chat: vi.fn(),
        chatStream: vi.fn(),
      } as unknown as ModelClient,
    });

    const snapshot = await service.getKnowledgeSnapshot();

    expect(snapshot.counts.publicFeatures).toBeGreaterThan(0);
    expect(snapshot.counts.novels).toBe(1);
    expect(snapshot.counts.books).toBe(1);
    expect(snapshot.counts.approvedBooks).toBe(1);
    expect(snapshot.recentNovels[0]?.title).toBe('测试长篇一');
    expect(snapshot.recentBooks[0]?.publishStatusLabel).toBe('已上架');
  });

  it('injects the knowledge snapshot into chat generation', async () => {
    const modelClient: ModelClient = {
      provider: 'openai',
      model: 'test-model',
      chat: vi.fn().mockResolvedValue({
        content: '这是知乎草稿。',
        model: 'test-model',
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
      chatStream: vi.fn(),
    };

    const service = new ZhihuPostAssistantService({
      novelManager: {
        listNovels: vi.fn().mockResolvedValue([
          {
            id: 'novel-2',
            title: '上新小说',
            genre: 'modern',
            status: 'published',
            synopsis: '都市方向测试作品。',
            chapterCount: 6,
            createdAt: '2026-03-11T08:00:00.000Z',
            updatedAt: '2026-03-14T10:00:00.000Z',
          },
        ]),
      },
      bookStoreManager: {
        adminListBooks: vi.fn().mockResolvedValue([]),
      },
      modelClient,
    });

    const result = await service.chat({
      message: '根据现在的平台功能写一篇知乎回答。',
      history: [{ role: 'user', content: '先偏产品视角。' }],
      outputMode: 'answer',
    });

    expect(result.reply).toBe('这是知乎草稿。');
    expect(modelClient.chat).toHaveBeenCalledTimes(1);
    const [messages] = vi.mocked(modelClient.chat).mock.calls[0]!;
    expect(messages[1]?.content).toContain('上新小说');
    expect(messages[messages.length - 1]?.content).toBe('根据现在的平台功能写一篇知乎回答。');
  });

  it('adds mode and selected context instructions into chat generation', async () => {
    const modelClient: ModelClient = {
      provider: 'openai',
      model: 'test-model',
      chat: vi.fn().mockResolvedValue({
        content: '这是提纲。',
        model: 'test-model',
        usage: { inputTokens: 12, outputTokens: 18 },
      }),
      chatStream: vi.fn(),
    };

    const service = new ZhihuPostAssistantService({
      novelManager: {
        listNovels: vi.fn().mockResolvedValue([
          {
            id: 'novel-3',
            title: '指定小说',
            genre: 'fantasy',
            status: 'writing',
            synopsis: '用于测试选择器的小说。',
            chapterCount: 18,
            createdAt: '2026-03-10T08:00:00.000Z',
            updatedAt: '2026-03-14T08:00:00.000Z',
          },
        ]),
      },
      bookStoreManager: {
        adminListBooks: vi.fn().mockResolvedValue([
          {
            id: 'book-3',
            novelId: 'novel-3',
            title: '指定书城作品',
            category: '玄幻',
            publishStatus: 'approved',
            description: '用于测试选择器的书城作品。',
            tags: ['成长'],
            publishTime: new Date('2026-03-13T08:00:00.000Z'),
            updateTime: new Date('2026-03-14T09:00:00.000Z'),
            viewCount: 100,
          },
        ]),
      },
      modelClient,
    });

    await service.chat({
      message: '请先给我知乎提纲。',
      outputMode: 'outline',
      selectedFeatureIds: ['chapter-generate'],
      selectedNovelIds: ['novel-3'],
      selectedBookIds: ['book-3'],
    });

    const [messages] = vi.mocked(modelClient.chat).mock.calls[0]!;
    expect(messages[2]?.content).toContain('知乎提纲');
    expect(messages[3]?.content).toContain('指定小说');
    expect(messages[3]?.content).toContain('指定书城作品');
    expect(messages[3]?.content).toContain('章节生成');
  });
});
