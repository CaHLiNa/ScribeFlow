# ScribeFlow AGENTS.md

适用范围：整个仓库。

## 协作基准

- 全程用中文回答，专业术语保留 English。
- 先读真实代码、`CURRENT-STATE.md` 和当前 `git status`，再判断改动范围。
- 未验证，不说完成；未提交推送，不说已落到远端。
- 用户给出明确方向时，默认直接实现、验证、提交、推送，不停在建议。
- 不回滚用户已有修改；如果工作区有无关 dirty files，只 stage 本次任务相关文件。

## 当前事实来源

当前事实以以下来源为准：

- `CURRENT-STATE.md`
- 当前代码和 scripts
- `package.json` scripts
- `src-tauri/src` runtime implementation

不要假设仓库里仍有旧 `docs/`、旧 `web/`、旧 sidecar 项目、旧 roadmap 文档或根 `README.md`。根目录长期文档应保持少量、当前、可验证；不要重新创建历史计划文档，除非用户明确要求。

## 当前仓形

ScribeFlow 是一个 local-first 的 Tauri 2 桌面学术写作与研究工作台。

目标架构是：Vue 3 frontend、TypeScript bridge、Rust backend/runtime。当前实现仍以 JavaScript + Vue SFC 为主，TypeScript bridge 是明确迁移方向，不是已经完成的现状。

主要代码边界：

- `src/app`：desktop lifecycle、workspace/session orchestration、shell wiring
- `src/components`：Vue UI surfaces
- `src/composables`：UI interaction helpers 和可复用 side-effect workflow glue
- `src/domains`：纯 presentation rules、labels、sorting、deterministic state derivation
- `src/editor`：CodeMirror/editor runtime helpers、TextMate grammar/theme vendoring
- `src/services`：当前 JavaScript bridge；目标是 TypeScript Tauri bridge、plugin/native event bridge、DTO compatibility、side-effect boundary
- `src/stores`：Pinia screen state、orchestration、loading/error lifecycle、service calls
- `src-tauri/src`：Rust backend/runtime authority
- `scripts`：boundary guards、runtime probes、bundle guard、release/version helpers

`dist/`、`node_modules/`、`src-tauri/target/` 是生成物或依赖目录，不作为产品事实来源。

## 产品主路径

当前主路径不是单纯 editor，也不是单纯 reference manager，而是桌面研究工作台：

- 打开、关闭、恢复本地 workspace
- 浏览和修改 workspace 文件树
- 恢复 editor tabs、document dock tabs 和 recent files
- 编辑 Markdown、LaTeX、Python
- 预览 Markdown、编译 LaTeX、查看 PDF、运行 Python
- 管理 references，支持 BibTeX、PDF metadata、Zotero
- 插入、同步、追踪 Markdown / LaTeX citations
- 管理 extension/plugin lifecycle、settings、runtime commands 和 right-sidebar surfaces
- 将 PDF actions、commands、capabilities、view reveal requests 默认路由到 plugin-owned document right sidebar tab
- 支持 plugin task timeline、artifacts、outputs、result entries、host prompts、secure settings 和 workspace-scoped runtime state

## 架构边界

目标边界：

- Frontend：Vue 3 负责 product UI、interaction state、loading/error/empty states 和用户意图表达。
- Bridge：TypeScript 负责 Tauri command wrappers、plugin/native event bridge、typed DTO adapters、compatibility boundary 和 side-effect entrypoints。
- Backend/runtime：Rust 负责 filesystem、workspace、persistence、reference/plugin/runtime authority 和安全边界。

当前实现状态：

- `src/` 目前仍以 JavaScript + Vue SFC 为主；不要把现有 JS bridge 描述成已经迁移完成的 TypeScript bridge。
- 存量 `src/services/**/*.js` 是过渡 bridge 层，仍必须遵守 bridge 边界。
- 新增或大改 bridge 模块时，优先向 `.ts`、typed DTO 和显式 command contract 收敛；如果项目尚未具备 TypeScript build/typecheck gate，迁移任务必须同时补齐 `tsconfig`、Vite 处理和验证脚本。
- 不能为了迁移 TypeScript，把 Rust authority 下沉到前端，或新增第二套 JS/TS backend center。

