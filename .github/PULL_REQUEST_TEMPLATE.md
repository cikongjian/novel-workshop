## 改了什么

<!-- 一两句说清这个 PR 做了什么。改动较大时说明拆分思路。 -->

关联 issue：

## 怎么验证的

<!-- 你实际跑了什么。没跑通的项如实写明原因，比假装通过好。 -->

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run test:web`
- [ ] `npm run check:security`
- [ ] `npm run check:mojibake:all`
- [ ] `npm run check:oss`
- [ ] `cd web && npm run build`
- [ ] 手动验证（说明验证路径）：

## 自查

- [ ] 新增或修改的文件均未超过 400 行
- [ ] 没有硬编码路径、地址、超时、阈值、文案、品牌信息
- [ ] 品牌相关内容只从 `config/brand.defaults.json` 派生
- [ ] catch 块都有明确处理，没有空吞或 `@ts-ignore`
- [ ] 新增能力已补测试
- [ ] 涉及外部输入的地方做了校验

## 其他

<!-- 已知限制、后续待办、需要 reviewer 特别注意的地方。 -->
