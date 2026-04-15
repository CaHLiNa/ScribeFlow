# PDF 背景色修复方案

## 目标

在不改变现有产品形态、不引入新预览表面、不进行大范围 UI 重构的前提下，稳定修复桌面工作台内嵌 PDF 预览的背景色问题，使 PDF 页面背景、预览容器背景、主题切换行为保持一致且可验证。

## 当前结论

当前问题没有收敛，不是因为“少设了一个 CSS 变量”，而是因为背景色同时被 4 层逻辑控制：

1. `src/components/editor/PdfArtifactPreview.vue`
   负责从宿主页面抓取 theme token，并把 `resolvedTheme`、`pdfThemedPages`、`themeTokens`、`themeRevision` 传给 iframe 预览层。
2. `src/components/editor/PdfIframeSurface.vue`
   负责构造 viewer URL、在 iframe 内注入样式、修改 `PDFViewerApplicationOptions`、尝试直接改 `pdfViewer.pageColors`，并在部分场景重载 iframe。
3. `src/services/pdf/viewerUrl.js` + `public/pdfjs-viewer/web/viewer.html`
   负责把主题参数编码进 query string，并在 viewer bootstrap 阶段把背景相关变量写入根节点。
4. `public/pdfjs-viewer/web/viewer.mjs` + `viewer.css`
   这是 pdf.js 真正消费 `forcePageColors`、`pageColorsBackground`、`pageColorsForeground` 和 `--page-bg-color` 的地方。

现有实现把“初始化参数路径”和“运行时强行补丁路径”叠在一起了，所以容易出现以下失配：

- query 参数在 viewer 启动阶段生效，但后续又尝试通过运行时改 `AppOptions` 和 `pdfViewer.pageColors` 去追补；
- CSS 覆盖和 pdf.js 自己的 page color 机制同时存在，责任边界不清；
- 一部分逻辑依赖 iframe reload，一部分逻辑又试图避免 reload；
- 已加入大量调试日志与 reopen 逻辑，但没有建立单一权威数据流。

## 关键实现判断

### 判断 1：pdf.js 官方可依赖路径是“启动时注入 page color 参数”

本地 vendored `viewer.mjs` 表明：

- query 参数会在 `run(config)` 阶段写入 `AppOptions`
- `forcePageColors/pageColorsBackground/pageColorsForeground` 会在 viewer 初始化时组装成 `pageColors`
- `pageColors` 会被传入 `PDFViewer` / `PDFPageView`
- `viewer.css` 中 `.pdfViewer .page` 的底色来自 `--page-bg-color`

这说明最稳定的路径是：

- 把主题相关参数在 viewer 启动前准备好
- 通过 URL query 一次性传进 pdf.js
- 在主题真正变化时，受控重建 iframe viewer 会话

而不是在 viewer 已经运行后继续同时改：

- `PDFViewerApplicationOptions`
- `pdfViewer.pageColors`
- `pdfViewer._pages[*].pageColors`
- 注入 `.pdfViewer .page { background-color: ... !important }`

### 判断 2：应当只保留一个“背景色权威来源”

建议将“背景色权威来源”固定为：

- 宿主工作台解析出的 `pageBackground/pageForeground`
- 经 `buildPdfViewerThemeOptions()` 编码后传给 pdf.js viewer

其余路径仅做辅助，不再承担主控制职责：

- `viewer.html` 只负责 boot 阶段的根背景，避免首帧闪白
- iframe 内深层 DOM 强制注入样式不再作为主方案
- 运行时直接改 `pdfViewer._pages` 不再作为主方案

## 推荐主方案

### 方案 A：单一权威参数流 + 主题变化时受控重建 viewer

这是推荐方案。

#### 设计原则

1. 主题参数只在一处组装。
2. pdf.js 背景色只走官方初始化入口。
3. 主题变化时允许重建 iframe，但必须是“只在必要时、只重建一次”的受控行为。
4. 不在宿主层长期维护对 pdf.js 私有对象的深度补丁。

#### 目标数据流

