import { computed, ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'warm-night';

const THEME_KEY = 'app_theme_mode';
const LEGACY_THEME_KEY = 'nw-theme';
const DARK_CLASS = 'dark';
const WARM_CLASS = 'warm-night';

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'warm-night') return raw;

    const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === 'dark') return 'dark';
    if (legacy === 'light') return 'light';
  } catch { /* ignore */ }
  return 'light';
}

function writeStored(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_KEY, mode);
    window.localStorage.setItem(LEGACY_THEME_KEY, mode === 'light' ? 'light' : 'dark');
  } catch { /* ignore */ }
}

function applyToDOM(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.classList.remove(DARK_CLASS, WARM_CLASS);
  if (mode === 'dark') html.classList.add(DARK_CLASS);
  if (mode === 'warm-night') {
    html.classList.add(DARK_CLASS, WARM_CLASS);
  }
}

const mode = ref<ThemeMode>(readStored());
const isDark = computed(() => mode.value === 'dark' || mode.value === 'warm-night');
const isWarmNight = computed(() => mode.value === 'warm-night');
applyToDOM(mode.value);

watch(mode, (next) => {
  writeStored(next);
  applyToDOM(next);
});

export function useThemeMode() {
  function setMode(next: ThemeMode) {
    mode.value = next;
  }

  function toggleDark() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark';
  }

  function cycle() {
    const order: ThemeMode[] = ['light', 'dark', 'warm-night'];
    const idx = order.indexOf(mode.value);
    mode.value = order[(idx + 1) % order.length];
  }

  return {
    mode,
    isDark,
    isWarmNight,
    setMode,
    toggleDark,
    cycle,
  };
}
