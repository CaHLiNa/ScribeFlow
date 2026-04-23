# 文档工作流

## 适用范围

本文档覆盖桌面应用中的预览、编译、编辑器与文档工作流决策。

## 工作流规则

- 在内部实现演进过程中，把文档工作流推进到最优形态，同时确保编译与预览端到端正确。
- Markdown 与 LaTeX 都必须是一等文档源。
- Python 作为二级工作流源，需要支持统一工具条和终端输出预览；主动作应直接运行脚本并在预览区显示 stdout / stderr。
- Python 运行时需要检测所有可用解释器，并允许像 LaTeX 编译器一样在环境设置中自由切换；运行当前脚本时必须严格使用当前所选解释器。
- 预览、编译、诊断与大纲流要与当前活动文件保持一致。
- 当文档工作流行为发生变化时，在同一切片里同步更新文档与测试。

## 架构指导

- 文档策略尽量放在 `src/domains/document/*`。
- 文件格式适配器要与 `src/services/documentWorkflow/adapters/*` 和 `src/domains/document/*` 下的运行时适配层保持一致。
- 编辑器相关的 UI 胶水放在 `src/components/*` 和 `src/composables/*`，不要塞进业务策略模块。

## 当前 Authority 分布

- Rust owns:
  preview binding normalize、document workflow session、detached/reopen state、workspace preview state resolve、workflow UI state resolve、action availability、preview close/open effect。
- Frontend owns:
  preview surface 渲染、工具条事件触发、markdown render transient state、compile queue 输入采集与 resolve cache。
- Legacy compat:
  旧 `preview:` tab 仍可通过只读路径恢复，但它不再是新的 preview 主路径。

## Legacy Off-Ramp

- 主 document workflow 已不再主动走 legacy preview pane；Markdown / LaTeX / Python 的主预览语义统一落在 workspace preview 与 Rust action / state resolve。
- 历史 `preview:` tab 仍允许以只读兼容方式恢复，目的是避免旧会话恢复时制造脏状态，而不是继续作为新 workflow capability。
- `editor_session_runtime` 中的 `legacyPreviewPaths` 只用于历史会话恢复与安全保存，不得再作为新增功能的依赖面。
- 如果后续切片继续改动 preview / workflow 行为，必须优先删除已失效的 legacy branch，而不是在其上继续叠兼容。

## 验证

- 调查时运行能为当前文档工作流改动提供最佳覆盖的检查，而不是只跑最窄的一组命令。
- 只要前端或集成层有实质变化，就运行 `npm run build`。
- 只要 Tauri / 后端接缝有变化，就运行 `cargo check --manifest-path src-tauri/Cargo.toml`。
- 只要预览或编译行为有变化，就至少用一条真实文档路径做端到端验证。
- release-affecting 文档工作流改动默认还应跑 `npm run check`、`npm run check:rust`、`npm run test:rust`。
