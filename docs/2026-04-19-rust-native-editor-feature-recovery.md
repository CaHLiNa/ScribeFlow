# ScribeFlow Rust-Native Editor 功能恢复计划

> **面向 agent worker：** 本计划开始执行时，Rust-native editor 迁移切换已经结束。不要重新引入 CodeMirror，不要新增面向用户的 fallback editor，也不要把 `NativePrimaryTextSurface.vue` 再次做回一个大型语义组件。

**目标：** 在 Rust-native editor 路径之上，重新补齐缺失的编辑器呈现层与辅助能力，使 Markdown 与 LaTeX 写作恢复到移除 CodeMirror 之前的可用性水平。

**架构：** Rust 负责编辑器语义、上下文检查、completion / snippet planning 与 presentation snapshot generation。Vue 负责 host DOM、popup、menu、overlay 以及 workbench 级副作用。

**非目标：** 这不是迁移计划，也不是视觉重设计。这是一份切换完成之后的能力恢复计划。

---

## 当前缺口清单

当前 native primary surface 仍然缺失以下能力组：

1. syntax highlighting 与 token theming
2. 用于行号与折叠提示的 gutter rendering
3. active-line / selection-match / bracket-match / drop-cursor 视觉反馈
4. Markdown footnote 与数学公式 hover 预览
5. Markdown 格式快捷键
6. Markdown slash snippet 弹窗
7. wiki-link 自动补全
8. Markdown wiki-link 与 citation 的 inline semantic decoration
9. Markdown 表格插入 / 格式化命令
10. LaTeX 自动补全弹窗
11. 面向项目图谱的 LaTeX cite / ref / input / bibliography completion
12. LaTeX citation decoration 与 annotation
13. editor context menu 对齐

---

## 护栏

- 不要重新引入 CodeMirror 代码或依赖。
- 如果同样的逻辑本应属于 Rust，就不要用 Vue-only 的 regex 逻辑重建长期编辑器语义。
- 保持 `NativePrimaryTextSurface.vue` 轻量，把策略和语义 planning 放进 Rust 或 `src/domains/editor/*`。
- 除非更优且能恢复一致性的视觉结果确实需要更宽范围但连贯的改动，否则应保留现有桌面 shell 的视觉与交互方向。
- 在补回辅助层能力时，必须保持 Markdown 与 LaTeX 工作流兼容。

---

## 主要文件

### Native / runtime 侧

- `src-tauri/src/native_editor_bridge.rs`
- `src-tauri/src/native_editor_runtime.rs`
- `src-tauri/src/lib.rs`
- `src/services/editorRuntime/nativeBridge.js`
- `src/stores/editorRuntime.js`

### Domain 与 host 侧

- `src/domains/editor/nativePrimaryHostRuntime.js`
- `src/domains/editor/nativePrimarySurfaceRuntime.js`
- `src/components/editor/NativePrimaryTextSurface.vue`
- `src/components/editor/EditorContextMenu.vue`

### 必须保持可用的既有工作流界面

- `src/components/editor/DocumentWorkflowBar.vue`
- `src/services/documentWorkflow/adapters/markdown.js`
- `src/services/documentWorkflow/adapters/latex.js`
- `src/services/markdown/previewSync.js`
- `src/services/latex/previewSync.js`
- `src/domains/document/documentWorkspacePreviewRuntime.js`

---

## 任务 1：重建 Rust-Native 呈现层基础能力

**状态：** 进行中（Markdown 基础 host 已切到自绘 DOM 面）

**目标：** 恢复在移除 CodeMirror 渲染后消失的视觉与编辑反馈能力。

- [ ] **步骤 1：定义 native presentation snapshot contract**

Rust 应暴露一套类型化的 visible-slice snapshot，至少能描述：

- 每行可见 span
- syntax highlighting 的 token class
- wiki-link 与 citation 的 semantic mark
- active line
- selection 范围
- selection-match 范围
- bracket-match 范围
- 可选 drop-cursor position

- [ ] **步骤 2：实现 Rust 侧 visible-slice tokenization hook**

第一版先覆盖 Markdown 与 LaTeX token class，不允许在 Vue 中硬编码 tokenization。

Rust 第一版最少应提供这些 token / semantic coverage：