Rust backend/runtime 负责：

- filesystem、workspace access、path normalization、安全边界
- persisted app/workspace/reference/plugin state
- references normalization、query、mutation、import/export、PDF assets、Zotero sync
- LaTeX/Python/Markdown runtime contracts
- plugin discovery、manifest validation、permissions、extension host lifecycle
- extension commands、capabilities、tasks、artifacts、outputs、views、secure settings
- app update、workspace lifecycle、workbench state normalization

Vue 3 frontend 负责：

- UI rendering、local interaction state、loading/error/empty states
- Pinia screen coordination 和 service call orchestration
- native/plugin event presentation
- 纯 presentation/domain derivation

TypeScript bridge 目标负责：

- Tauri `invoke` wrappers 和 Tauri plugin calls
- Rust DTO 到 frontend shape 的 typed adapter
- compatibility boundary 和 legacy payload normalization
- native/plugin event subscription 与 cleanup
- side-effect entrypoint；不得承接 Rust 应拥有的 policy

Canonical layer 表：

| Layer | 责任 |
| --- | --- |
| Vue 3 frontend | render product surfaces, receive props, emit user intent, show loading/error/empty states |
| TypeScript bridge target | `src/services` should evolve toward typed Tauri commands, plugins, native events and DTO compatibility |
| Current JS bridge | existing `src/services/**/*.js` keeps the same bridge-only boundary until migrated |
| Pinia coordination | `src/stores` owns screen state, orchestration, loading/error lifecycle and service calls |
| Frontend domains | `src/domains` owns pure presentation rules, labels, sorting and deterministic state derivation |
| Rust backend/runtime | `src-tauri/src` owns filesystem, workspace state, references, runtime execution, persistence, plugins and security |

硬规则：

- `src/components`、`src/stores`、`src/domains`、`src/composables` 不直接 import Tauri API。
- Tauri `invoke`、Tauri plugin calls、native event bridge 只放在 `src/services`；目标形态是 typed TypeScript bridge。
- `src/services` 可以做 DTO compatibility，但不得成为第二套 backend；当前 JS bridge 也受同一限制。
- Pinia store 不拥有 filesystem、reference merge、LaTeX/Python runtime、plugin host 或 persisted schema policy。
- `src/domains` 不接触 native bridge、persistence、filesystem、process authority。
- Rust 返回 normalized result 后，前端再更新 UI state。
- 不恢复旧 localStorage / per-workspace migration path 作为 runtime authority；真实数据救援需要用户明确要求。

## Reference 规则

Reference 方向是 Rust-first：

- Rust 拥有 reference truth、snapshot normalization、query/search/filter、mutation outcome、import/export、PDF asset target resolution、citation formatting target lookup、Zotero sync result state。
- 前端只保留 UI presentation、DTO readers/adapters、service bridge、Pinia coordination、临时 UI state。
- Reference bridge 迁移目标是 typed TypeScript DTO adapter，不在 JS/TS 里重新实现 Rust query/mutation policy。
- `src/domains/references/referenceStoreState.js` 只适合 UI state/display helper，不放 canonical policy。
- `referenceResolvedQueryDto.js` 只适配 Rust DTO 给现有同步 UI/API，不重新实现 Rust query policy。

允许：

- `ReferenceDetailPanel.vue` 维护 local draft 并发出 save intent。
- `src/stores/references.js` 调用 `referenceRuntime` / `references_mutation_apply`，消费 Rust 返回的 snapshot/result。
- service wrapper 处理 camelCase DTO compatibility。

禁止：

- Vue component 直接写 normalized reference records。
- JS 重写 duplicate/merge/selection/export target/Zotero result policy。
- store 或 service 变成 reference backend。

## Plugin / Extension 规则

当前 plugin model 是 runtime-first、Obsidian-style、local owner-authored plugin 模型，不是 VS Code marketplace clone。

Rust/host 负责：

