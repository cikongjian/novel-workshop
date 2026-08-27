/**
 * 统一记忆编排器 — 测试
 */
import { describe, it, expect, vi } from 'vitest';
import type { MemoryItem, MemorySource, MemorySourceAdapter, OrchestratorParams } from './types.js';
import { DEFAULT_SCORING_WEIGHTS } from './types.js';
import { scoreItem, scoreAndSort, resolveSourceWeights, computeFreshness } from './scoring.js';
import { deduplicateItems } from './dedup.js';
import { MemoryOrchestrator } from './orchestrator.js';
import { PreviousChapterAdapter } from './adapters.js';

// ────────────────────────────── 测试工具 ──────────────────────────────

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'test:test:1',
    source: 'vector:chapter',
    entityId: 'ch1',
    chapterNumber: 1,
    text: '测试文本内容，用于验证编排器功能。',
    charCount: 16,
    relevance: 0.8,
    freshness: 0.9,
    isCritical: false,
    unresolvedWeight: 0,
    provenance: 'test/ch1',
    ...overrides,
  };
}

function makeParams(overrides: Partial<OrchestratorParams> = {}): OrchestratorParams {
  return {
    novelId: 'novel-1',
    userDirection: '主角决定进入禁地',
    outlineContent: '第10章：张三带领队伍进入禁地',
    chapterNumber: 10,
    chapterCount: 50,
    previousChapterContext: '上一章内容...',
    ...overrides,
  };
}

/** 创建简单的 mock 适配器 */
function mockAdapter(
  name: string,
  sources: MemorySource[],
  items: MemoryItem[],
): MemorySourceAdapter {
  return {
    name,
    sources,
    retrieve: vi.fn().mockResolvedValue(items),
  };
}

// ────────────────────────────── scoring.ts ──────────────────────────────

describe('computeFreshness', () => {
  it('returns 1.0 for same chapter', () => {
    expect(computeFreshness(10, 10)).toBe(1.0);
  });

  it('returns 1.0 for distance <= 10', () => {
    expect(computeFreshness(5, 10)).toBe(1.0);
  });

  it('returns gradually lower for distance 10-30', () => {
    const f = computeFreshness(1, 25); // distance=24
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(1.0);
  });

  it('returns 0.2 floor for very distant chapters', () => {
    expect(computeFreshness(1, 100)).toBe(0.2);
  });

  it('returns 0.5 for chapterNumber=0 (no temporal info)', () => {
    expect(computeFreshness(0, 10)).toBe(0.5);
  });
});

describe('resolveSourceWeights', () => {
  it('returns defaults without genre', () => {
    const weights = resolveSourceWeights();
    expect(weights['story_state:constraint']).toBe(1.0);
    expect(weights['vector:chapter']).toBe(0.68);
  });

  it('applies mystery preset', () => {
    const weights = resolveSourceWeights('mystery');
    expect(weights['vector:fact']).toBe(0.92);
    expect(weights['vector:thread']).toBe(0.88);
  });

  it('applies user overrides over genre preset', () => {
    const weights = resolveSourceWeights('mystery', { 'vector:fact': 0.5 });
    expect(weights['vector:fact']).toBe(0.5);
  });
});

describe('scoreItem', () => {
  it('scores higher for critical items', () => {
    const normal = makeItem({ isCritical: false });
    const critical = makeItem({ isCritical: true });
    const weights = resolveSourceWeights();

    expect(scoreItem(critical, weights)).toBeGreaterThan(scoreItem(normal, weights));
  });

  it('scores higher for more relevant items', () => {
    const low = makeItem({ relevance: 0.3 });
    const high = makeItem({ relevance: 0.9 });
    const weights = resolveSourceWeights();

    expect(scoreItem(high, weights)).toBeGreaterThan(scoreItem(low, weights));
  });

  it('scores higher for fresher items', () => {
    const old = makeItem({ freshness: 0.2 });
    const fresh = makeItem({ freshness: 1.0 });
    const weights = resolveSourceWeights();

    expect(scoreItem(fresh, weights)).toBeGreaterThan(scoreItem(old, weights));
  });

  it('boosts unresolved items', () => {
    const resolved = makeItem({ unresolvedWeight: 0 });
    const unresolved = makeItem({ unresolvedWeight: 0.8 });
    const weights = resolveSourceWeights();

    expect(scoreItem(unresolved, weights)).toBeGreaterThan(scoreItem(resolved, weights));
  });
});

describe('scoreAndSort', () => {
  it('returns items sorted by finalScore descending', () => {
    const items = [
      makeItem({ id: 'a', relevance: 0.3 }),
      makeItem({ id: 'b', relevance: 0.9 }),
      makeItem({ id: 'c', relevance: 0.6 }),
    ];
    const weights = resolveSourceWeights();
    const sorted = scoreAndSort(items, weights);

    expect(sorted[0].id).toBe('b');
    expect(sorted[2].id).toBe('a');
    expect(sorted[0].finalScore).toBeGreaterThan(sorted[1].finalScore);
  });
});

