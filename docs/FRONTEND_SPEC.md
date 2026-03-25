# Frontend Spec

## 1. Scope

本文档描述 Altals 当前仓库里已经落地、并要求后续前端代码继续遵守的最小前端规范。它描述的是当前真实代码，不是理想化终态。

Altals 的前端首先服务于本地研究工作流：打开项目、浏览文件、编辑文档、运行与预览、查看历史、引用资料、发起可审计 AI 工作流。

## 2. Tech Stack

- Vue 3 + Vite
- Pinia
- Tauri desktop shell
- 全局 CSS variables + scoped CSS
- Tailwind utilities 只作为补充，不作为主要设计系统

当前主样式方案仍然是“全局 token + 组件局部样式”。不要在同一块功能里再混入新的 CSS-in-JS、组件库主题系统或另一套原子化规范。

## 3. Directory Rules

- `src/app`
  顶层壳层编排与 surface 连接
- `src/domains/*`
  工作流与运行时决策
- `src/services/*`
  effectful integrations / provider adapters
- `src/components/*`
  渲染与用户输入收集
- `src/composables/*`
  可复用 UI glue
- `src/stores/*`
  响应式状态与薄封装
- `src/shared/*`
  跨 surface 共享的 UI/runtime 元数据
- `src/css/*`
  全局样式入口、主题 token、跨组件共享样式

新增前端基础能力时优先落在：

- token：`src/css/themes.css`
- 共享结构样式：`src/css/ui.css`
- 共享 primitive：`src/components/shared/ui/*`

## 4. Naming

- 组件：PascalCase，例如 `UiButton.vue`
- 变量/函数：camelCase
- 常量：UPPER_SNAKE_CASE
- CSS class：kebab-case
- 文件夹：保持现有目录风格，新增共享 UI primitive 放在 `shared/ui`

不要在同一层里混用 `snake_case`、`PascalCase` 和无意义缩写类名。

## 5. Design Tokens

主题主色仍然来自 `src/css/themes.css` 里的现有变量，例如：

- `--bg-primary`
- `--bg-secondary`
- `--fg-primary`
- `--accent`
- `--success`
- `--warning`
- `--error`

新代码优先使用语义 token：

- 文字：`--text-primary` / `--text-secondary` / `--text-muted`
- 背景：`--surface-base` / `--surface-raised` / `--surface-muted` / `--surface-hover`
- 边框：`--border-subtle` / `--border-strong`
- 交互：`--focus-ring` / `--overlay-backdrop`
- 间距：`--space-1` ~ `--space-6`
- 圆角：`--radius-sm` / `--radius-md` / `--radius-lg`
- 阴影：`--shadow-sm` / `--shadow-md` / `--shadow-lg`
- 层级：`--z-dropdown` / `--z-modal` / `--z-toast`

禁止直接新增硬编码颜色、阴影和 z-index，例如：

- `color: #333`
- `background: rgba(...)`
- `z-index: 9999`

如果当前 token 不够用，先补 token，再写样式。

## 6. Typography

当前 UI 基线保持克制的桌面端排版：

- 正文优先 `var(--ui-font-body)`
- 次级信息优先 `var(--ui-font-caption)`
- 小标题优先 `var(--ui-font-title)`
- 字重只用 `400 / 500 / 600`
- 行高优先 `--line-height-compact / regular / relaxed`

不要在组件里随意堆 `11px / 13px / 15px / 17px` 之类的离散尺寸。

## 7. Primitive Components

当前共享 primitive：

- `src/components/shared/ui/UiButton.vue`
- `src/components/shared/ui/UiInput.vue`
- `src/components/shared/ui/UiSelect.vue`
- `src/components/shared/ui/UiTextarea.vue`
- `src/components/shared/ui/UiModalShell.vue`
- `src/components/shared/ui/UiSwitch.vue`
- `src/components/shared/ShellChromeButton.vue`

使用规则：

- 标准操作按钮优先 `UiButton`
- 文本/密钥/轻量表单输入优先 `UiInput`
- 下拉选择优先 `UiSelect`
- 多行文本输入优先 `UiTextarea`
- 普通弹窗优先 `UiModalShell`
- 设置类开关优先 `UiSwitch`
- 工作台壳层图标按钮继续用 `ShellChromeButton`

`UiButton` 变体：

- `primary`
- `secondary`
- `danger`
- `ghost`

`UiButton` 额外约定：

- 需要选中态时用 `active`
- 需要承载卡片/多行内容时用 `contentMode="raw"`，不要为了多行文案重新回退到裸 `button`

`UiButton` 尺寸：

- `sm`
- `md`
- `lg`
- `icon-sm`
- `icon-md`

规则：

- 一个局部区域通常只有一个主按钮
- 危险操作必须用 `danger`
- `loading` 时不可重复提交
- 图标按钮必须有 `title` 或 `aria-label`

