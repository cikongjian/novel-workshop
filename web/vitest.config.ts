import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// 前端依赖安装在 web/node_modules，因此与根目录的后端测试分开运行。
export default defineConfig({
  // 组件用例需要编译 .vue 单文件组件
  plugins: [vue()],
  resolve: {
    // 测试命令从仓库根目录启动；去重 Vue 相关包，确保插件、组件和 test-utils 共用 web 的运行时。
    dedupe: ['vue', '@vue/runtime-core', '@vue/runtime-dom', '@vue/reactivity', '@vue/shared'],
  },
  test: {
    // 将 include 相对路径固定到 web/src，避免重新扫描后端测试。
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    // 默认 node：纯逻辑用例无需 DOM。需要 DOM 的文件在首行加
    // `// @vitest-environment happy-dom`，避免让全部用例都承担约 6s 的环境初始化。
    environment: 'node',
    globals: true,
  },
});