// ────────────────────────────── dedup.ts ──────────────────────────────

describe('deduplicateItems', () => {
  it('removes identical text items', () => {
    const text = '这是一段足够长的文本内容，用来测试去重功能是否正常工作。需要确保有足够多的字符来生成有效的n-gram。';
    const items = [
      makeItem({ id: 'a', text, charCount: text.length }),
      makeItem({ id: 'b', text, charCount: text.length, source: 'vector:digest' }),
    ];
    const { kept, removedCount } = deduplicateItems(items);

    expect(kept).toHaveLength(1);
    expect(removedCount).toBe(1);
    expect(kept[0].id).toBe('a'); // higher scored item kept
  });

  it('keeps sufficiently different items', () => {
    const items = [
      makeItem({ id: 'a', text: '张三在第一章中觉醒了异能，获得了超级力量，开始了他的冒险之旅。' }),
      makeItem({ id: 'b', text: '李四在第五章中发现了古老遗迹，遇到了神秘的守护者，得到了重要线索。', source: 'vector:fact' }),
    ];
    const { kept, removedCount } = deduplicateItems(items);

    expect(kept).toHaveLength(2);
    expect(removedCount).toBe(0);
  });

  it('removes same source + same entityId duplicates', () => {
    const items = [
      makeItem({ id: 'a', entityId: 'ch5', source: 'vector:chapter', text: '短' }),
      makeItem({ id: 'b', entityId: 'ch5', source: 'vector:chapter', text: '也短' }),
    ];
    const { kept, removedCount } = deduplicateItems(items);

    expect(kept).toHaveLength(1);
    expect(removedCount).toBe(1);
  });

  it('keeps items from different sources with same entityId', () => {
    const items = [
      makeItem({ id: 'a', entityId: 'ch5', source: 'vector:chapter', text: '短' }),
      makeItem({ id: 'b', entityId: 'ch5', source: 'vector:digest', text: '也短' }),
    ];
    const { kept } = deduplicateItems(items);

    expect(kept).toHaveLength(2);
  });
});

// ────────────────────────────── orchestrator.ts ──────────────────────────────

