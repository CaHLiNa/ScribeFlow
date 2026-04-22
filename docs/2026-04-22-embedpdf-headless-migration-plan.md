# EmbedPDF Headless 迁移计划

## 背景

当前桌面端 PDF 预览建立在仓库内 vendored 的 PDF.js viewer 之上，并在外层叠加了大量 ScribeFlow 定制能力：

- 基于 iframe 的预览壳层与事件桥接
- 主题同步、页面背景策略与 Safari canvas fallback
- LaTeX forward / reverse SyncTeX
- 文档重载后的 view state 恢复
- 注释保存与 PDF 回写
- 外链拦截、上下文菜单与桌面工作流集成

这套方案当前可用，但存在两个持续成本：

1. `public/pdfjs-viewer/*` 需要长期维护 fork / patch。
2. 预览能力直接依赖 `PDFViewerApplication` 内部实现，后续演进边界不清晰。

EmbedPDF 提供 `Headless + Plugin + Engine` 模式，允许我们保留自定义 UI 和产品工作流，同时把底层 PDF viewer runtime 从 PDF.js viewer fork 迁移到可组合的能力层。

## 目标

本 phase 的目标不是一次性替换全部 PDF.js 集成，而是建立一条可渐进迁移的并行后端路线：

- 保持现有 PDF.js 方案继续可用
- 在现有 `PdfArtifactPreview` 下增加可切换的 `EmbedPDF Headless` 后端
- 把“选择哪种 PDF viewer backend”从具体组件实现里抽离出来
- 先验证最小能力闭环：加载文档、渲染页面、滚动浏览、基础缩放
- 为后续接入 view state、保存、SyncTeX、搜索和注释预留稳定 adapter 边界

## 非目标

本阶段不完成以下能力：

- 替换现有默认 PDF.js 预览路径
- 删除 `public/pdfjs-viewer/*`
- 完整迁移 forward / reverse SyncTeX
- 迁移 PDF 注释保存与回写
- 完整复刻当前右键菜单、外链桥接与 iframe 补丁

## 约束

- 默认用户路径必须继续走现有 PDF.js backend，避免打断当前桌面研究工作流。
- 新后端必须通过独立 backend selector 启用，不能直接覆盖生产路径。
- `PdfArtifactPreview` 继续作为统一入口，避免调用方感知 backend 差异。
- 文档读取优先复用现有 Tauri 文件读取能力，不在前端新增第二套文件系统权威。
- 计划中的接口命名与文件落点必须服务于后续扩展，不能把 EmbedPDF 细节散落到组件层。

## 现有边界

### 当前入口

- `src/components/editor/PdfArtifactPreview.vue`
- `src/components/editor/PdfIframeSurface.vue`

### 当前外围能力

- `src/services/pdf/artifactPreview.js`
- `src/services/latex/pdfPreviewSync.js`
- `src/domains/document/pdfPreviewSessionRuntime.js`
- `src/utils/workspaceProtocol.js`

### 当前问题

- 组件直接依赖 PDF.js viewer internals
- 预览 backend 不可替换
- SyncTeX / 保存 / 视图恢复与渲染层耦合较深

## 目标架构

### 1. 统一入口层

保留 `PdfArtifactPreview.vue` 作为唯一入口，但让它只负责：

- 收集 workspace 与 theme 配置
- 选择 PDF backend
- 透传统一 props / events

### 2. Backend 选择层

新增 `src/services/pdf/pdfViewerBackend.js`，负责：

- 解析当前启用的 backend
- 提供显式 selector
- 让默认 backend 继续指向 `pdfjs`

建议 backend 枚举：

- `pdfjs`
- `embedpdf`

### 3. EmbedPDF Surface

新增 `src/components/editor/PdfEmbedSurface.vue`，职责限定为：

- 初始化 EmbedPDF engine 与 plugins
- 加载当前 PDF 文档
- 渲染页面
- 对外暴露与现有 surface 对齐的事件接口

### 4. Adapter 层

新增 `src/services/pdf/embedPdfAdapter.js`，作为后续迁移的稳定边界。

本阶段先放最小职责：

- `loadDocumentBuffer`
- `reloadDocumentBuffer`
- `resolveActiveDocumentId`

后续阶段逐步扩展：

- `captureViewState`
- `restoreViewState`
- `setZoomMode`
- `setSpreadMode`
- `scrollToPdfPoint`
- `exportDocumentBuffer`
- `resolvePdfPointFromClientPoint`

## Phase 拆分

### Phase 1：并行后端骨架

目标：

- 增加 backend selector
- 接入最小可运行的 EmbedPDF Headless Surface
- 默认行为仍使用 PDF.js

验收：

- `npm run build` 通过
- 设置实验 backend 后，普通 PDF 文件可渲染
- 未启用实验 backend 时，现有 PDF.js 路径行为不变

### Phase 2：view state 与工作区偏好接线

目标：

- 接入 `pdfPreviewSessionRuntime`
- 支持 reload 后恢复基本视图位置
- 逐步对齐 zoom / spread 偏好

### Phase 3：保存与导出

目标：

- 打通 `EmbedPDF -> buffer -> writePdfArtifactBase64`
- 评估注释改动的回写能力

### Phase 4：forward SyncTeX

目标：

- 从源码位置跳转到 PDF 点位

### Phase 5：reverse SyncTeX

目标：

- 从 PDF 位置回跳源码
- 这是迁移最关键、风险最高的一步

### Phase 6：默认切换与旧实现降权

目标：

- 让 EmbedPDF 成为默认 backend
- 删除或显著缩减 PDF.js viewer fork

## 本轮实施范围

本轮只做 `Phase 1`：

1. 添加 EmbedPDF Headless 依赖
2. 新增 backend selector
3. 新增 `PdfEmbedSurface.vue`
4. 在 `PdfArtifactPreview.vue` 内根据 selector 选择 backend
5. 保持默认仍为 `pdfjs`

## 风险

### 高风险

- EmbedPDF 的页坐标能力是否足够支撑 reverse SyncTeX 仍未验证
- 自定义协议 URL 是否能稳定作为 document source 仍未验证

### 中风险

- 最小实验 surface 与现有主题系统对齐可能需要额外样式整理
- 引入新依赖后可能需要处理 Vite / worker / wasm 资源加载细节

### 低风险

- backend selector 与并行接线本身属于低入侵结构调整

## 验证计划

本轮至少执行：

- `npm run build`

如构建通过，再补：

- 使用现有普通 PDF 路径进行一次实际加载验证
- 验证默认 `pdfjs` backend 没有退化

## 完成判定

满足以下条件才视为本轮 phase 完成：

- 计划文档入库
- EmbedPDF Headless 实验后端已接入主工程
- 默认 backend 保持不变
- 前端构建通过
- 明确记录当前未迁移能力与下一步阶段
