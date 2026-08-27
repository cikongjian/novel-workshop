import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureCache } from './feature-cache.js';

describe('FeatureCache', () => {
  let cache: FeatureCache;

  beforeEach(() => {
    cache = FeatureCache.getInstance();
    cache.clear();
  });

  it('基本 set/get 工作', () => {
    cache.set('test', { value: 42 });
    expect(cache.get('test')).toEqual({ value: 42 });
  });

  it('getOrCompute 缓存结果', () => {
    let computeCount = 0;
    const compute = () => {
      computeCount++;
      return { result: 'hello' };
    };

    const r1 = cache.getOrCompute('key1', compute);
    const r2 = cache.getOrCompute('key1', compute);

    expect(r1).toEqual({ result: 'hello' });
    expect(r2).toEqual({ result: 'hello' });
    expect(computeCount).toBe(1);
  });

  it('段落分割缓存', () => {
    const content = '第一段\n第二段\n第三段';
    const p1 = cache.getParagraphs(content);
    const p2 = cache.getParagraphs(content);
    expect(p1).toEqual(['第一段', '第二段', '第三段']);
    expect(p1).toBe(p2);
  });

  it('关键词计数缓存', () => {
    const content = '你好你好世界你好';
    const count1 = cache.countKeyword(content, '你好');
    const count2 = cache.countKeyword(content, '你好');
    expect(count1).toBe(3);
    expect(count2).toBe(3);
  });

  it('批量关键词计数', () => {
    const content = '你好世界你好';
    const keywords = ['你好', '世界', '测试'];
    const result = cache.countKeywords(content, keywords);
    expect(result.get('你好')).toBe(2);
    expect(result.get('世界')).toBe(1);
    expect(result.get('测试')).toBe(0);
  });

  it('LRU 淘汰机制', () => {
    const cache = new (FeatureCache as any)();
    cache.maxSize = 3;

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size).toBe(3);

    cache.get('a');
    cache.set('d', 4);

    expect(cache.size).toBe(3);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
  });

  it('clear 清空缓存', () => {
    cache.set('x', 1);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('x')).toBeUndefined();
  });
});
