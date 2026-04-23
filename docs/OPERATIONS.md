# 操作说明

## 标准验证

- `npm run check`
- `npm run check:rust`
- `npm run test:rust`

调查阶段应运行能为当前改动切片提供最佳信心的检查；未完成相关验证前，不要宣称任务完成。

## 本地提交流程

- 默认提交前至少运行 `npm run check`、`npm run check:rust`、`npm run test:rust`。
- 如果改动只覆盖其中一个层面，也应说明为什么缩小验证范围，而不是跳过说明。
- Rust / Tauri、workflow、release 相关改动，优先跑完整基线，不要只依赖单个模块测试。
- 如果改动涉及桌面工作流主路径，且当前环境允许，应额外补一次桌面 smoke：打开 workspace、恢复 session、检查 Markdown preview、LaTeX compile/preview 与 references library。

## CI 与 Release

- `.github/workflows/ci.yml` 是日常质量门，覆盖 `npm ci`、`npm run check`、`npm run check:rust`、`npm run test:rust`。
- `.github/workflows/release-on-version-bump.yml` 会在创建 release tag 之前重复执行同一套质量门，避免“版本变更直接发版”。
- `.github/workflows/release.yml` 在真正打包前还会再跑 release quality gate；release job 只有在这一步通过后才会进入各平台构建。
- release workflow 负责产物打包与发布，不再承担“第一次发现 lint / build / test 失败”的职责。

## 提交与推送

- 在本仓库中，只要用户没有明确禁止，Codex 在完成本轮改动并完成对应验证后，默认应自动执行 `git add`、`git commit` 和 `git push`。
- 提交信息使用 Conventional Commits。
- 如果自动推送被远端冲突、权限问题或其他阻塞因素打断，应先明确报告阻塞原因，再由 Codex 继续处理或等待用户决策。

## 备注

- 如果仓库策略变化，要同步更新本文档以及相关脚本。
- 当前会话若无法附着桌面窗口，应明确把 desktop smoke 缺口写进验证说明，而不是默认省略。
