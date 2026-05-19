# ScribeFlow 当前状态

最后更新：2026-05-20

## 产品

ScribeFlow 是一个 local-first 的 Tauri 2 桌面学术写作与研究工作台。

当前桌面主路径：

- 打开、关闭并重新打开本地 workspace
- 浏览和修改 workspace 文件树
- 恢复 editor tabs、document dock tabs 和 recent files
- 编辑 Markdown、LaTeX 和 Python 文档
- 预览 Markdown、编译 LaTeX、查看 PDF 输出并运行 Python
- 管理来自 BibTeX、PDF metadata 和 Zotero 的 references
- 插入 Markdown 和 LaTeX citations
- 将选中文档 references 同步到 LaTeX bibliography files
- 检查 references 在 workspace 中的引用位置
- 配置 editor、workspace、PDF、citation、environment、Zotero 和 update settings

Extension / plugin 平台已从当前产品主路径移除；仓库不再保留 extension host、extension registry、extension settings、extension tasks、extension artifacts、内置示例 extensions 或相关 probes。

## 架构

目标架构是：Vue 3 frontend、TypeScript bridge、Rust backend/runtime。

当前实现状态：

- frontend 是 Vue 3 + Pinia + Vite，`src/` app 源码是 TypeScript + Vue SFC。
- TypeScript native bridge authority 由 `src/services/tauriBridge.ts` 统一封装 Tauri `invoke`、native events、app version、clipboard、dialog、shell 和 window APIs。
- 存量 `src/services/**/*.ts` 作为 feature-specific service wrappers / DTO adapters 存在，但它们只能通过 `tauriBridge.ts` 触达 native runtime。
- `tsconfig.bridge.json` 覆盖 native bridge authority；`tsconfig.app.json` 覆盖全量 `src/**/*.ts`；`tsconfig.tools.json` 覆盖 `scripts/**/*.ts`。
- Node engineering scripts 通过 `tsx scripts/*.ts` 执行。

主要代码边界：

- `src/app`：desktop lifecycle、workspace/session orchestration、shell wiring
- `src/components`：Vue UI surfaces
- `src/composables`：UI interaction helpers 和可复用 side-effect workflow glue
- `src/domains`：纯 presentation rules、labels、sorting、deterministic state derivation
- `src/editor`：CodeMirror/editor runtime helpers、TextMate grammar/theme vendoring
- `src/services`：TypeScript Tauri bridge、DTO compatibility、side-effect boundary
- `src/stores`：Pinia screen state、orchestration、loading/error lifecycle、service calls
- `src-tauri/src`：Rust backend/runtime authority
- `scripts`：Node TypeScript boundary guards、runtime probes、bundle guard、release/version helpers

Canonical layer 表：

| Layer | Responsibility |
| --- | --- |
| Vue 3 frontend | 渲染 product surfaces，接收 props，发出 user intent，展示 loading/error/empty states |
| TypeScript native bridge | `src/services/tauriBridge.ts` owns direct Tauri commands, native events and app/window APIs |
| Service wrappers | `src/services/**/*.ts` owns feature-specific DTO compatibility and side effects through `tauriBridge.ts` |
| Pinia coordination | `src/stores` 拥有 screen state、orchestration、loading/error lifecycle 和 service calls |
| Frontend domains | `src/domains` 拥有 pure presentation rules、labels、sorting 和 deterministic state derivation |
| Rust backend/runtime | `src-tauri/src` 拥有 filesystem、workspace state、references、runtime execution、persistence 和 security |

边界规则：

- Vue components、stores、domains 和 composables 不直接 import Tauri APIs。
- Tauri `invoke`、Tauri plugin calls 和 native event bridges 只属于 `src/services/tauriBridge.ts`。
- Rust 拥有 filesystem authority、persisted app state、reference normalization、compile/runtime execution 和 workspace-scoped security checks。
- 前端保持为 thin bridge 和 UI coordination layer，而不是第二套 backend。
- `src/domains` 不得获得 native bridge、persistence、filesystem 或 process authority。
- Tauri command payload shape 变化必须在同一 commit 中更新 Rust command handling、TypeScript bridge DTO mapping、store call sites 和 regression verification。
- Editor core changes 必须进入独立的 editor-specific phase；global module cleanup 不得改变 cursor、selection、reveal、scroll、CodeMirror behavior、editor session payloads 或 editor event timing。

## Reference Authority

Reference 方向是 Rust-first：

- Rust 拥有 reference truth、filesystem authority、persistence、mutation/result normalization、citation/render targets、imports、PDF assets 和 Zotero sync。
- TypeScript 保留 UI presentation、DTO compatibility、Tauri bridge wrappers 和 Pinia coordination。
- `src/domains/references/referenceStoreState.ts` 只包含 UI state/display helpers。
- `src/domains/references/referenceResolvedQueryDto.ts` 只适配 Rust DTO 给现有同步 UI/API。

允许：

- `ReferenceDetailPanel.vue` 编辑 local draft state 并发出 save intent。
- `src/stores/references.ts` 通过 service bridge 调用 Rust reference runtime，消费 Rust 返回的 snapshot/result。
- service wrapper 处理 camelCase DTO compatibility。

禁止：

- Vue component 直接写 normalized reference records。
- TypeScript 重写 duplicate/merge/selection/export target/Zotero result policy。
- store 或 service 变成 reference backend。

## Editor 稳定性契约

Editor 不是普通 leaf surface。涉及以下区域时必须单独收口验证，不要和无关 refactor 混做：

- `src/editor/**`
- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/EditorTextRouteSurface.vue`
- `src/components/editor/EditorTextWorkspaceSurface.vue`
- `src/components/editor/PaneContainer.vue`
- `src/composables/useTextEditorBridges.ts`
- `src/stores/editor.ts`
- `src/services/editorPersistence.ts`
- `src-tauri/src/editor_session_runtime.rs`

Editor 相关改动必须说明并验证：

- cursor、selection、reveal、scroll
- session payload shape
- async file-content sync timing
- preview forward/reverse sync timing
- CodeMirror view lifecycle

## 验证

标准 gate：

```sh
npm run verify
```

它包含：

- `npm run verify:quick`
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

`probe:desktop-main-path-runtime-contract` 是 runtime contract smoke，不替代用户对桌面手感、视觉布局和交互体验的判断。