- heading
- emphasis 与 strong
- code span 与 fenced code
- link 与 URL
- list marker
- LaTeX 命令
- LaTeX 数学命令片段
- comment（如适用）
- citation 与 wikilink semantic span

- [x] **步骤 3：在不重新引入 CodeMirror 的前提下补一层 Vue host rendering**

`NativePrimaryTextSurface.vue` 应基于 Rust 提供的 presentation span 渲染视觉文本层。

期望输出：

- 可见文本的 syntax highlight
- wiki-link 与 citation 的 semantic decoration class
- active-line 视觉状态
- 与当前 editor chrome 一致的 selection 与 reveal 视觉反馈

当前实现说明：

- 可见文本、行号、caret 与 selection 已不再由系统 `textarea` 负责绘制
- `textarea` 仅保留为隐藏输入桥，用于键盘输入与 IME 接缝
- host 几何、selection block、caret 布局与命中测试已下沉到 `src/domains/editor/nativePrimaryHostRuntime.js`
- pointer selection request / plan、selection-match、reveal highlight 与 drop-cursor 已继续收进 Rust runtime snapshot 链

- [ ] **步骤 4：恢复 gutter rendering**

要求：

- 行号对齐稳定
- 滚动时不能出现布局抖动
- current-line emphasis 保持完整
- gutter 不应破坏 Markdown / LaTeX 的 preview sync 交互

- [ ] **步骤 5：恢复编辑器视觉反馈基础能力**

恢复：

- active line
- selection match
- bracket match
- reveal target 高亮
- 文件拖入时的 drop cursor visualization

- [ ] **步骤 6：验证呈现层对齐情况**

运行：

```bash
npm run build
```

然后分别在 Markdown 与 LaTeX 文件上手动验证：

- syntax color 正常出现
- gutter 正常出现
- active line 与 reveal highlight 可见
- 文件拖拽插入时仍能看到清晰的目标位置

---

## 任务 2：重建 Markdown 辅助与语义编辑能力

**状态：** 待处理

**目标：** 恢复 Markdown 写作 ergonomics，同时避免把长期编辑器语义重新塞回 Vue-only 逻辑。

- [ ] **步骤 1：恢复 Markdown formatting shortcut**

恢复：

- `Mod-b` bold toggle
- `Mod-i` italic toggle
- `Mod-Shift-x` strikethrough toggle
- `Mod-e` inline code toggle
- `Mod-k` insert link
- blockquote 切换
- 有序列表切换
- 无序列表切换

这些 transformation planning 应由 Rust 提供。

- [ ] **步骤 2：恢复 Markdown slash snippet**

恢复如下命令：

- `/h1`、`/h2`、`/h3`
- `/quote`
- `/list`、`/olist`
- `/code`
- `/math`
- `/footnote`
- `/image`
- `/table`

要求：

- Rust 负责识别 snippet trigger context 与 candidate set
- Vue 负责承载 popup 并应用用户选中的 replacement plan
- snippet 不能在 code span 或 fence 内触发

- [ ] **步骤 3：恢复 wiki-link autocomplete**

恢复：

- 文件名 completion
- `#` 后的标题 completion
- 正确的 replacement 与 cursor placement
- 在 code context 中不应激活

- [ ] **步骤 4：恢复 Markdown inline semantic decoration**

恢复以下可见区分：

- 有效 wiki-link
- 失效 wiki-link
- citation 分组
- 失效 citation key

- [ ] **步骤 5：恢复 Markdown hover affordance**

恢复：

- footnote 悬停预览
- inline math 悬停预览
- display math 悬停预览

- [ ] **步骤 6：恢复 Markdown 表格命令**

恢复：

- 插入表格
- 格式化当前表格
- 表格相关 keyboard shortcut
- 原先存在时，在 context menu 中重新暴露

- [ ] **步骤 7：验证 Markdown 辅助能力对齐**

手动验收必须覆盖：

- shortcut 切换
- slash snippet
- wikilink 自动补全
- broken-link 样式
- footnote / math 悬停
- 表格插入 / 格式化

---

## 任务 3：重建 LaTeX 辅助与语义编辑能力

**状态：** 待处理

**目标：** 恢复 LaTeX 写作辅助、面向项目的 completion，以及可见语义反馈。

- [ ] **步骤 1：恢复静态 LaTeX command autocomplete**

恢复结构化 completion，至少包括：

