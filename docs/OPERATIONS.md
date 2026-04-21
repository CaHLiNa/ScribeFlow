# 操作说明

## 标准验证

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`

调查阶段应运行能为当前改动切片提供最佳信心的检查；未完成相关验证前，不要宣称任务完成。

## 提交与推送

- 在本仓库中，只要用户没有明确禁止，Codex 在完成本轮改动并完成对应验证后，默认应自动执行 `git add`、`git commit` 和 `git push`。
- 提交信息使用 Conventional Commits。
- 如果自动推送被远端冲突、权限问题或其他阻塞因素打断，应先明确报告阻塞原因，再由 Codex 继续处理或等待用户决策。

## 备注

- 如果仓库策略变化，要同步更新本文档以及相关脚本。