1. `PdfArtifactPreview.vue` 从宿主 DOM 抓取稳定 token
2. `PdfIframeSurface.vue` 只生成一份规范化 theme payload
3. `viewerUrl.js` 把 payload 转成 query params
4. `viewer.html` 在首帧写入 boot 背景
5. `viewer.mjs` 在启动时读取 `forcePageColors/pageColors*`
6. 页面背景与 pdf.js 渲染统一来自同一组 page color 参数

#### 需要保留的能力

- `resolvedTheme`
- `pdfThemedPages`
- `pageBackground`
- `pageForeground`
- `viewerCssTheme`
- 仅当这些值变化时才 reload viewer

#### 需要移除或降级为调试期逻辑的能力

- 运行时直接批量改 `pdfViewer._pages[*].pageColors`
- 运行时反复 `reset()` pageView / thumbnailView 以追补背景色
- 深层注入 `.pdfViewer .page { background-color: ... !important }` 作为主控制手段
- 常驻的 reopen-with-forced-page-colors 兜底链路
- 默认写入 `temp/pdf-theme-debug.jsonl`

### 为什么推荐这个方案

- 和 vendored pdf.js 的原生设计更一致
- 状态更少，便于定位问题
- 可以用 payload hash 明确判断“什么时候必须 reload”
- 规避对 pdf.js 私有结构的长期耦合
- 后续升级 pdf.js 时更容易维护

## 备选方案

### 方案 B：保留单 iframe，但为 vendored viewer 增加显式的 theme update API

如果后续验证发现“主题切换时重建 iframe”带来明显闪动或性能退化，可以考虑把 viewer 改成支持一个受控消息通道，例如：

- 宿主发 `altals:update-theme`
- `viewer.html/viewer.mjs` 内部消费该消息
- viewer 内部集中修改 `AppOptions`、viewer 变量、page colors，并执行一次官方支持的 refresh/reopen

这个方案的优点是主题切换体验可能更平滑，缺点是：

- 需要改 vendored pdf.js viewer 行为
- 升级成本明显更高
- 需要更强的契约测试保护

因此它应该作为第二阶段优化，而不是第一修复方案。

## 不推荐方案

### 方案 C：继续叠加 CSS override 和私有对象热修

不推荐继续沿当前方向追加补丁，原因如下：

- 只能“看起来像修好了”，很难保证 annotation/text layer/canvas 一致
- 依赖 pdf.js 私有字段，升级脆弱
- 主题切换、重新编译 PDF、keep-alive 恢复等场景容易再次失效
- 调试成本会持续上升

## 分阶段实施计划

### 阶段 1：先做问题定界

先把问题拆成 3 类，避免一次性混修：

1. 初次打开 PDF 时背景色不对
2. 主题切换后背景色不更新或部分更新
3. `Themed PDF pages` 开关切换后背景色不更新或与预期不一致

这一步的产出不是代码，而是一张清晰的复现矩阵：

- dark + themed on
- dark + themed off
- light + themed on
- light + themed off
- PDF 首次加载
- PDF 已打开后切换 theme
- PDF 已打开后切换 `pdfThemedPages`

### 阶段 2：收敛控制面

目标是把背景色控制面收敛成一条链：

- `PdfArtifactPreview.vue` 负责稳定抓 token
- `PdfIframeSurface.vue` 负责生成唯一 theme payload
- `viewerUrl.js` 负责 query 参数编码
- `viewer.html/viewer.mjs` 负责 bootstrap 和实际消费

这一步的重点不是“再加一个补丁”，而是删掉重复控制路径。

### 阶段 3：建立“何时 reload”的单一规则

建立一个 theme payload hash，内容至少包含：

- resolved theme
- themed pages flag
- page background
- page foreground
- viewer css theme

规则如下：

- artifact path / document version 变化：reload
- theme payload hash 变化：reload
- 其他不影响背景色的状态变化：不 reload

这样可以把“为了修背景色而随时重开 viewer”的行为改成明确的契约。

### 阶段 4：把 `viewer.html` 限制在 boot 责任内

`viewer.html` 应只负责：

- 首帧背景
- 根节点变量初始化
- 可选的 `data-*` 启动标记

不应再承担长期的深层背景修复逻辑。

### 阶段 5：回到 pdf.js 原生 page color 机制

