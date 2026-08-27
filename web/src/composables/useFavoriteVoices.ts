import { ref } from 'vue';

const STORAGE_KEY = 'novel-workshop-favorite-voices';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveFavorites(set: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

/** 全局共享的收藏音色集合 */
const favorites = ref<Set<string>>(loadFavorites());

export function useFavoriteVoices() {
  function isFavorite(voiceName: string): boolean {
    return favorites.value.has(voiceName);
  }

  function toggleFavorite(voiceName: string) {
    const next = new Set(favorites.value);
    if (next.has(voiceName)) {
      next.delete(voiceName);
    } else {
      next.add(voiceName);
    }
    favorites.value = next;
    saveFavorites(next);
  }

  return { favorites, isFavorite, toggleFavorite };
}