- plugin discovery、manifest validation、permissions
- persistent extension host lifecycle、crash recovery、workspace-scoped runtime slots
- commands、capabilities、menus、views、treeviews、tasks、artifacts、outputs
- secure settings、`globalState`、`workspaceState`
- prompt isolation、prompt recovery、disable/cancel semantics
- process bridge 和 PDF/reference bridge 的 permission enforcement

前端负责：

- Settings 中的 discovery/lifecycle/settings presentation
- document right sidebar plugin tabs、task timeline、result preview、blocked/waiting status UI
- command palette 和 action surface presentation

不要把 Settings 做成 plugin workbench；plugin 的实际使用入口默认属于 document right sidebar。

## Editor 规则

Editor 不是普通 leaf surface。涉及以下区域时必须单独收口验证，不要和无关 refactor 混做：

- `src/editor/**`
- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/EditorTextRouteSurface.vue`
- `src/components/editor/EditorTextWorkspaceSurface.vue`
- `src/components/editor/PaneContainer.vue`
- `src/composables/useTextEditorBridges.js`
- `src/stores/editor.js`
- `src/services/editorPersistence.js`
- `src-tauri/src/editor_session_runtime.rs`

Editor 相关改动必须说明并验证：

- cursor、selection、reveal、scroll
- session payload shape
- async file-content sync timing
- preview forward/reverse sync timing
- CodeMirror view lifecycle

这不是永久禁止编辑 editor，而是要求 editor work 独立、可验证、不能顺手混入其他迁移。

## Tauri Command Contract

改动以下任一项时，必须同一 commit 更新 Rust、service bridge、store call sites 和 probes/tests：

- Tauri command 名称
- 参数 shape
- 返回 JSON shape
- persisted state shape
- store action contract
- plugin host event payload
- reference/runtime DTO contract

没有 dedicated compatibility phase 时，不重命名现有 commands。需要兼容历史 persisted data 时，在 Rust normalizer 或 service DTO adapter 中明确写 compatibility boundary。

## 开发纪律

- 优先保持桌面主路径可运行。
- 新 runtime capability 优先落 Rust，前端保持 thin bridge。
- UI-local parser 不默认 Rustification，例如 CodeMirror decorations、Markdown table editing、snippet trigger、CSV preview parsing、DOM preview transforms。
- `documentWorkflow`、editor shell、session persistence、UI chrome 是 shared layer；没有明确任务，不和 leaf runtime migration 混改。
- 前端改动要同时考虑 i18n、响应式、状态空值、loading/error/empty states。
- 删除 UI/设置时，同时清理文案、store setter、持久化键、backend normalization 和 probes，避免只隐藏入口。

## 验证

标准 gate：

```sh
npm run verify
```

它包含：

- `npm run verify:quick`
- `npm run verify:extensions`
- `npm run verify:bridge`
- `npm run verify:build`
- `npm run verify:rust`

常用子 gate：

- `npm run guard:ui-bridges`
- `npm run guard:js-layer-boundaries`
- `npm run verify:bridge`
- `npm run guard:pdf-runtime`
- `npm run guard:textmate-runtime`
- `npm run check:bundle`
- `npm run check:rust`
- `npm run test:rust`

`probe:desktop-main-path-runtime-contract` 是 runtime contract smoke，不替代用户对桌面手感、视觉布局和交互体验的判断。不要建议新增自动化 Tauri smoke、自动化视觉评审或自动化交互验收，除非用户明确改变规则。

## Git 规则

- 提交信息使用 Conventional Commits。
- 每次完成代码、文档、配置或数据结构修改后，默认提交并推送当前分支。
- 提交前先看 `git status --short --branch`。
- 只 stage 本次任务相关文件；不要把无关 dirty files 捆进提交。
- 推送前完成与改动风险匹配的验证。
- 不执行破坏性 git 操作，除非用户明确要求。
- 不回滚用户已有修改；如果必须处理冲突，先说明具体冲突边界。

## 输出要求

完成任务时说明：

1. 做了什么
2. 改了哪些文件
3. 如何验证
4. 是否已 commit/push
5. 当前风险和下一步
