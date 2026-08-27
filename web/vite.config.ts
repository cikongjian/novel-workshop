import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 品牌默认值取自仓库根的 config/brand.defaults.json（唯一真实来源）。
 * 缺失或字段不全时直接抛错，不放默认兜底值。
 */
type BrandDefaults = {
  displayName: string;
  slug: string;
  tagline: string;
  description: string;
  copyrightSince: number;
  copyrightHolder: string;
};

const BRAND_DEFAULTS_FILE = path.resolve(__dirname, '../config/brand.defaults.json');

function loadBrandDefaults(): BrandDefaults {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(BRAND_DEFAULTS_FILE, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `品牌配置文件读取失败：${BRAND_DEFAULTS_FILE}。原始错误：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const text = (key: string): string => {
    const value = parsed[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`品牌配置项 ${key} 缺失或为空，请检查 config/brand.defaults.json`);
    }
    return value.trim();
  };
  const since = parsed.copyrightSince;
  if (typeof since !== 'number' || !Number.isInteger(since) || since <= 0) {
    throw new Error('品牌配置项 copyrightSince 必须为正整数年份');
  }
  return {
    displayName: text('displayName'),
    slug: text('slug'),
    tagline: text('tagline'),
    description: text('description'),
    copyrightSince: since,
    copyrightHolder: text('copyrightHolder'),
  };
}

const brandDefaults = loadBrandDefaults();

/** 应用版本号取自根 package.json，只注入这一个字段 */
function loadAppVersion(): string {
  const file = path.resolve(__dirname, '../package.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };
    if (typeof parsed.version !== 'string' || !parsed.version.trim()) {
      throw new Error('package.json 缺少 version 字段');
    }
    return parsed.version.trim();
  } catch (error) {
    throw new Error(
      `读取应用版本号失败：${file}。原始错误：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const appVersion = loadAppVersion();

/** 生效的品牌值：环境变量优先，其次默认文件 */
const brandRuntime: BrandDefaults = {
  displayName: process.env.VITE_BRAND_DISPLAY_NAME?.trim() || brandDefaults.displayName,
  slug: process.env.VITE_BRAND_SLUG?.trim() || brandDefaults.slug,
  tagline: process.env.VITE_BRAND_TAGLINE?.trim() || brandDefaults.tagline,
  description: process.env.VITE_BRAND_DESCRIPTION?.trim() || brandDefaults.description,
  copyrightSince: brandDefaults.copyrightSince,
  copyrightHolder: process.env.VITE_BRAND_COPYRIGHT_HOLDER?.trim() || brandDefaults.copyrightHolder,
};

/**
 * 把 index.html 与 manifest.json 里的品牌占位符替换为生效值。
 * 静态文件无法 import TS 配置，只能在构建期注入。
 */
function injectBrandIntoStaticAssets(): Plugin {
  const tokens: Array<[RegExp, string]> = [
    [/%BRAND_DISPLAY_NAME%/g, brandRuntime.displayName],
    [/%BRAND_TAGLINE%/g, brandRuntime.tagline],
    [/%BRAND_DESCRIPTION%/g, brandRuntime.description],
  ];
  const apply = (source: string): string =>
    tokens.reduce((acc, [pattern, value]) => acc.replace(pattern, value), source);

  return {
    name: 'inject-brand-into-static-assets',
    transformIndexHtml(html) {
      return apply(html);
    },
    // public/ 下的文件是直接拷贝、不进 rollup bundle，只能在产物落盘后改写
    closeBundle() {
      const target = path.resolve(__dirname, 'dist/manifest.json');
      try {
        const source = readFileSync(target, 'utf8');
        const replaced = apply(source);
        if (replaced !== source) writeFileSync(target, replaced, 'utf8');
      } catch (error) {
        // manifest 缺失说明未开 PWA 或产物结构变化，不应静默通过
        throw new Error(
          `品牌占位符注入失败，无法处理 ${target}：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    configureServer(server) {
      // 开发期 public/manifest.json 不走打包，拦截请求做同样替换
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/manifest.json')) return next();
        const file = path.resolve(__dirname, 'public/manifest.json');
        try {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(apply(readFileSync(file, 'utf8')));
        } catch (error) {
          server.config.logger.error(
            `manifest.json 读取失败：${error instanceof Error ? error.message : String(error)}`,
          );
          next();
        }
      });
    },
  };
}

function disableDevModuleCache(): Plugin {
  return {
    name: 'disable-dev-module-cache',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (url.startsWith('/src/') || url.startsWith('/@vite/') || url.startsWith('/@fs/')) {
          delete req.headers['if-none-match'];
          delete req.headers['if-modified-since'];
          res.setHeader('Cache-Control', 'no-store');
        }
        next();
      });
    },
  };
}

// SPA 含深路由（/m/me、/m/novels/:id 等），必须用绝对 base。
// 若 base:'./'，深路由下 ./assets/x.js 会被解析为 /m/assets/x.js 而命中 SPA 兜底，
// 返回 index.html(text/html) 触发 MIME 报错。子路径部署请用 VITE_PUBLIC_BASE=/subpath/ 覆盖。
const base = process.env.VITE_PUBLIC_BASE || '/';

async function resolvePlugins(): Promise<Plugin[]> {
  const plugins: Plugin[] = [disableDevModuleCache(), injectBrandIntoStaticAssets(), vue()];

  // PWA 默认开启（可通过 VITE_DISABLE_PWA=true 禁用）
  if (process.env.VITE_DISABLE_PWA !== 'true') {
    try {
      const { VitePWA } = await import('vite-plugin-pwa');
      plugins.push(
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['brand/logo-square-light.svg', 'brand/logo-square-dark.svg'],
          manifest: false,
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            // API 响应可能包含用户私有数据，不能放入跨会话共享的 Service Worker 缓存。
            runtimeCaching: [
              {
                urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'image-cache',
                  expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
                },
              },
              {
                urlPattern: /\.(?:woff2?|ttf|otf)$/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'font-cache',
                  expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
                },
              },
            ],
            navigateFallback: null,
          },
        }),
      );
      console.log('[build] PWA plugin enabled');
    } catch {
      console.warn('[build] PWA plugin failed to load, skipping');
    }
  }

  return plugins;
}

export default defineConfig(async () => ({
  base,
  plugins: await resolvePlugins(),
  define: {
    // 供 web/src/config/brand.ts 消费，避免前端重复写死品牌默认值
    __BRAND_DEFAULTS__: JSON.stringify(brandRuntime),
    // 只注入版本号，避免整个 package.json（含 author/repository）进前端产物
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('node_modules/element-plus')) {
            return 'vendor-element-plus';
          }

          if (id.includes('node_modules/echarts')) {
            return 'vendor-echarts';
          }

          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/@vue/') ||
            id.includes('node_modules/vue-router') ||
            id.includes('node_modules/pinia') ||
            id.includes('node_modules/@vueuse/')
          ) {
            return 'vendor-vue';
          }

          if (id.includes('node_modules/axios')) {
            return 'vendor-axios';
          }

          return 'vendor-misc';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3313', ws: true },
      '/ws': { target: 'ws://127.0.0.1:3313', ws: true },
    },
  },
}));
