# 架构说明

## 默认结构

- `src/app`：shell 生命周期、应用启动与桌面编排。
- `src/domains/*`：产品策略与可复用的运行时决策。
- `src/services/*`：带副作用的集成层与桥接代码。
- `src/stores/*`：响应式状态与轻量协调。
- `src/components/*`：UI 渲染与用户意图发射。
- `src/composables/*`：可复用的 UI 胶水。
- `src-tauri/*`：原生后端命令、进程执行、文件系统访问与类型化桌面接缝。

## 当前 Authority

- Rust owns:
  workspace preferences、workspace lifecycle、workbench shell layout、editor session/recent files、document workflow session/preview binding/ui resolve/action resolve、references snapshot/merge/citation/BibTeX、LaTeX preferences 与 compile/runtime 底层能力。
- Frontend owns:
  组件渲染、Pane/UI 交互、transient view state、optimistic patch、backend resolve 的输入采集与短期 cache。
- Browser preview fallback:
  仅服务非桌面环境预览与 demo，不再代表桌面产品权威。

## 方向性规则

- 能放在 `domains` 的产品策略，不要留在组件层。
- `services` 保持有副作用，但策略要尽量轻。
- `stores` 要持续保持薄，不要演化成另一层策略中心。
- 优先做边界明确、可验证、并能把系统推向最优架构的切片，而不是保守地做无效增量。

## Legacy Boundaries

- legacy 层必须分成 `migration-only`、`fallback-only`、`temporary compat` 三类，不允许模糊地长期共存。
- 只要 Rust authority 已覆盖主路径，就要删除前端同级 authority；剩余 legacy 只能保留为一次性迁移或只读兼容。
- 当前 document workflow 的 legacy preview pane 已退出主路径，保留的 `preview:` tab 恢复逻辑只属于 editor session / workspace preview 的 temporary compat。
- 每条 legacy path 都必须在审计文档里写明 delete condition 和 owner；没有退出条件的 legacy 分支视为需要优先清理。

## Quality Gate

- 本地与 CI 必须共用同一套 baseline 命令入口，避免出现“CI 跑的是另一套脚本”。
- release workflow 必须依赖或重复 baseline quality gate，不能让打包发布成为首次完整验证。
- 质量门的默认基线包括 frontend `check`、Rust `check` 和 Rust `test`；新增 phase 默认应复用这套基线，而不是重新发明检查入口。

## Module Boundaries

- `latex` 运行时已按 facade / compile / diagnostics 拆分：
  `latex.rs`、`latex_compile.rs`、`latex_diagnostics.rs`。
- `references` 运行时已按 facade / snapshot / merge 拆分：
  `references_runtime.rs`、`references_backend.rs`、`references_snapshot.rs`、`references_merge.rs`。
- 后续新增能力应优先进入这些 bounded context，而不是重新把实现堆回 facade 文件。

## 桌面 UX 护栏

- 除非用户明确批准更大范围的 UI 变化，否则应保留现有桌面端视觉与交互方向。
- 如果为了修复 bug 必须改前端，应追求最优且一致的 UI 结果，而不是为了“少改一点”牺牲质量。
- 优先选择精致的 macOS 原生体验，而不是泛化的跨平台外壳。