主背景渲染依赖：

- `forcePageColors`
- `pageColorsBackground`
- `pageColorsForeground`
- `--page-bg-color`

如果后续发现 Safari/WebKit 的特殊问题确实存在，再单独评估 canvas filter fallback，而且必须满足：

- 有明确平台条件
- 有单独测试
- 不污染默认路径

当前在 `viewerUrl.js` 中直接让 `shouldUsePdfCanvasFilterFallback()` 永远返回 `false` 是合理方向，但要配合上面的“单一路径”一起收敛，否则只是把一个补丁去掉了，不能解决架构混乱。

### 阶段 6：清理诊断残留

当前预览层已经引入了调试日志写入逻辑，目标实现完成后应当：

- 删除默认落盘日志
- 若保留调试能力，则改成显式开发开关
- 不让正常用户操作向工作区或 repo `temp/` 目录持续写入诊断文件

## 受影响文件范围

预计主要会收敛在以下文件：

- `src/components/editor/PdfArtifactPreview.vue`
- `src/components/editor/PdfIframeSurface.vue`
- `src/services/pdf/viewerUrl.js`
- `public/pdfjs-viewer/web/viewer.html`
- 视需要补充 `public/pdfjs-viewer/web/viewer.mjs` 的最小 vendored 适配
- 对应测试：
  - `tests/pdfViewerUrl.test.mjs`
  - `tests/pdfArtifactPreviewLatexSyncContract.test.mjs`
  - `tests/pdfViewerSurfaceContract.test.mjs`

## 验证计划

### 最小行为验证

1. 在 dark theme 下打开 LaTeX PDF，页面背景应与工作台预览背景一致，不出现白页底。
2. 在 light theme 下打开 LaTeX PDF，页面背景应切换到 light 对应值。
3. 关闭 `Themed PDF pages` 后，页底恢复白色，但预览壳层仍与工作台背景一致。
4. PDF 已打开时切换 theme，只发生一次受控 reload，不出现半更新状态。
5. 重新编译生成新 artifact 后，背景色规则保持不变。

### 回归验证

1. LaTeX forward/backward sync 不能退化。
2. keep-alive 切换 pane 后 PDF 仍可恢复。
3. shell resize 期间的缩放锁定行为不能退化。
4. 非 PDF 预览链路不能被影响。

### 建议测试策略

- 继续保留 contract test，但将断言从“出现某段补丁代码”转成“只有单一路径存在”
- 为 theme payload hash 和 reload 条件建立更明确的契约测试
- 如果最终保留 vendored viewer 扩展，再补 viewer 侧契约测试

## 风险与取舍

### 风险 1：主题切换时需要 reload iframe

这是主方案的主要代价，但它比“运行时热补所有 pageView 内部状态”更可控。只要 reload 条件足够精确，体验成本是可接受的。

### 风险 2：`pageForeground` 直接使用 `--workspace-ink` 可能带来对比度问题

实现时需要确认当前主题 token 是否始终满足 PDF 可读性；必要时可为 PDF viewer 单独定义前景 token，而不是盲用编辑器 ink。

### 风险 3：vendored pdf.js 升级兼容性

如果进入方案 B，就会显著提高维护成本。因此第一阶段应尽量不改 `viewer.mjs` 的核心运行逻辑。

## 最终建议

下一步不要继续往 `PdfIframeSurface.vue` 里叠加运行时补丁。

应按下面的顺序推进：

1. 先确认复现矩阵，明确是“初次加载问题”还是“主题切换问题”还是“两者都有”。
2. 选定方案 A 作为主方案。
3. 把背景色逻辑收敛为“宿主 token -> viewer query params -> pdf.js bootstrap”这一条单一路径。
4. 仅在 theme payload 变化时受控 reload iframe。
5. 去掉运行时深层补丁和默认诊断落盘。

如果后续你确认要进入实现阶段，我建议先做一个“小步重构版修复”：

- 第一步只做控制面收敛和 reload 规则整理
- 第二步再决定是否需要 viewer 内消息化热更新

这样能最快判断问题到底是“架构路径错误”，还是“pdf.js 某个平台上的特例行为”。
