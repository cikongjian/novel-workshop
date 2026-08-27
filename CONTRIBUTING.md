# 贡献指南

先说清楚预期：这是个人自用项目的开源版本，按现状提供，**不承诺 review 时效**。PR 欢迎，但可能等很久，也可能因为与我的使用方向不符而被关闭。如果你的改动很大，建议先开 issue 聊一下再动手，避免白做。

小而独立的 PR 最容易被合并：一个 bug 一个 PR，一个功能一个 PR。

## 开发环境

需要 Node.js ≥ 22。三个原生依赖（`better-sqlite3`、`@lancedb/lancedb`、`sharp`）需要编译工具链：

- **Windows**：Visual Studio Build Tools，勾选「使用 C++ 的桌面开发」工作负载
- **macOS**：`xcode-select --install`
- **Linux**：`build-essential`、`python3`

```bash
npm install
cd web && npm install && cd ..
cp .env.example .env      # 至少填 MODEL_API_KEY

npm run dev               # 后端，端口 3001
cd web && npm run dev     # 前端，端口 5173
```

前端通过 Vite 代理转发 `/api` 与 `/ws` 到后端，两个都要启动。移动端是默认入口，访问 `http://localhost:5173/m`。

## 提交前必须跑通

```bash
npm ci                     # 后端依赖
npm --prefix web ci        # 前端依赖（前端测试依赖它，先装）
npm run check              # tsc --noEmit
npm test                   # 后端测试
npm run test:web           # 前端测试（也可用 npm run test:all 一次跑两侧）
npm run check:security     # 安全自检
npm run check:mojibake:all # 乱码检查
npm run check:oss          # 开源发布卫生检查（许可、NOTICE、依赖 copyleft 审查）
npm run check:runtime-deps # 原生运行时依赖与 Sharp 许可文本检查
npm run generate:sbom      # 生成前后端生产依赖 CycloneDX SBOM
cd web && npm run build    # 前端构建
```

CI 会跑同样的命令，全部应为绿。`src/pipeline/reader-delivery-audit.test.ts` 里有 1 个 `it.skip` 的用例（阅读交付审计评分有缺陷，见文件内 TODO），欢迎有人接手。

## 代码约定

这些不是风格偏好，是这个项目的硬约束：

**单文件不超过 400 行**（含模板与样式）。超了就拆。仓库里有几个远超此限的历史文件（`src/pipeline/chapter-pipeline.ts` 5000+ 行），它们是待偿的债，不是可以效仿的先例。

**不许硬编码**。路径、地址、端口、超时、重试次数、容量上限、业务阈值、文案、品牌信息一律走配置或具名常量。判断不了会不会变，就按会变处理。

**品牌信息只有一个来源**：`config/brand.defaults.json`。后端从 `src/config/brand.ts` 读，前端从 `web/src/config/brand.ts` 读，静态文件（`index.html`、`manifest.json`）用 `%BRAND_*%` 占位符由 `vite.config.ts` 构建期替换。不要在任何别处写品牌字面量。

**错误处理要闭环**。不许 `catch {}` 空吞，不许 `// @ts-ignore`，不许无注释的 `any` 逃逸。catch 块必须有日志、用户提示或重新抛出。

**外部输入默认不可信**。用户输入、文件内容、网络响应、命令输出、AI 返回，先校验再用。数据库访问一律参数化查询。

**职责单一**。组件只管 UI，业务逻辑进 composable 或 service；路由 handler 只做请求解析与响应，核心逻辑进 pipeline 或 service 层。

## 技术约束

- ESM 模块，后端 import 必须带 `.js` 扩展名（NodeNext 解析）
- Express 5，不是 4，路由语法有差异
- 前端无路径别名，用相对路径
- TypeScript 严格模式，target ES2023

## 扩展点

**加 Agent**：继承 `BaseAgent`，实现 `buildUserMessage(context)`，提示词放 `src/agents/prompts/{role}.txt`。

**加模型供应商**：Anthropic 走专用 SDK，其余全部走 `OpenAICompatibleClient`。多数情况只需在 `src/models/provider.ts` 加一条配置。

**加 CLI 命令**：注册到 `src/cli/registry.ts`，命令实现放对应业务域下。

## PR 描述

说明改了什么、怎么验证的、关联哪个 issue。测试没跑或跑不过，在描述里写明原因——如实说明比假装通过好得多。

新增功能请同步补测试。项目用 Vitest，用例与被测文件同目录（`*.test.ts`）。

## 许可

提交 PR 即表示你同意以 Apache-2.0 授权你的贡献。本项目不使用 CLA。
