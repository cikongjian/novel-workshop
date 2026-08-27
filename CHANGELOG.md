# 变更日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] - 2026-08-27

首个开源版本。此前作为私有项目开发，本次以 Apache-2.0 开源，未继承原有提交历史。

### 新增

- 品牌标识单一配置源 `config/brand.defaults.json`，后端 `src/config/brand.ts`、前端 `web/src/config/brand.ts`、构建期占位符替换三条链路均从此派生
- 面向开源用户的最小 `docker-compose.yml`：不依赖 Redis 与 MySQL，只需 `MODEL_API_KEY` 即可启动
- `SECURITY.md`（含部署前必须确认的配置清单）、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`CHANGELOG.md`、issue 与 PR 模板
- README 增加来自全新生产构建的移动工作台、作品库与爽点 DNA 界面截图

### 变更（CI）

- 在既有 `verify.yml` 流水线中补充三项检查：安全自检（`check:security`）、乱码检查（`check:mojibake:all`）、构建产物中品牌占位符残留校验

### 变更

- 前端应用版本号改为构建期注入，不再动态 `import` 整个 `package.json`（避免 `author`、`repository` 等元数据进入前端产物）
- `scripts/` 下 5 个审计与测试脚本的数据目录改为 `process.argv[2] ?? process.env.DATA_DIR ?? './data'`，移除硬编码的本机绝对路径
- 安卓与鸿蒙壳的加载地址、包名改为通用占位值，需自行替换为实际部署地址
- 文档内 90 处 IDE 生成的本机绝对路径链接改为仓库相对路径
- 删除包含环境专用地址且已不适配 SQLite 架构的旧部署指南与 MySQL 辅助栈
- Dependabot 调整为每月分组更新，减少个人低维护项目的通知噪音

### 安全

- 登录页的“记住我”改为只保存用户名；读取到旧版明文密码记录时会立即清理并迁移，避免长期凭据暴露给同源脚本
- 管理员初始化不再提供默认口令，示例配置留空，并由开源检查阻止凭据环境变量回退到字面量
- 前后端锁文件的分发地址统一为 npm 官方 registry，发布检查阻止第三方镜像地址回流
- 容器补齐构建期与运行期品牌配置，增加健康检查和启动冒烟测试，并为本机 Compose 提供回环 CORS 默认值
- 生产认证配置改为失败关闭：缺少管理员口令、独立加密密钥、主机名或代理层级时拒绝启动，不再静默降级为无鉴权服务
- Compose 补齐认证、加密、反向代理与外部 Redis 变量传递，CI 新增认证容器冒烟测试
- 修复 SQLite 推荐系统表结构、遗留 MySQL 时间/锁语法和 Redis 内存回退接口不完整导致的运行错误

### 已知问题

- `src/pipeline/reader-delivery-audit.test.ts` 中 1 个用例标记为 `it.skip`：阅读交付审计的 `passed` 判定与各维度评分不一致，详见文件内 TODO
- 部分遗留源码仍超出项目约定的 400 行上限，后续按业务职责逐步拆分

[Unreleased]: https://github.com/cikongjian/novel-workshop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cikongjian/novel-workshop/releases/tag/v0.1.0