- sectioning 命令
- 文本格式命令
- environment snippet
- 数学命令
- include / bibliography 命令
- 文档初始化相关 command

- [ ] **步骤 2：恢复面向项目的 LaTeX completion**

恢复以下 completion flow：

- cite / nocite
- ref / eqref / pageref / autoref / cref
- input / include / subfile
- bibliography / addbibresource

这部分应复用现有 project graph / document intelligence service 作为数据输入，同时把 completion context parsing 放在 Rust。

- [ ] **步骤 3：恢复 LaTeX citation decoration**

恢复以下可见区分：

- LaTeX citation 命令
- citation key
- 失效 citation key
- 可选的 post-citation inline annotation，例如 author / year

- [ ] **步骤 4：在 native 路径上保持 formatter integration**

确保 native 路径仍完整支持：

- 显式 format-document 命令
- format-on-save
- 格式化后不会破坏 cursor
- 格式化后不会造成 dirty-state desynchronization

- [ ] **步骤 5：验证 LaTeX 辅助能力对齐**

手动验收必须覆盖：

- autocomplete popup 的出现与插入
- 基于真实 project graph 的 cite / ref / input completion
- citation decoration 可见
- format document
- format on save

---

## 任务 4：重建 shell 级编辑器交互一致性

**状态：** 待处理

**目标：** 恢复原旧编辑器路径曾提供、但当前仍缺失的 shell 行为。

- [ ] **步骤 1：重新接上 editor context menu**

恢复 `EditorContextMenu.vue` 的集成，至少包括：

- right-click / control-click 打开行为
- 感知选区的 action
- 适用时的 Markdown table action
- 适用时的 LaTeX format-document action

- [ ] **步骤 2：恢复上下文敏感 action 的命令路由**

native surface 应暴露：

- format document
- 插入 Markdown 表格
- 格式化 Markdown 表格
- 在上下文有效时进行 citation edit / insert

- [ ] **步骤 3：验证选区与交互保真度**

检查：

- double-click 行为
- right-click 不应意外破坏当前 selection
- keyboard save 与 formatting command 仍然有效
- context menu 与 presentation 变化后，drag insertion 仍然可用

- [ ] **步骤 4：记录最终 host / runtime 职责拆分**

更新文档，明确写清：

- Rust 负责 editor semantics、context inspection、completion planning 与 presentation snapshot
- Vue 负责 host DOM、popup、menu 与 workbench-level side effect

---

## 任务 5：最终恢复审计与签收

**状态：** 待处理

**目标：** 通过一轮与真实编辑器能力面一致的验证闭环，完成恢复工作签收。

- [ ] **步骤 1：运行代码级验证**

针对改动切片，运行当前最强的实用验证组合：

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p scribeflow-editor-core
```

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

```bash
npm run build
```

- [ ] **步骤 2：运行桌面工作流验证**

运行：

```bash
npm run tauri -- dev
```

最少验证以下路径：

- Markdown draft 配合 toolbar 与 preview
- Markdown 格式快捷键
- Markdown snippet 与 wikilink
- LaTeX toolbar、compile、preview 与 SyncTeX
- LaTeX autocomplete 与 formatter integration
- file-tree 拖拽插入
- citation insert 与 citation edit

- [ ] **步骤 3：对照完整缺口清单逐项核对**

只有在文首列出的 13 个缺失能力组全部有证据标记为 resolved 之后，才能签收这项工作。

- [ ] **步骤 4：执行最终 postflight 审计**

如果仓库脚本可用，运行：

```bash
npm run agent:codex-postflight -- --plan docs/superpowers/plans/2026-04-19-rust-native-editor-feature-recovery.md
```

如果当前环境无法运行该脚本，则手动审计并记录：

- 已完成任务
- 待完成任务
- 偏离项
- 风险
- 验证证据
- 下一步

- [ ] **步骤 5：只有在此之后才能宣告功能恢复完成**

完成标准：

- 文首列出的 13 个缺失能力组全部解决
- 没有任何面向用户的工作流仍依赖已删除的 CodeMirror 代码
- 文档对 native editor 架构的描述准确无误

---

## 推荐执行顺序

1. 任务 1：presentation primitive
2. 任务 2：Markdown assist
3. 任务 3：LaTeX assist
4. 任务 4：shell interaction parity
5. 任务 5：最终审计与签收

不要在只恢复一两个最明显回归点之后就停止。
