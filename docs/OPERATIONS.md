# 操作说明

## 标准验证

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`

调查阶段应运行能为当前改动切片提供最佳信心的检查；未完成相关验证前，不要宣称任务完成。

## AI 审查工作流

- `npm run agent:enable-codex-gate`
  在新机器或全新 checkout 上启用 Codex 的 stop-time review gate。
- `npm run agent:codex-review`
  运行针对基线分支的 Codex 审查流程。
- `npm run agent:codex-postflight -- --plan <path>`
  运行面向 plan 实现工作的 Codex postflight 审计。

## 提交与推送

- 在本仓库中，只要用户没有明确禁止，Codex 在完成本轮改动并完成对应验证后，默认应自动执行 `git add`、`git commit` 和 `git push`。
- 提交信息使用 Conventional Commits。
- 如果自动推送被远端冲突、权限问题或其他阻塞因素打断，应先明确报告阻塞原因，再由 Codex 继续处理或等待用户决策。

## 备注

- `agent:codex-postflight` 是 Codex-only 工作流下的用户侧 postflight 命令。
- 桌面应用内的 AI 运行时主路径是 `codex-acp bridge`，`codex` 配置仅表示 launcher defaults。
- 如果仓库策略变化，要同步更新本文档以及相关脚本。
