import { defineConfig } from 'vitest/config';

// 后端测试配置。前端测试走 web/vitest.config.ts（`npm run test:web`）：
// 前端用例依赖 web/node_modules 里的 vue 等包，纳入本配置会让只装了根依赖的
// 全新克隆在 `npm test` 阶段直接失败。`npm run test:all` 一次跑完两侧。
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
