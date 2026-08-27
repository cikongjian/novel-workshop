import { isAndroidAppShell } from './app-shell';

export type BrowserEnv = {
  userAgent: string;
  isIOS: boolean;
  isAndroid: boolean;
  isWeChat: boolean;
  isSafari: boolean;
  isChromeLike: boolean;
  isAndroidAppShell: boolean;
};

export function detectBrowserEnv(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): BrowserEnv {
  const normalized = userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(normalized);
  const isAndroid = normalized.includes('android');
  const isWeChat = normalized.includes('micromessenger');
  const isSafari = isIOS && /safari/.test(normalized) && !/crios|fxios|edgios|micromessenger/.test(normalized);
  const isChromeLike = /chrome|crios|edg|edga|edgios/.test(normalized) && !isWeChat;

  return {
    userAgent,
    isIOS,
    isAndroid,
    isWeChat,
    isSafari,
    isChromeLike,
    isAndroidAppShell: isAndroidAppShell(),
  };
}
