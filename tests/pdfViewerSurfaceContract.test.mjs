import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viewerCssSource = readFileSync(
  path.join(repoRoot, 'public/pdfjs-viewer/web/viewer.css'),
  'utf8'
)
const viewerHtmlSource = readFileSync(
  path.join(repoRoot, 'public/pdfjs-viewer/web/viewer.html'),
  'utf8'
)
const viewerRuntimeSource = readFileSync(
  path.join(repoRoot, 'public/pdfjs-viewer/web/viewer.mjs'),
  'utf8'
)
const viewerLocalePath = path.join(repoRoot, 'public/pdfjs-viewer/web/locale/zh-CN/viewer.ftl')
const viewerLocaleSource = existsSync(viewerLocalePath) ? readFileSync(viewerLocalePath, 'utf8') : ''
const pdfIframeSurfaceSource = readFileSync(
  path.join(repoRoot, 'src/components/editor/PdfIframeSurface.vue'),
  'utf8'
)

test('altals pdf viewer sidebar chrome stays flat and padded inside the preview surface', () => {
  assert.match(
    viewerCssSource,
    /#toolbarContainer #toolbarViewer\{[\s\S]*display:grid;[\s\S]*grid-template-columns:minmax\(0, 1fr\) auto minmax\(0, 1fr\);/
  )
  assert.match(viewerCssSource, /#toolbarViewerMiddle\{[\s\S]*position:static;[\s\S]*justify-self:center;/)
  assert.match(viewerCssSource, /#toolbarViewerRight\{[\s\S]*position:static;[\s\S]*justify-self:end;/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*inset-block-start:calc\(100% \+ 1px\);/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*height:calc\(var\(--viewer-container-height\) - var\(--toolbar-height\) - 1px\);/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*width:var\(--viewsManager-width\);/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*border-inline-end:none;/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*border:none;/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*border-radius:0;/)
  assert.match(viewerCssSource, /#viewsManager\{[\s\S]*transform:translateX\(calc\(-100% - 8px\)\);/)
  assert.match(viewerCssSource, /#sidebarContent\{\s*box-shadow:none;/)
  assert.match(
    viewerCssSource,
    /#outerContainer\.viewsManagerOpen #viewerContainer:not\(\.pdfPresentationMode\)\{[\s\S]*inset-inline-start:0;/
  )
  assert.match(viewerCssSource, /#viewsManager #viewsManagerContent\{[\s\S]*padding:12px 10px 20px;/)
  assert.match(
    viewerCssSource,
    /#viewsManager #viewsManagerContent #thumbnailsView\{[\s\S]*padding:6px 10px 20px;/
  )
  assert.match(
    viewerCssSource,
    /#viewsManager #viewsManagerContent #thumbnailsView > \.thumbnail\{[\s\S]*scroll-margin-top:12px;/
  )
  assert.match(viewerCssSource, /#scaleSelectContainer\{\s*min-width:120px;/)
  assert.match(viewerCssSource, /\.dropdownToolbarButton\{[\s\S]*min-width:108px;/)
  assert.match(viewerCssSource, /\.dropdownToolbarButton select\{[\s\S]*padding-inline:12px 26px;/)
  assert.match(viewerCssSource, /\.dropdownToolbarButton select\{[\s\S]*font-size:12px;/)
})

test('webkit canvas fallback blends inverted pdf canvases back onto the app surface instead of a pure black page', () => {
  assert.match(
    viewerCssSource,
    /html\[data-altals-canvas-filter-fallback="true"\] \.pdfViewer \.page\{[\s\S]*background-color:transparent !important;[\s\S]*background-clip:border-box;[\s\S]*border:none !important;/
  )
  assert.match(
    viewerCssSource,
    /html\[data-altals-canvas-filter-fallback="true"\] body,[\s\S]*#viewerContainer,[\s\S]*\.pdfViewer\{[\s\S]*background:transparent !important;/
  )
  assert.match(
    viewerCssSource,
    /html\[data-altals-canvas-filter-fallback="true"\] \.pdfViewer \.canvasWrapper canvas,[\s\S]*mix-blend-mode:var\(--altals-pdf-canvas-blend-mode, screen\);/
  )
  assert.match(
    viewerCssSource,
    /html\[data-altals-canvas-filter-fallback="true"\] \.pdfViewer \.canvasWrapper,[\s\S]*background:var\(--altals-pdf-page-bg\);[\s\S]*isolation:isolate;/
  )
  assert.match(
    pdfIframeSurfaceSource,
    /function resolvePdfCanvasFallbackMode\(pageBackground = resolvePdfPageBackground\(\)\)/
  )
  assert.match(
    pdfIframeSurfaceSource,
    /pageBackground:\s*resolvePreferredPdfPageBackground\(\)/
  )
  assert.match(
    pdfIframeSurfaceSource,
    /root\.style\.setProperty\(\s*'--altals-pdf-canvas-blend-mode',/
  )
})

test('pdf viewer boot script primes both shell and body backgrounds from the themed page color', () => {
  assert.match(viewerHtmlSource, /root\.style\.setProperty\('--altals-shell-preview-surface', pageBackground\)/)
  assert.match(viewerHtmlSource, /root\.style\.setProperty\('--body-bg-color', pageBackground\)/)
  assert.match(viewerHtmlSource, /root\.style\.setProperty\('--page-bg-color', pageBackground\)/)
  assert.match(
    viewerHtmlSource,
    /root\.dataset\.altalsCanvasFilterFallback = useCanvasFilterFallback \? 'true' : 'false'/
  )
})

test('pdf iframe surface locks semantic zoom during live shell resize and restores it afterward', () => {
  assert.match(pdfIframeSurfaceSource, /createPdfViewerScaleLock/)
  assert.match(pdfIframeSurfaceSource, /SHELL_RESIZE_PHASE_EVENT/)
  assert.match(pdfIframeSurfaceSource, /isShellResizeActive\(\)/)
  assert.match(pdfIframeSurfaceSource, /const \{ locale: uiLocale, t \} = useI18n\(\)/)
  assert.match(pdfIframeSurfaceSource, /function getViewerLocale\(\) \{\s*return String\(uiLocale\.value \|\| ''\)\.trim\(\) \|\| 'en-US'/)
  assert.match(pdfIframeSurfaceSource, /locale:\s*getViewerLocale\(\)/)
  assert.match(
    pdfIframeSurfaceSource,
    /window\.addEventListener\(SHELL_RESIZE_PHASE_EVENT, handleShellResizePhase\)/
  )
  assert.match(pdfIframeSurfaceSource, /if \(phase === 'live-resize'\) \{\s*lockViewerScaleForResize\(\)/)
  assert.match(
    pdfIframeSurfaceSource,
    /if \(phase === 'settling' \|\| phase === 'idle'\) \{\s*restoreViewerScaleAfterResize\(\)/
  )
  assert.match(
    pdfIframeSurfaceSource,
    /root\.dataset\.altalsCanvasFilterFallback = useFallback \? 'true' : 'false'/
  )
})

test('pdf iframe surface reloads viewer state when keep-alive deactivates and reactivates the workbench', () => {
  assert.match(
    pdfIframeSurfaceSource,
    /import \{ computed, (nextTick, )?onActivated, onDeactivated, onMounted, onUnmounted, ref, watch \} from 'vue'/,
  )
  assert.match(pdfIframeSurfaceSource, /function activateViewerRuntime\(\)/)
  assert.match(pdfIframeSurfaceSource, /function deactivateViewerRuntime\(\)/)
  assert.match(pdfIframeSurfaceSource, /onActivated\(\(\) => \{\s*activateViewerRuntime\(\)\s*\}\)/)
  assert.match(pdfIframeSurfaceSource, /onDeactivated\(\(\) => \{\s*deactivateViewerRuntime\(\)\s*\}\)/)
  assert.match(pdfIframeSurfaceSource, /resetViewerRuntime\(\)/)
  assert.match(pdfIframeSurfaceSource, /revokeCurrentBlobUrl\(\)/)
})

test('pdf iframe surface waits for pdf.js document events before declaring the preview loaded', () => {
  assert.match(pdfIframeSurfaceSource, /app\.eventBus\?\.on\?\.\('documentloaded', handleDocumentLoaded\)/)
  assert.match(pdfIframeSurfaceSource, /app\.eventBus\?\.on\?\.\('documenterror', handleDocumentError\)/)
  assert.match(pdfIframeSurfaceSource, /const handleDocumentLoaded = \(\) => \{[\s\S]*loading\.value = false[\s\S]*loadError\.value = ''/s)
  assert.match(pdfIframeSurfaceSource, /const handleDocumentError = \(event\) => \{[\s\S]*loading\.value = false[\s\S]*loadError\.value = String\(/s)
  const onIframeLoadMatch = pdfIframeSurfaceSource.match(
    /function onIframeLoad\(\)\s*\{([\s\S]*?)\n\}\n\nfunction resolveProtocolViewerUrl/
  )
  assert.ok(onIframeLoadMatch)
  assert.doesNotMatch(onIframeLoadMatch[1], /loading\.value = false/)
  assert.doesNotMatch(onIframeLoadMatch[1], /loadError\.value = ''/)
})

test('pdf iframe surface falls back from workspace protocol URLs to blob loading when the viewer stalls', () => {
  assert.match(pdfIframeSurfaceSource, /const PROTOCOL_LOAD_TIMEOUT_MS = 1200/)
  assert.match(pdfIframeSurfaceSource, /const BLOB_LOAD_TIMEOUT_MS = 2200/)
  assert.match(pdfIframeSurfaceSource, /function fallbackToBlobAfterProtocolFailure\(detail = \{\}\)/)
  assert.match(pdfIframeSurfaceSource, /activeLoadSourceMode !== 'protocol' \|\| protocolFailureFallbackTriggered/)
  assert.match(pdfIframeSurfaceSource, /void loadPdfWithStrategy\(\{ preferProtocol: false \}\)/)
  assert.match(pdfIframeSurfaceSource, /loadError\.value = t\('PDF viewer did not finish rendering the document\.'\)/)
})

test('pdf iframe surface retries binding pdf.js runtime after iframe load when PDFViewerApplication is late', () => {
  assert.match(pdfIframeSurfaceSource, /let viewerAppBindTimer = 0/)
  assert.match(pdfIframeSurfaceSource, /function installViewerAppPatches\(options = \{\}\)/)
  assert.match(pdfIframeSurfaceSource, /if \(!app\?\.eventBus\) \{/)
  assert.match(pdfIframeSurfaceSource, /viewerAppBindTimer = window\.setTimeout\(\(\) => \{/)
  assert.match(pdfIframeSurfaceSource, /installViewerAppPatches\(\{ attempt: nextAttempt \}\)/)
  assert.match(pdfIframeSurfaceSource, /installViewerFramePatches\(\)/)
  assert.match(pdfIframeSurfaceSource, /installViewerAppPatches\(\)/)
})

test('pdf iframe surface recognizes an already-loaded pdf.js document even if the load event was emitted before listeners attached', () => {
  assert.match(pdfIframeSurfaceSource, /function syncViewerLoadedState\(app = getViewerApp\(\)\)/)
  assert.match(pdfIframeSurfaceSource, /const pageCount = Number\(app\?\.pagesCount \|\| app\?\.pdfDocument\?\.numPages \|\| 0\)/)
  assert.match(pdfIframeSurfaceSource, /syncViewerLoadedState\(app\)/)
  assert.match(pdfIframeSurfaceSource, /if \(syncViewerLoadedState\(\)\) \{\s*return\s*\}/)
})

test('pdf iframe surface records viewer state snapshots and accepts viewer-originated debug status messages', () => {
  assert.match(pdfIframeSurfaceSource, /function buildViewerStateSnapshot\(app = getViewerApp\(\)\)/)
  assert.match(pdfIframeSurfaceSource, /initialized: Boolean\(app\?\.initialized\)/)
  assert.match(pdfIframeSurfaceSource, /initPhase: String\(app\?\._altalsInitPhase \|\| ''\)/)
  assert.match(pdfIframeSurfaceSource, /runPhase: String\(app\?\._altalsRunPhase \|\| ''\)/)
  assert.match(pdfIframeSurfaceSource, /openPhase: String\(app\?\._altalsOpenPhase \|\| ''\)/)
  assert.match(pdfIframeSurfaceSource, /event: 'pdf-load-timeout'/)
  assert.match(pdfIframeSurfaceSource, /event: 'pdf-protocol-load-failed'/)
  assert.match(pdfIframeSurfaceSource, /if \(event\.source && frameWindow && event\.source !== frameWindow\) return/)
  assert.match(pdfIframeSurfaceSource, /data\.channel === 'altals-pdf-debug'/)
  assert.match(pdfIframeSurfaceSource, /data\.type === 'document-error' \|\| data\.type === 'open-failure'/)
  assert.match(pdfIframeSurfaceSource, /data\.type === 'document-load' \|\| data\.type === 'open-success'/)
})

test('pdf viewer ships a zh-CN locale pack for common toolbar and zoom labels', () => {
  assert.equal(existsSync(viewerLocalePath), true)
  assert.match(viewerLocaleSource, /pdfjs-page-scale-auto = 自动缩放/)
  assert.match(viewerLocaleSource, /pdfjs-page-scale-actual = 实际大小/)
  assert.match(viewerLocaleSource, /pdfjs-page-scale-fit = 适合整页/)
  assert.match(viewerLocaleSource, /pdfjs-page-scale-width = 适合页宽/)
  assert.match(viewerLocaleSource, /pdfjs-toggle-views-manager-button-label = 切换侧边栏/)
})

test('pdf viewer zoom menu excludes auto and page-width, and defaults to page-fit', () => {
  assert.doesNotMatch(viewerHtmlSource, /id="pageAutoOption"/)
  assert.doesNotMatch(viewerHtmlSource, /id="pageWidthOption"/)
  assert.match(viewerHtmlSource, /id="pageFitOption" value="page-fit" selected="selected"/)
  assert.match(viewerRuntimeSource, /const DEFAULT_SCALE_VALUE = "page-fit";/)
})

test('pdf viewer allows app-generated blob urls for local preview documents', () => {
  assert.match(viewerRuntimeSource, /if \(String\(file\)\.startsWith\("blob:"\)\) \{\s*return;\s*\}/)
  assert.match(viewerRuntimeSource, /if \(String\(file\)\.startsWith\("altals-workspace:\/\/"\)\) \{\s*return;\s*\}/)
})

test('pdf viewer posts debug bridge messages for file resolution and loading failures', () => {
  assert.match(viewerRuntimeSource, /function postAltalsDebugMessage\(type, payload = \{\}\)/)
  assert.match(viewerRuntimeSource, /channel: "altals-pdf-debug"/)
  assert.match(viewerRuntimeSource, /_altalsInitPhase: "boot"/)
  assert.match(viewerRuntimeSource, /_altalsRunPhase: "boot"/)
  assert.match(viewerRuntimeSource, /_altalsOpenPhase: "idle"/)
  assert.match(viewerRuntimeSource, /this\._altalsInitPhase = "initialize:ready"/)
  assert.match(viewerRuntimeSource, /this\._altalsRunPhase = "run:open-dispatched"/)
  assert.match(viewerRuntimeSource, /this\._altalsOpenPhase = "open:success"/)
  assert.match(viewerRuntimeSource, /postAltalsDebugMessage\("run-file", \{/)
  assert.match(viewerRuntimeSource, /postAltalsDebugMessage\("resolved-file", \{/)
  assert.match(viewerRuntimeSource, /postAltalsDebugMessage\("open-failure", \{/)
  assert.match(viewerRuntimeSource, /postAltalsDebugMessage\("document-error", \{/)
})

test('pdf viewer avoids relying on URL.parse so the bundled viewer still works in WebKit runtimes', () => {
  assert.match(viewerRuntimeSource, /function parseUrlOrNull\(input, base = undefined\)/)
  assert.match(viewerRuntimeSource, /typeof URL\.parse === "function"/)
  assert.match(viewerRuntimeSource, /return new URL\(input, base\);/)
})

test('pdf viewer does not expose the grab-hand cursor tool in altals', () => {
  assert.doesNotMatch(viewerHtmlSource, /id="cursorToolButtons"/)
  assert.doesNotMatch(viewerHtmlSource, /id="cursorSelectTool"/)
  assert.doesNotMatch(viewerHtmlSource, /id="cursorHandTool"/)
  assert.doesNotMatch(
    viewerRuntimeSource,
    /case 72:\s*this\.pdfCursorTools\?\.switchTool\(CursorTool\.HAND\);/
  )
})

test('pdf viewer secondary toolbar tolerates missing cursor tool buttons', () => {
  assert.match(viewerRuntimeSource, /if \(!element\) \{\s*continue;\s*\}/)
  assert.match(viewerRuntimeSource, /if \(cursorSelectToolButton\) \{/)
  assert.match(viewerRuntimeSource, /if \(cursorHandToolButton\) \{/)
})
