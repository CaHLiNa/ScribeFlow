# EmbedPDF 默认切换 Phase

## 目标

本 phase 最初只做一件事：把桌面端 PDF 预览默认 backend 从 `pdfjs` 切到 `embedpdf`，并临时保留一条低摩擦回滚路径。

在同日后续清理切片中，用户已明确批准删除旧 `pdfjs` 实现，因此本文档现作为“默认切换到完全删除”的落地记录。

## 切换范围

本 phase 最终覆盖：

- 默认用户路径下 `PdfArtifactPreview -> PdfEmbedSurface`
- 删除 `src/services/pdf/pdfViewerBackend.js`
- 删除 `PdfIframeSurface.vue`
- 删除 `public/pdfjs-viewer/*`
- 移除 `pdfjs` 依赖与构建遗留

## 切换决策

决定将 `embedpdf` 设为默认 backend，原因如下：

1. 并行路线已经补齐基础渲染、view state、保存、SyncTeX、文本选择 / 复制、搜索 UI。
2. 最近一轮已完成真实运行态人工验证，没有新增已知阻塞。
3. 当前继续维持 `pdfjs` 为默认值，只会延长双路径维护时间，而不会再带来实质性降风险。

## 删除决策

用户已明确批准提前结束观察窗口并删除旧实现，理由如下：

1. 当前桌面端已经全面切到 `EmbedPDF` 工作流。
2. 继续保留双实现只会增加维护成本与回归面。
3. `PDFViewerApplication` 与 vendored viewer 资源不应再作为任何运行时权威存在。

## 验证要求

本 phase 的最低验证组合如下：

- `npm run lint`
- `npm run build`

## 验收结果

本 phase 完成后，应满足：

- 无 override 时默认走 `embedpdf`
- 代码中不再保留 `pdfjs` override 或 backend selector
- `PdfIframeSurface.vue` 与 `public/pdfjs-viewer/*` 已删除
- 前端构建不再包含 `pdfjs-dist` 相关分包

## 后续建议

下一步只围绕 `EmbedPDF` 路线继续收敛：

1. 继续优化 `forward / reverse SyncTeX` 精度。
2. 继续清理 `EmbedPDF` 交互链中的临时逻辑。
3. 不再维护任何 `pdfjs` 回滚分支。
