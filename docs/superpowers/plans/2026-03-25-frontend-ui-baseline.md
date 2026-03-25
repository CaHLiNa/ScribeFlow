# Frontend UI Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一套最小但真实生效的前端 UI 基线，并把主工作台壳层、设置弹窗与历史/确认弹窗切到这套基线。

**Architecture:** 继续沿用现有 Vue + 全局 CSS + 组件局部样式结构，不引入新 UI 框架。通过主题语义 token、共享 primitive 组件和主路径页面切换，把样式规则从散落写法收回到可复用边界。

**Tech Stack:** Vue 3, Vite, 全局 CSS variables, scoped CSS, Tabler icons

---

### Task 1: 设计 token 与全局 UI 入口

**Files:**
- Modify: `src/css/themes.css`
- Modify: `src/style.css`
- Create: `src/css/ui.css`

- [ ] Step 1: 在 `themes.css` 补语义 token 和 spacing/radius/shadow/z-index 基线。
- [ ] Step 2: 在 `ui.css` 补全共享 UI class，包括 dialog overlay/surface、表单行、focus ring、辅助文案和基础 action group。
- [ ] Step 3: 在 `style.css` 接入 `ui.css`，确保新基线全局可用。
- [ ] Step 4: 运行 `npm run build`，确认 token/class 变更没有引入样式编译问题。

### Task 2: 共享 primitive 组件

**Files:**
- Create: `src/components/shared/ui/UiButton.vue`
- Create: `src/components/shared/ui/UiInput.vue`
- Create: `src/components/shared/ui/UiModalShell.vue`
- Create: `src/components/shared/ui/UiSwitch.vue`

- [ ] Step 1: 实现 `UiButton.vue`，支持 `primary / secondary / danger / ghost` 和 `sm / md / lg`。
- [ ] Step 2: 实现 `UiInput.vue`，统一输入框 padding、边框、focus、disabled 和 slot 结构。
- [ ] Step 3: 实现 `UiModalShell.vue`，统一 overlay/surface/header/content/footer 容器。
- [ ] Step 4: 实现 `UiSwitch.vue`，统一设置页和轻量配置开关写法。
- [ ] Step 5: 运行 `npm run build`，确认 primitive 本身可编译。

### Task 3: 工作台壳层规范化

**Files:**
- Modify: `src/components/shared/ShellChromeButton.vue`
- Modify: `src/components/shared/SidebarChrome.vue`
- Modify: `src/components/layout/Header.vue`

- [ ] Step 1: 把 `ShellChromeButton.vue` 改成基于新 token 的图标按钮。
- [ ] Step 2: 收敛 `SidebarChrome.vue` 的 padding、border、gap 和 button 使用规则。
- [ ] Step 3: 清理 `Header.vue` 中明显的 `inline style` 与重复按钮/输入框外观写法。
- [ ] Step 4: 运行 `npm run build`。

### Task 4: 设置弹窗与表单基线

**Files:**
- Modify: `src/components/settings/Settings.vue`
- Modify: `src/components/settings/SettingsTheme.vue`
- Modify: `src/components/settings/SettingsEditor.vue`
- Modify: `src/components/settings/SettingsTools.vue`
- Modify: `src/components/settings/SettingsModels.vue`
- Modify: `src/components/settings/SettingsUsage.vue`

- [ ] Step 1: 让 `Settings.vue` 使用新的 modal 基线，统一标题区、导航区、内容区和 close 按钮规范。
- [ ] Step 2: 把设置页中的 toggle、输入框和主动作按钮切到 `UiSwitch` / `UiInput` / `UiButton`。
- [ ] Step 3: 清掉设置页里最明显的 `inline style`，改成共享 class 或局部类名。
- [ ] Step 4: 运行 `npm run build`。

### Task 5: 历史/确认弹窗基线

**Files:**
- Modify: `src/components/UnsavedChangesDialog.vue`
- Modify: `src/components/layout/SnapshotDialog.vue`
- Modify: `src/components/VersionHistory.vue`
- Modify: `src/components/WorkspaceSnapshotBrowser.vue`

- [ ] Step 1: 把四个弹窗切到统一 modal overlay/surface/action 样式。
- [ ] Step 2: 把主次操作按钮统一到 `UiButton`。
- [ ] Step 3: 清理弹窗标题、说明、列表和 footer 中的重复 `inline style`。
- [ ] Step 4: 运行 `npm run build`。

### Task 6: 文档与验证

**Files:**
- Create: `docs/FRONTEND_SPEC.md`
- Modify: `docs/REFACTOR_BLUEPRINT.md`

- [ ] Step 1: 写当前仓库真实可执行的 `FRONTEND_SPEC.md`，说明 token、primitive、目录/命名、禁止项和后续建议。
- [ ] Step 2: 更新 `REFACTOR_BLUEPRINT.md`，记录本次切片与风险。
- [ ] Step 3: 运行 `node --test tests/*.test.mjs`。
- [ ] Step 4: 运行 `npm run build`。
