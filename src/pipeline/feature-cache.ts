export interface ParagraphFeatures {
  paragraphs: string[];
  charCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
}

export interface KeywordMatch {
  keyword: string;
  count: number;
  positions: number[];
}

export interface ChapterFeatureKey {
  chapterKey: string;
  chapterNumber: number;
}

const cache = new Map<string, unknown>();

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export class FeatureCache {
  private static instance: FeatureCache;
  private cache = new Map<string, unknown>();
  private maxSize = 50;
  private accessOrder: string[] = [];

  private constructor() {}

  static getInstance(): FeatureCache {
    if (!FeatureCache.instance) {
      FeatureCache.instance = new FeatureCache();
    }
    return FeatureCache.instance;
  }

  get<T>(key: string): T | undefined {
    if (this.cache.has(key)) {
      this.touch(key);
      return this.cache.get(key) as T;
    }
    return undefined;
  }

  set<T>(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    this.cache.set(key, value);
    this.touch(key);
  }

  has(key: string): boolean {
    if (this.cache.has(key)) {
      this.touch(key);
      return true;
    }
    return false;
  }

  getOrCompute<T>(key: string, compute: () => T): T {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = compute();
    this.set(key, value);
    return value;
  }

  getParagraphs(content: string): string[] {
    const key = `paragraphs:${hashContent(content)}`;
    return this.getOrCompute(key, () =>
      content.split('\n').map(p => p.trim()).filter(Boolean)
    );
  }

  getSemanticParagraphs(content: string): string[] {
    const key = `semiparas:${hashContent(content)}`;
    return this.getOrCompute(key, () =>
      content
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0 && !/^[-=*_]{3,}$/.test(p) && !/^#/.test(p))
    );
  }

  getCharCount(content: string): number {
    const key = `charCount:${hashContent(content)}`;
    return this.getOrCompute(key, () => content.length);
  }

  countKeyword(content: string, keyword: string): number {
    const key = `kw:${hashContent(content)}:${keyword}`;
    return this.getOrCompute(key, () => {
      let count = 0;
      let idx = 0;
      while ((idx = content.indexOf(keyword, idx)) !== -1) {
        count++;
        idx += keyword.length;
      }
      return count;
    });
  }

  countKeywords(content: string, keywords: string[]): Map<string, number> {
    const key = `kws:${hashContent(content)}:${keywords.join('|')}`;
    return this.getOrCompute(key, () => {
      const result = new Map<string, number>();
      for (const kw of keywords) {
        let count = 0;
        let idx = 0;
        while ((idx = content.indexOf(kw, idx)) !== -1) {
          count++;
          idx += kw.length;
        }
        result.set(kw, count);
      }
      return result;
    });
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  private touch(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }

  private evictOldest(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}

export const featureCache = FeatureCache.getInstance();
