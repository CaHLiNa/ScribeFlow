# 文献库功能开发清单

## 目标

把仓库中已有的 references / reader / citation 产品方向，整理成一份可执行的开发清单，服务于 Altals 的 desktop-first academic research workbench。

## 依据文档

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/DOMAINS.md`
- `docs/DOCUMENT_WORKFLOW.md`

## 当前基线

### 已有能力

- 已有明确产品方向：project-scoped references、in-app reader、citation insertion、bibliography reliability。
- 已有 Markdown / LaTeX document workflow 分层与 preview/runtime 结构。
- 已有 PDF 预览与 hosted preview 基础设施，可作为 reader 的底层承载。
- 已有 LaTeX 侧与 citation/bibliography 相关的编辑器补全与编译诊断基础。
- 已有 workspace metadata boundary，可作为 references 数据与缓存的持久化边界。

### 目前缺口

- 还没有真正的 project references data model。
- 还没有 `src/domains/references/*` 与 `src/domains/reader/*` 实现。
- 还没有 references store、import pipeline、metadata normalization、duplicate handling。
- 还没有面向 Markdown 和 LaTeX 的正式 citation insertion flow。
- 还没有把 PDF 阅读、引用选择、bibliography 输出串成一个完整回路。

## 约束与边界

- 不把产品限制为 writing-first，而是把写作、文献管理、阅读视为并列核心工作流。
- 不把产品做成脱离项目工作台的独立 global library app。
- references 默认是 project-scoped，不先做全局文献库。
- reader 必须贴近当前 draft，不做脱离工作台的第二导航系统。
- 不改现有桌面工作台的核心交互模型，只在现有 shell 中扩展。
- policy 放在 `domains`，effectful IO / parsing / tooling 放在 `services`。

## 推荐实施顺序

1. 先做 project references foundation，再接 reader loop。
2. citation insertion 在 Phase 1 就必须打通最小链路，避免“有库无写作入口”。
3. references list 和 reader 入口都应是一级工作流，而不是只从 editor 附属进入。
4. bibliography reliability 放到 Phase 3，建立在 import 与 data model 稳定之后。
5. plugin-ready AI / translation seams 最后做，不阻塞 core offline workflow。

## Phase 0: Baseline Alignment

### 目标

把 references 功能落到现有架构边界中，先补齐最小骨架和测试锚点。

### Checklist

- [ ] 明确 workspace-owned references metadata 目录结构。
- [ ] 明确 references record 的 canonical schema。
- [ ] 明确 reader session state 与 citation session state 的 store 边界。
- [ ] 创建 `src/domains/references/` 与 `src/domains/reader/` 目录骨架。
- [ ] 创建 `src/services/references/` 与 `src/services/reader/` 目录骨架。
- [ ] 创建 `src/stores/references.js` 的初始状态模型。

### 交付物

- `src/domains/references/*`
- `src/domains/reader/*`
- `src/services/references/*`
- `src/services/reader/*`
- `src/stores/references.js`

### 验收标准

- 新模块命名和职责与 `docs/ARCHITECTURE.md` / `docs/DOMAINS.md` 一致。
- 不把 references policy 塞进组件或 Pinia store。

## Phase 1: Project References Foundation

### 目标

让文献从“可打开的文件”升级为“项目内可管理、可选择、可插入引用的正式资产”。

### Data Model

- [ ] 定义 reference record 字段：
  - `id`
  - `type`
  - `title`
  - `authors`
  - `year`
  - `container`
  - `doi`
  - `url`
  - `citationKey`
  - `sourceFiles`
  - `attachments`
  - `tags`
  - `notes`
  - `createdAt` / `updatedAt`
- [ ] 定义 attachment record 字段，支持 PDF 与后续 source material。
- [ ] 定义 import provenance 字段，记录 BibTeX / CSL-JSON / RIS / manual / PDF-derived 来源。
- [ ] 定义 workspace-level references index 格式。

### Persistence

- [ ] 在 workspace-owned metadata 中持久化 references records。
- [ ] 支持 app restart 后恢复 references state。
- [ ] 设计 schema version，避免后续 metadata 升级失控。
- [ ] 明确缓存文件与用户可编辑数据文件的边界。

### Import Pipeline

- [ ] 实现 `BibTeX` 导入适配器。
- [ ] 实现 `CSL-JSON` 导入适配器。
- [ ] 实现 `RIS` 导入适配器。
- [ ] 实现 direct PDF attachment 导入入口。
- [ ] 导入后生成 normalized reference records。
- [ ] 对缺失字段、格式错误、重复项给出基础诊断。

### Domain Policy

- [ ] 实现 `referenceLibraryRuntime.js`，负责 list / search / filter / select policy。
- [ ] 实现 `citationInsertionRuntime.js`，负责按文档类型选择插入策略。
- [ ] 明确 Markdown 与 LaTeX 的 citation token shape。
- [ ] 规定 references 与 active document workflow 的联动规则。

### Store

- [ ] `references.js` 维护 records、selection、filters、import status、errors。
- [ ] 支持按 workspace 初始化与销毁 state。
- [ ] 支持引用选择会话，不污染 editor 全局状态。

### UI

- [ ] 在现有 workspace shell 中增加 references entry，而不是新建独立 surface。
- [ ] 提供 basic references list。
- [ ] 提供 search / filter / select。
- [ ] 提供 reference detail 基础视图。
- [ ] 提供 import action 与错误反馈。
- [ ] 确保 references entry 在信息架构上与 editor/reader 同级可达。

### Citation Flow

- [ ] 从 references list 或 command entry 触发 citation insertion。
- [ ] Markdown 打通一条最小可用插入链路。
- [ ] LaTeX 打通一条最小可用插入链路。
- [ ] 插入逻辑读取当前 active file 的 workflow kind，而不是组件内硬编码。

### 测试

### 验收标准

- 用户打开项目后能看到项目 references。
- references 可以跨重启保留。
- Markdown 和 LaTeX 各自都能从同一 references source 成功插入 citation。

## Phase 2: In-App Reading Loop

### 目标

让用户能在同一 workspace 中一边读 PDF/source，一边写 draft，并保持上下文连续。

### Reader Session

- [ ] 定义 reader session state：
  - 当前打开文献
  - page / location
  - search query
  - selection context
  - 与 draft 的关联状态
- [ ] reader session 与 workspace state 关联，支持恢复。
- [ ] 区分“原始 PDF 打开”与“reference attachment 打开”两种路径。

### Reader Service

- [ ] 复用现有 PDF hosted preview / viewer 基础设施。
- [ ] 抽出 `src/services/reader/*`，避免 reader 逻辑继续散落在 editor preview 代码中。
- [ ] 支持 page navigation、search、selection capture。
- [ ] 预留 annotation / excerpt seam，但第一版不强做完整批注系统。

### Reader Policy

- [ ] 实现 `readerSessionRuntime.js`。
- [ ] 实现 `readerNavigationRuntime.js`。
- [ ] 定义从 reference -> reader -> draft 的跳转规则。
- [ ] 定义 reader 与 right-side inspection area 的最小联动方式。

### UI

- [ ] 提供从 references item 打开 reader 的入口。
- [ ] 支持 workbench-adjacent reader，而不是弹出独立窗口。
- [ ] 在 reader 中保留返回 draft 的快速路径。
- [ ] 在 draft 侧能识别当前 reader context。
- [ ] 确保 reader 可作为独立 primary activity 打开，而不是 editor 附属预览。

### Citation / Draft Linkage

- [ ] 从 reader selection 触发 citation insertion 或 reference selection。
- [ ] 支持从 active draft 反查当前 reference / attachment。
- [ ] 明确 reader selection 是否写回 notes/excerpts，若不做则显式留空。

### 测试

### 验收标准

- 用户可在同一 workspace 里并排阅读与写作。
- 切换 draft / reader 不丢上下文。
- reader 行为看起来属于同一工作台，而不是独立 mini-app。

## Phase 3: Bibliography And Metadata Reliability

### 目标

让导入的参考文献从“能看”提升到“可正式用于写作和输出”。

### Metadata Quality

- [ ] 增加 metadata editing UI。
- [ ] 增加 normalization pipeline。
- [ ] 增加 duplicate detection 与 merge decision。
- [ ] 增加 import diagnostics 与 recovery flow。

### Bibliography Planning

- [ ] 实现 `bibliographyPlanningRuntime.js`。
- [ ] 按 Markdown / LaTeX workflow 决定 bibliography 输出策略。
- [ ] 明确 bibliography file / generated artifact 的持久化位置。
- [ ] 支持 document-scoped bibliography decisions，而不是全局单一策略。

### Reliability

- [ ] 对缺 citation key、缺作者、缺年份、缺题名等情况给出明确状态。
- [ ] 对重复引用与重复附件给出去重策略。
- [ ] 对失败导入保留可恢复信息。

### 测试

### 验收标准

- bibliography 输出可预测、可测试。
- 用户不需要离开 Altals 做大量外部清洗。
- citation quality 提升，但流程不变成数据库维护工具。

## Phase 4: Plugin-Ready Research Extensions

### 目标

在不污染核心写作工作台的前提下，为 AI research / PDF translation 预留扩展缝。

### Checklist

- [ ] 为 references / reader 建立 plugin-capable service seams。
- [ ] 明确本地核心流程与 optional remote services 的边界。
- [ ] 规定 AI retrieval 只能基于 active project、draft、selected references。
- [ ] 规定 translation / AI 功能不能成为 core workflow 的强依赖。

### 验收标准

- 核心 app 在无 AI 的情况下仍然完整可用。
- 后续扩展不需要重写 references / reader 基础层。

## 优先级建议

### P0

- Phase 0 骨架
- Phase 1 data model
- Phase 1 persistence
- Phase 1 basic references list
- Phase 1 citation insertion for Markdown / LaTeX

### P1

- Phase 1 import adapters
- Phase 2 workbench-adjacent reader
- Phase 2 reader <-> draft linkage

### P2

- Phase 3 metadata normalization
- Phase 3 duplicate handling
- Phase 3 bibliography reliability

### P3

- Phase 4 plugin-ready seams

## 建议的最小可发布切片

第一版建议只覆盖下面 5 项：

- [ ] 定义 project references data model
- [ ] 将 references 持久化到 workspace-owned metadata
- [ ] 提供 basic references list / search / select
- [ ] 为 Markdown 和 LaTeX 各打通一条 citation insertion path
- [ ] 从 references item 打开 project PDF 到 workbench-adjacent reader

## 推荐文件落点

- `src/domains/references/referenceLibraryRuntime.js`
- `src/domains/references/citationInsertionRuntime.js`
- `src/domains/references/bibliographyPlanningRuntime.js`
- `src/domains/reader/readerSessionRuntime.js`
- `src/domains/reader/readerNavigationRuntime.js`
- `src/services/references/*`
- `src/services/reader/*`
- `src/stores/references.js`
- `src/components/references/*`
- `src/components/reader/*`
- `src-tauri/*` 中与 filesystem / metadata / tooling 相关的 typed seams

## 验证清单

- [ ] 功能切片完成后运行 `npm run build`

## 开始实施时的首个 issue 包

1. 建立 references schema 与 workspace metadata layout。
2. 新建 `src/domains/references/*` 和 `src/stores/references.js`。
3. 做一个只读 references list，先从本地 metadata 加载。
4. 接入最小 citation insertion runtime，先支持当前 active Markdown / LaTeX 文件。
5. 用现有 PDF 基础设施打通从 reference 打开 attachment 的 reader path。
