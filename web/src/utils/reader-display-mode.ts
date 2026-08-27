export type ReaderDisplayMode = 'light' | 'night';

const READER_DISPLAY_MODE_STORAGE_KEY = 'nw-reader:display-mode';

export function readReaderDisplayMode(): ReaderDisplayMode | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(READER_DISPLAY_MODE_STORAGE_KEY);
  return raw === 'light' || raw === 'night' ? raw : null;
}

export function writeReaderDisplayMode(mode: ReaderDisplayMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READER_DISPLAY_MODE_STORAGE_KEY, mode);
}
