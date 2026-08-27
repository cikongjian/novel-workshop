import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  NovelMetadata,
  ChapterSummary,
  CharacterProfile,
  WorldEntry,
  OutlineData,
} from '../types';
import * as api from '../api';
import { useRequestCache } from '../composables/useRequestCache';

// 模块级缓存实例
const novelCache = useRequestCache<NovelMetadata>(30000);
const chaptersCache = useRequestCache<ChapterSummary[]>(15000);
const charactersCache = useRequestCache<CharacterProfile[]>(20000);
const worldCache = useRequestCache<WorldEntry[]>(20000);
const outlineCache = useRequestCache<OutlineData>(20000);

export type NovelLoadDomain = 'chapters' | 'characters' | 'world' | 'outline';
const ALL_DOMAINS: NovelLoadDomain[] = ['chapters', 'characters', 'world', 'outline'];

export const useNovelStore = defineStore('novel', () => {
  const currentNovel = ref<NovelMetadata | null>(null);
  const chapters = ref<ChapterSummary[]>([]);
  const characters = ref<CharacterProfile[]>([]);
  const worldEntries = ref<WorldEntry[]>([]);
  const outline = ref<OutlineData>({ chapters: [], plotThreads: [], foreshadowing: [] });
  const loadedDomains = ref<NovelLoadDomain[]>([]);
  const loading = ref(false);

  async function loadNovel(id: string, options?: { domains?: NovelLoadDomain[] | 'all' }) {
    loading.value = true;
    try {
      currentNovel.value = await novelCache.cachedFetch(
        `novel:${id}`,
        () => api.fetchNovel(id),
      );
      await loadDomains(resolveDomains(options?.domains));
    } finally {
      loading.value = false;
    }
  }

  async function ensureDomains(id: string, domains: NovelLoadDomain[]) {
    if (!currentNovel.value || currentNovel.value.id !== id) {
      await loadNovel(id, { domains });
      return;
    }
    const missingDomains = domains.filter((domain) => !loadedDomains.value.includes(domain));
    if (missingDomains.length === 0) return;
    await loadDomains(missingDomains);
  }

  async function loadDomains(domains: NovelLoadDomain[]) {
    const tasks = domains.map((domain) => {
      if (domain === 'chapters') return refreshChapters();
      if (domain === 'characters') return refreshCharacters();
      if (domain === 'world') return refreshWorldEntries();
      return refreshOutline();
    });
    await Promise.allSettled(tasks);
  }

  async function refreshChapters(options?: { force?: boolean }) {
    if (!currentNovel.value) return;
    const id = currentNovel.value.id;
    const cacheKey = `chapters:${id}`;
    if (options?.force) {
      chaptersCache.invalidate(cacheKey);
    }
    try {
      chapters.value = await chaptersCache.cachedFetch(
        cacheKey,
        () => api.fetchChapters(id),
      );
      markDomainLoaded('chapters');
    } catch {
      chapters.value = [];
    }
  }

  async function refreshNovel(options?: { force?: boolean }) {
    if (!currentNovel.value) return;
    const id = currentNovel.value.id;
    const cacheKey = `novel:${id}`;
    if (options?.force) {
      novelCache.invalidate(cacheKey);
    }
    try {
      currentNovel.value = await novelCache.cachedFetch(cacheKey, () => api.fetchNovel(id));
    } catch {
      // 刷新失败不影响其他状态
    }
  }

  async function refreshCharacters(options?: { force?: boolean }) {
    if (!currentNovel.value) return;
    const id = currentNovel.value.id;
    const cacheKey = `characters:${id}`;
    if (options?.force) charactersCache.invalidate(cacheKey);
    try {
      characters.value = await charactersCache.cachedFetch(cacheKey, () => api.fetchCharacters(id));
      markDomainLoaded('characters');
    } catch {
      characters.value = [];
    }
  }

  async function refreshWorldEntries(options?: { force?: boolean }) {
    if (!currentNovel.value) return;
    const id = currentNovel.value.id;
    const cacheKey = `world:${id}`;
    if (options?.force) worldCache.invalidate(cacheKey);
    try {
      worldEntries.value = await worldCache.cachedFetch(cacheKey, () => api.fetchWorldEntries(id));
      markDomainLoaded('world');
    } catch {
      worldEntries.value = [];
    }
  }

  async function refreshOutline(options?: { force?: boolean }) {
    if (!currentNovel.value) return;
    const id = currentNovel.value.id;
    const cacheKey = `outline:${id}`;
    if (options?.force) outlineCache.invalidate(cacheKey);
    try {
      outline.value = await outlineCache.cachedFetch(cacheKey, () => api.fetchOutline(id));
      markDomainLoaded('outline');
    } catch {
      outline.value = { chapters: [], plotThreads: [], foreshadowing: [] };
    }
  }

  function markDomainLoaded(domain: NovelLoadDomain) {
    if (loadedDomains.value.includes(domain)) return;
    loadedDomains.value = [...loadedDomains.value, domain];
  }

  function resolveDomains(domains: NovelLoadDomain[] | 'all' | undefined): NovelLoadDomain[] {
    if (!domains || domains === 'all') return ALL_DOMAINS;
    return domains;
  }

  function reset() {
    currentNovel.value = null;
    chapters.value = [];
    characters.value = [];
    worldEntries.value = [];
    outline.value = { chapters: [], plotThreads: [], foreshadowing: [] };
    loadedDomains.value = [];
    novelCache.invalidate();
    chaptersCache.invalidate();
    charactersCache.invalidate();
    worldCache.invalidate();
    outlineCache.invalidate();
  }

  return {
    currentNovel,
    chapters,
    characters,
    worldEntries,
    outline,
    loadedDomains,
    loading,
    loadNovel,
    ensureDomains,
    refreshChapters,
    refreshNovel,
    refreshCharacters,
    refreshWorldEntries,
    refreshOutline,
    reset,
  };
});