补充约定：

- 需要数字输入时优先用 `v-model.number` 搭配 `UiInput`
- 设置页里的次级操作优先用 `UiButton` 的 `secondary` 或 `ghost`
- 设置页里的布尔开关不再新增 `tool-toggle-switch` 这类局部历史样式
- 设置页里的表单控件不再新增原生 `input / select / textarea` 的局部视觉壳，统一走共享 primitive
- 设置页里的选择卡片、分段切换、展开/收起入口也继续复用 `UiButton`，只允许在共享 settings 样式层补布局差异
- `src/components/settings/**/*.vue` 不再直接写原生 `button / input / select / textarea`

## 8. Layout Rules

主工作台继续使用：

- Header
- Left sidebar
- Main work area
- Optional right sidebar
- Footer / bottom panel

布局规则：

- 头部只放全局 chrome，不把 panel 选择堆回 Header
- 侧边栏 panel 入口留在 sidebar chrome 内
- 侧边栏宽度统一受布局 runtime clamp 控制
- 弹窗统一使用 token 化 overlay、surface、radius、shadow
- 设置弹窗采用左导航 + 右内容的固定结构

## 9. Styling Rules

允许：

- 基于 token 的 scoped CSS
- 少量必须依赖运行时尺寸的 `:style`
- Tailwind utilities 作为布局补充

不允许：

- 用 `inline style` 写固定颜色、固定间距、固定边框
- 在多个组件复制相同按钮/输入/弹窗样式
- 新增另一套按钮或开关视觉系统
- 无规则的 `!important`

`inline style` 只应保留在这些场景：

- 宽高/位置来自运行时数值
- SVG/chart 几何参数
- 主题预览这类由数据驱动的展示色块

## 10. State And Data Rules

- 组件内部局部交互：组件内状态或 composable
- 跨页面 / 跨 surface 状态：Pinia store
- 工作流决策：`domains/*`
- 外部调用与进程/平台交互：`services/*`

不要把 UI 规范实现塞进 store，也不要把业务流转埋进组件样式层。

## 11. Interaction Rules

- 所有可点击控件必须有 hover / focus-visible / disabled 状态
- 危险操作文案必须说明后果
- 关闭类弹窗必须支持 `Esc`
- loading、empty、error 状态必须可见，不要留白屏
- 图标按钮必须有 tooltip 或 `aria-label`

## 12. Accessibility Rules

- 焦点态必须可见，统一走 `--focus-ring`
- 颜色不能只靠红绿区分
- 图标按钮点击区不能过小
- 辅助文案不要只写“失败了”，应尽量说明原因

## 13. I18n Rules

- 前端可见文案必须优先通过 `t('...')` 输出，不要继续新增裸英文 UI 文案
- 新增 `t('...')` 键时，必须在 `src/i18n/index.js` 的 `ZH_MESSAGES` 里同步补齐中文
- 新增配置数组时，像 `labelKey / hintKey / placeholderKey / titleKey / descriptionKey` 这类动态 i18n 键也必须同步补齐中文
- `title`、`aria-label`、按钮文案、空态/错误提示、toast 文案都算前端可见文案，不能只翻正文
- 当前仓库已经收敛到“字面量 `t('...')` 键 + 常见动态 key 字段在中文包里无缺失”，后续新增改动不能把这个状态打破

## 14. Current Gaps

当前还没有完全收敛的部分：

- 编辑器、Notebook、PDF toolbar 仍保留较多历史样式
- lint / format 目前只覆盖当前前端基线范围，还没有扩展到整个仓库
- 仓库还没有 Stylelint，样式层规则仍主要依赖 token 约束和代码评审

这些属于后续切片，不代表可以继续无规则新增旧写法。

## 15. Engineering Baseline

当前仓库已经落地：

- `eslint.config.js`
- `.prettierrc.json`
- `.prettierignore`
- `npm run lint`
- `npm run lint:fix`
- `npm run format`
- `npm run format:check`

当前 `lint` 的覆盖范围是这轮已经切到新基线的前端面：

- `src/components/settings/**/*.vue`
- `src/components/shared/**/*.vue`
- `src/shared/**/*.js`

这样做是为了先把新基线钉稳，不把整个历史仓库一次性卷进规则迁移。后续可以随着旧债清理逐步外扩。

## 16. Next Recommended Slice

- 继续迁移编辑器、PDF、Notebook 周边的历史按钮/输入/toolbar 写法
- 逐步把 `lint` 范围从 `settings/shared` 扩到主工作台 shell 和 editor-adjacent surface
- 如果设置页之外开始重复出现选择卡片或分段按钮，优先扩展现有 `UiButton` + 共享样式，不要回到页面私有按钮皮肤
- 下一轮 i18n 更值得做的是继续审计“还没包进 `t()` 的裸可见文案”，而不是只补语言包缺失键
