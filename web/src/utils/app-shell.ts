import { hasAndroidNativeTTSBridge } from './android-native-tts';

type AndroidAppShellInfo = {
  platform: 'android';
  appVersion?: string;
  entryUrl?: string;
  offlineReason?: string;
  hotUpdateConfigUrl?: string;
};

type HarmonyAppShellInfo = {
  platform: 'harmony';
  appVersion?: string;
  entryUrl?: string;
  offlineReason?: string;
};

type AndroidShellControlBridge = {
  retry?: () => void;
  openExternal?: (url?: string) => void;
};

declare global {
  interface Window {
    __NW_ANDROID_SHELL__?: AndroidAppShellInfo;
    __NW_HARMONY_SHELL__?: HarmonyAppShellInfo;
    AndroidShellControl?: AndroidShellControlBridge;
  }
}

function getAndroidAppShellInfo(): AndroidAppShellInfo | null {
  if (typeof window === 'undefined') return null;
  const info = window.__NW_ANDROID_SHELL__;
  if (info?.platform === 'android') return info;
  if (hasAndroidNativeTTSBridge()) {
    return { platform: 'android' };
  }
  return null;
}

function getHarmonyAppShellInfo(): HarmonyAppShellInfo | null {
  if (typeof window === 'undefined') return null;
  const info = window.__NW_HARMONY_SHELL__;
  if (info?.platform === 'harmony') return info;
  return null;
}

export function isAndroidAppShell(): boolean {
  return getAndroidAppShellInfo() != null;
}

export function isHarmonyAppShell(): boolean {
  return getHarmonyAppShellInfo() != null;
}

export function isAppShell(): boolean {
  return isAndroidAppShell() || isHarmonyAppShell();
}

export function openInAndroidShellExternalBrowser(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.AndroidShellControl;
  if (!bridge || typeof bridge.openExternal !== 'function') return false;

  try {
    bridge.openExternal(url);
    return true;
  } catch {
    return false;
  }
}
