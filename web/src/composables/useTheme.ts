import { computed } from 'vue';
import { useThemeMode } from './useThemeMode';

export function useTheme() {
  const { mode, isDark, setMode } = useThemeMode();
  const toggleTheme = () => setMode(isDark.value ? 'light' : 'dark');

  return {
    isDark,
    toggleTheme,
    mode: computed(() => mode.value),
  };
}