describe('MemoryOrchestrator', () => {
  it('orchestrates multiple adapters and returns merged context', async () => {
    const adapter1 = mockAdapter('test-1', ['vector:chapter'], [
      makeItem({ id: 'v1', text: '第一条向量检索结果，包含重要的角色互动信息。', relevance: 0.8 }),
    ]);
    const adapter2 = mockAdapter('test-2', ['story_state:snapshot'], [
      makeItem({ id: 'ss1', source: 'story_state:snapshot', text: '第九章状态快照，记录了关键剧情进展。', relevance: 0.9 }),
    ]);

    const orchestrator = new MemoryOrchestrator({
      adapters: [adapter1, adapter2],
    });

    const result = await orchestrator.orchestrate(makeParams());

    expect(result.items.length).toBe(2);
    expect(result.mergedContext).toContain('状态快照');
    expect(result.mergedContext).toContain('向量检索');
    expect(result.stats.keptCount).toBe(2);
    expect(result.stats.deduplicatedCount).toBe(0);
  });

  it('respects budget limit', async () => {
    // 使用完全不同的文本避免去重
    const uniqueTexts = [
      '张三在山中修炼，感悟天地法则，突破至金丹境。他的修为大幅提升，感受到前所未有的力量涌动。',
      '李四在城中开设武馆，招收弟子传授武艺。他的名声渐渐传开，引来了不少江湖人士的关注。',
      '王五穿越荒漠，寻找失落的古城遗迹。沙漠中的烈日让他几近崩溃，但他的意志坚定不移。',
      '赵六在深海中探索沉船，发现了一批古代宝藏。这些宝物的价值超乎想象，足以改变他的命运。',
      '孙七在密林中追踪魔兽，设下了精妙的陷阱。经过三天三夜的追踪，他终于将目标困在了绝境。',
      '周八在宫廷中周旋于各方势力之间。他的政治手腕令人惊叹，每一步棋都经过深思熟虑。',
      '吴九在雪山顶峰参悟剑道，挥剑斩断了山巅的巨石。这一剑蕴含了他毕生的武学感悟。',
      '郑十在地下迷宫中破解了最后一道机关。迷宫深处藏着上古修士留下的功法秘籍和灵丹妙药。',
      '钱某在海上航行，遭遇了百年不遇的大风暴。他凭借高超的航海术和过人的胆识成功脱险。',
      '冯某在火山口炼制神兵利器，用岩浆淬炼钢铁。这把武器将成为他征战天下的最强依仗。',
    ];
    const items = uniqueTexts.map((text, i) =>
      makeItem({
        id: `item-${i}`,
        entityId: `entity-${i}`,
        text,
        charCount: text.length,
        relevance: 1 - i * 0.05,
        source: 'vector:chapter',
      }),
    );
    const adapter = mockAdapter('test', ['vector:chapter'], items);

    // 总文本约 800+ chars，设置 budget 为 400 以确保有丢弃
    const orchestrator = new MemoryOrchestrator({
      adapters: [adapter],
      budgetChars: 400,
    });

    const result = await orchestrator.orchestrate(makeParams());

    expect(result.stats.totalChars).toBeLessThanOrEqual(500);
    expect(result.stats.droppedCount).toBeGreaterThan(0);
  });

  it('handles adapter failures gracefully', async () => {
    const goodAdapter = mockAdapter('good', ['vector:chapter'], [
      makeItem({ id: 'v1', text: '正常结果内容', relevance: 0.8 }),
    ]);
    const badAdapter: MemorySourceAdapter = {
      name: 'bad',
      sources: ['vector:fact'],
      retrieve: vi.fn().mockRejectedValue(new Error('connection failed')),
    };

    const orchestrator = new MemoryOrchestrator({
      adapters: [goodAdapter, badAdapter],
    });

    const result = await orchestrator.orchestrate(makeParams());

    expect(result.items.length).toBe(1);
    expect(result.stats.keptCount).toBe(1);
  });

  it('applies genre-aware scoring', async () => {
    const factItem = makeItem({
      id: 'fact-1',
      source: 'vector:fact',
      text: '重要事实：凶手在第三章留下了关键证据。',
      relevance: 0.7,
    });
    const emotionItem = makeItem({
      id: 'state-1',
      source: 'vector:character_state',
      text: '角色情感状态：内心挣扎中。',
      relevance: 0.7,
    });

    const adapter = mockAdapter('test', ['vector:fact', 'vector:character_state'], [factItem, emotionItem]);

    // Mystery genre should prioritize facts
    const mysteryOrch = new MemoryOrchestrator({ adapters: [adapter] });
    const mysteryResult = await mysteryOrch.orchestrate(makeParams({ genre: 'mystery' }));

    // Romance genre should prioritize character state
    const romanceOrch = new MemoryOrchestrator({ adapters: [adapter] });
    const romanceResult = await romanceOrch.orchestrate(makeParams({ genre: 'romance' }));

    // In mystery, fact should rank higher; in romance, character_state should
    const mysteryFactIdx = mysteryResult.items.findIndex(i => i.source === 'vector:fact');
    const mysteryStateIdx = mysteryResult.items.findIndex(i => i.source === 'vector:character_state');
    const romanceFactIdx = romanceResult.items.findIndex(i => i.source === 'vector:fact');
    const romanceStateIdx = romanceResult.items.findIndex(i => i.source === 'vector:character_state');

    expect(mysteryFactIdx).toBeLessThan(mysteryStateIdx);
    expect(romanceStateIdx).toBeLessThan(romanceFactIdx);
  });

  it('deduplicates across sources', async () => {
    const sharedText = '张三在禁地中发现了上古遗迹，这里隐藏着远古文明的秘密。这个发现将改变他对这个世界的认知。';
    const adapter1 = mockAdapter('src1', ['vector:chapter'], [
      makeItem({ id: 'a', text: sharedText, charCount: sharedText.length, relevance: 0.9 }),
    ]);
    const adapter2 = mockAdapter('src2', ['vector:digest'], [
      makeItem({ id: 'b', source: 'vector:digest', text: sharedText, charCount: sharedText.length, relevance: 0.7 }),
    ]);

    const orchestrator = new MemoryOrchestrator({ adapters: [adapter1, adapter2] });
    const result = await orchestrator.orchestrate(makeParams());

    expect(result.items.length).toBe(1);
    expect(result.stats.deduplicatedCount).toBe(1);
  });

  it('returns empty context when no adapters have data', async () => {
    const emptyAdapter = mockAdapter('empty', ['vector:chapter'], []);
    const orchestrator = new MemoryOrchestrator({ adapters: [emptyAdapter] });
    const result = await orchestrator.orchestrate(makeParams());

    expect(result.items).toHaveLength(0);
    expect(result.mergedContext).toBe('');
    expect(result.stats.keptCount).toBe(0);
  });
});

// ────────────────────────────── PreviousChapterAdapter ──────────────────────────────

describe('PreviousChapterAdapter', () => {
  it('wraps previous chapter text as high-priority item', async () => {
    const adapter = new PreviousChapterAdapter();
    const params = makeParams({ previousChapterContext: '上一章发生了很多事情...' });
    const items = await adapter.retrieve(params);

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('file:previous_chapter');
    expect(items[0].relevance).toBe(0.92);
    expect(items[0].freshness).toBe(1.0);
  });

  it('returns empty when no previous chapter', async () => {
    const adapter = new PreviousChapterAdapter();
    const params = makeParams({ previousChapterContext: '' });
    const items = await adapter.retrieve(params);

    expect(items).toHaveLength(0);
  });
});
