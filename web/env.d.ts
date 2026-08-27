/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

/** 由 vite.config.ts 的 define 注入，见 config/brand.defaults.json */
declare const __BRAND_DEFAULTS__: {
  readonly displayName: string;
  readonly slug: string;
  readonly tagline: string;
  readonly description: string;
  readonly copyrightSince: number;
  readonly copyrightHolder: string;
};

/** 由 vite.config.ts 的 define 注入，取自根 package.json 的 version */
declare const __APP_VERSION__: string;

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
