# Frontend UI Baseline Design

## Goal

为 Altals 建立一套当前代码库真实可落地的前端基线规范，并在主工作台壳层、设置弹窗、历史弹窗这三条高频路径上落地，减少颜色/间距/按钮/弹窗样式分叉、`inline style` 扩散和局部重复实现。

这不是一次全仓 UI 重写。目标是先建立可复用的设计 token 和基础 primitive，再把最常用路径切到这套基线，为后续页面收敛提供真实依赖点。

## Current Problems

- `src/css/themes.css` 已经存在主题 token，但更多是主题色变量，不是完整的语义设计 token。
- `src/components/**` 中大量存在 `inline style`、散落的圆角/阴影/间距写法、重复的按钮和弹窗样式。
- `Settings.vue` 已经承担了一部分全局设置样式，但缺少明确的按钮/输入框/弹窗 primitive，导致各 section 继续局部扩写。
- `VersionHistory.vue`、`WorkspaceSnapshotBrowser.vue`、`UnsavedChangesDialog.vue`、`SnapshotDialog.vue` 分别维护相近但不一致的弹窗外观与动作按钮规范。
- 主工作台壳层（Header / Sidebar chrome）已经有一轮结构收敛，但按钮状态、焦点态、点击区、间距 token 还没有统一落在更清晰的 UI 基线上。

## Scope

本次切片只做四件事：

1. 补一层语义设计 token，不推翻现有主题变量。
2. 引入共享 UI primitive，至少覆盖 `Button`、`Input`、`Modal`，并顺手补 `Switch`。
3. 让主工作台壳层、设置弹窗和两类历史/确认弹窗切到新基线。
4. 补一份仓库当前真实规范文档，说明新增 token、primitive、禁止项和推荐写法。

## Non-Goals

- 不重做编辑器、Notebook、PDF toolbar 等重交互界面。
- 不一次性消灭所有 `inline style`。
- 不引入新的组件库或 CSS-in-JS 方案。
- 不改变现有 store、domain、service 的业务边界。
- 不在本轮引入 ESLint / Prettier / Stylelint 依赖升级；只在文档里记录为后续建议。

## Design Decisions

### 1. Token strategy

继续保留现有主题变量，例如 `--bg-primary`、`--fg-primary`、`--accent`。在其上新增更清晰的语义 token：

- 文字：`--text-primary` / `--text-secondary` / `--text-muted`
- 背景：`--surface-base` / `--surface-raised` / `--surface-hover`
- 边框：`--border-subtle` / `--border-strong`
- 交互：`--focus-ring` / `--overlay-backdrop`
- 间距：`--space-1` 到 `--space-6`
- 圆角：`--radius-sm` / `--radius-md` / `--radius-lg`
- 阴影：`--shadow-sm` / `--shadow-md` / `--shadow-lg`
- z-index：`--z-dropdown` / `--z-modal` / `--z-toast`

旧 token 不删除，新组件优先使用新 token，旧代码允许逐步迁移。

### 2. Primitive strategy

引入共享 primitive，而不是只写全局 class：

- `UiButton.vue`
- `UiInput.vue`
- `UiModalShell.vue`
- `UiSwitch.vue`

原因：

- Vue 组件可以把尺寸、variant、disabled、loading、icon-only、focus 状态收在一处。
- 主工作台、设置页和弹窗都能复用，不必继续各写一套按钮/输入/遮罩。
- 比只补 CSS 类更容易在后续页面强制收敛。

### 3. Workbench shell adoption

不重写 shell 结构，只统一外观：

- `ShellChromeButton.vue` 切到新的 token 体系。
- `Header.vue` 的搜索壳和按钮状态改为使用共享 class/token，减少局部 `inline style`。
- `SidebarChrome.vue` 与 shell 按钮的 padding / radius / focus / hover 统一。

### 4. Settings adoption

设置系统继续保留 `Settings.vue` 作为主容器，但提炼共用外观：

- 设置弹窗外壳用 `UiModalShell`
- 设置区里的动作按钮、输入框、开关切到共享 primitive
- 收敛 `settings-section-title`、`env-lang-card`、`keys-actions` 一类高频样式
- 先落在 `Settings.vue`、`SettingsTheme.vue`、`SettingsEditor.vue`、`SettingsTools.vue`、`SettingsModels.vue`、`SettingsUsage.vue`

### 5. Dialog adoption

下列弹窗先切到统一 modal 基线：

- `UnsavedChangesDialog.vue`
- `SnapshotDialog.vue`
- `VersionHistory.vue`
- `WorkspaceSnapshotBrowser.vue`

目标不是完全相同内容布局，而是共享：

- overlay/backdrop
- surface 边框、圆角、阴影
- title/action 区间距
- 关闭按钮与主次操作按钮风格

## File Plan

- `src/css/themes.css`
  补语义 token 和 spacing/radius/shadow/z-index 基线
- `src/style.css`
  接入新的全局 UI 样式入口
- `src/css/ui.css`
  放全局 primitive 配套 class 和可跨组件复用的结构样式
- `src/components/shared/ui/UiButton.vue`
- `src/components/shared/ui/UiInput.vue`
- `src/components/shared/ui/UiModalShell.vue`
- `src/components/shared/ui/UiSwitch.vue`
- `src/components/shared/ShellChromeButton.vue`
- `src/components/shared/SidebarChrome.vue`
- `src/components/layout/Header.vue`
- `src/components/settings/Settings.vue`
- `src/components/settings/SettingsTheme.vue`
- `src/components/settings/SettingsEditor.vue`
- `src/components/settings/SettingsTools.vue`
- `src/components/settings/SettingsModels.vue`
- `src/components/settings/SettingsUsage.vue`
- `src/components/UnsavedChangesDialog.vue`
- `src/components/layout/SnapshotDialog.vue`
- `src/components/VersionHistory.vue`
- `src/components/WorkspaceSnapshotBrowser.vue`
- `docs/FRONTEND_SPEC.md`
- `docs/REFACTOR_BLUEPRINT.md`

## Validation

- `npm run build`
- `node --test tests/*.test.mjs`

本切片主要是样式与共享组件收敛，不额外扩展新的测试框架。验证以构建和现有回归测试为主。
