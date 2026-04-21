<template>
  <div
    class="pdf-artifact-preview"
    data-surface-context-guard="true"
    :style="surfaceStyle"
    @contextmenu.prevent="handleShellContextMenu"
  >
    <iframe
      v-if="viewerSrc"
      ref="iframeRef"
      :key="viewerKey"
      :src="viewerSrc"
      class="pdf-artifact-preview__frame"
      :title="t('PDF preview')"
      @load="onIframeLoad"
    />

    <div v-if="loading && !hotReloadInFlight" class="pdf-artifact-preview__state">
      {{ t('Loading PDF...') }}
    </div>

    <div v-else-if="loadError" class="pdf-artifact-preview__state">
      <div class="pdf-artifact-preview__error-title">{{ t('Preview failed') }}</div>
      <div class="pdf-artifact-preview__error-message">{{ loadError }}</div>
      <div class="pdf-artifact-preview__error-actions">
        <UiButton variant="secondary" size="sm" @click="reloadPdf">
          {{ t('Retry') }}
        </UiButton>
        <UiButton variant="secondary" size="sm" @click="$emit('open-external')">
          {{ t('Open PDF') }}
        </UiButton>
      </div>
    </div>
  </div>
  <SurfaceContextMenu
    :visible="menuVisible"
    :x="menuX"
    :y="menuY"
    :groups="menuGroups"
    @close="closeSurfaceContextMenu"
    @select="handleSurfaceContextMenuSelect"
  />
</template>

<script setup>
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'

import UiButton from '../shared/ui/UiButton.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace.js'
import {
  normalizeWorkspacePdfViewerLastScale,
  normalizeWorkspacePdfCustomPageBackground,
  resolvePdfCustomPageForeground,
} from '../../services/workspacePreferences.js'
import {
  readPdfArtifactBase64,
  requestLatexPdfBackwardSync,
  requestLatexPdfForwardSync,
  writePdfArtifactBase64,
} from '../../services/pdf/artifactPreview.js'
import { resolveLatexSyncTargetPath } from '../../services/latex/previewSync.js'
import {
  resolveLatexPdfReverseSyncPayload,
  scrollPdfPreviewToPoint,
} from '../../services/latex/pdfPreviewSync.js'
import {
  buildPdfViewerSrc,
  buildPdfViewerThemeOptions,
  shouldUsePdfCanvasFilterFallback,
} from '../../services/pdf/viewerUrl.js'
import { createPdfViewerScaleLock } from '../../services/pdf/viewerResize.js'
import {
  createPdfPreviewSessionState,
  resolvePdfPreviewRevision,
  resolvePdfPreviewSessionTransition,
  snapshotPdfPreviewViewState,
} from '../../domains/document/pdfPreviewSessionRuntime.js'
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks.js'
import { toWorkspaceProtocolUrl } from '../../utils/workspaceProtocol.js'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import { useTransientOverlayDismiss } from '../../composables/useTransientOverlayDismiss'
import { isShellResizeActive, SHELL_RESIZE_PHASE_EVENT } from '../../shared/shellResizeSignals.js'

const props = defineProps({
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, required: true },
  previewRevision: { type: Object, default: null },
  workspacePath: { type: String, default: '' },
  workspaceDataDir: { type: String, default: '' },
  globalConfigDir: { type: String, default: '' },
  compileState: { type: Object, default: null },
  forwardSyncRequest: { type: Object, default: null },
  resolvedTheme: { type: String, default: 'dark' },
  pdfPageBackgroundFollowsTheme: { type: Boolean, default: true },
  pdfCustomPageBackground: { type: String, default: '#1e1e1e' },
  pdfViewerZoomMode: { type: String, default: 'page-width' },
  pdfViewerSpreadMode: { type: String, default: 'single' },
  pdfViewerAutoSync: { type: Boolean, default: true },
  pdfViewerLastScale: { type: String, default: '' },
  themeTokens: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['open-external', 'backward-sync', 'forward-sync-handled'])

const { locale: uiLocale, t } = useI18n()
const workspace = useWorkspaceStore()
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()
const { dismissOtherTransientOverlays } = useTransientOverlayDismiss('pdf-iframe-surface')

const iframeRef = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const hotReloadInFlight = ref(false)
const loadError = ref('')
const viewerKey = ref(0)
const latexViewerReady = ref(false)
const surfaceStyle = computed(() => ({ ...(props.themeTokens || {}) }))
const viewerThemeReloadKey = computed(() =>
  JSON.stringify({
    locale: getViewerLocale(),
    ...getViewerThemeOptions(),
  })
)

function getActivePreviewRevision() {
  return (
    props.previewRevision
    || resolvePdfPreviewRevision({
      sourcePath: props.sourcePath,
      artifactPath: props.artifactPath,
      kind: props.kind,
      compileState: props.compileState,
    })
  )
}

let currentBlobUrl = null
let pdfSaveInProgress = false
let lastHandledForwardSyncId = 0
let pendingForwardSync = null
let pendingViewerRestore = null
let loadToken = 0
let latexReverseSyncCleanup = null
let viewerContextMenuCleanup = null
let viewerAppEventCleanup = null
let viewerScaleLock = null
let viewerRuntimeActive = false
let viewerLoadTimeout = 0
let viewerAppBindTimer = 0
let viewerFramePatchesInstalled = false
let activeLoadSourceMode = ''
let protocolFailureFallbackTriggered = false
const PROTOCOL_LOAD_TIMEOUT_MS = 1200
const BLOB_LOAD_TIMEOUT_MS = 2200
const previewSessionState = createPdfPreviewSessionState()

function resolvePdfViewerSpreadModeValue() {
  return String(props.pdfViewerSpreadMode || '').trim().toLowerCase() === 'double' ? 1 : 0
}

function resolvePdfViewerScaleValue() {
  const zoomMode = String(props.pdfViewerZoomMode || '').trim().toLowerCase()
  if (zoomMode === 'remember-last') {
    return normalizeWorkspacePdfViewerLastScale(props.pdfViewerLastScale) || 'page-width'
  }
  return zoomMode === 'page-fit' ? 'page-fit' : 'page-width'
}

function persistViewerScalePreference() {
  const scaleValue = normalizeWorkspacePdfViewerLastScale(getViewerApp()?.pdfViewer?.currentScaleValue)
  if (!scaleValue || workspace.pdfViewerLastScale === scaleValue) return
  void workspace.setPdfViewerLastScale(scaleValue).catch(() => {})
}

function applyViewerDefaults(app = getViewerApp()) {
  const pdfViewer = app?.pdfViewer
  if (!pdfViewer) return false

  try {
    pdfViewer.spreadMode = resolvePdfViewerSpreadModeValue()
  } catch {
    // Ignore unsupported spread mode transitions.
  }

  const preferredScale = resolvePdfViewerScaleValue()
  if (preferredScale) {
    pdfViewer.currentScaleValue = preferredScale
  }

  return true
}

function getResolvedTheme() {
  return String(props.resolvedTheme || '')
    .trim()
    .toLowerCase() === 'light'
    ? 'light'
    : 'dark'
}

function resolveThemeToken(name, fallback = '') {
  const propValue = String(props.themeTokens?.[name] || '').trim()
  if (propValue) return propValue
  if (typeof document === 'undefined') return fallback
  return (
    String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() ||
    fallback
  )
}

function resolvePdfSurfaceBackground() {
  return resolveThemeToken('--shell-preview-surface') || resolveThemeToken('--shell-editor-surface')
}

function resolvePreferredPdfPageBackground() {
  if (props.pdfPageBackgroundFollowsTheme) {
    return normalizeWorkspacePdfCustomPageBackground(resolvePdfSurfaceBackground())
  }
  return normalizeWorkspacePdfCustomPageBackground(props.pdfCustomPageBackground)
}

function resolvePreferredPdfPageForeground() {
  return resolvePdfCustomPageForeground(resolvePreferredPdfPageBackground())
}

function resolvePdfPageBackground(themeOptions = getViewerThemeOptions()) {
  return themeOptions.pageBackground ? themeOptions.pageBackground : '#ffffff'
}

function parseHexRgb(color, fallback = '#1e1e1e') {
  const normalized = String(color || '')
    .trim()
    .toLowerCase()
  const source = /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback
  return {
    r: parseInt(source.slice(1, 3), 16),
    g: parseInt(source.slice(3, 5), 16),
    b: parseInt(source.slice(5, 7), 16),
  }
}

function resolvePdfCanvasFallbackMode(pageBackground = resolvePdfPageBackground()) {
  const { r, g, b } = parseHexRgb(pageBackground)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.58 ? 'light' : 'dark'
}

function base64ToUint8Array(base64) {
  const binary = atob(String(base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function uint8ArrayToBase64(bytes) {
  let binary = ''
  const chunk = 8192
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function revokeCurrentBlobUrl() {
  if (!currentBlobUrl) return
  URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl = null
}

function resetViewerRuntime() {
  persistViewerScalePreference()
  loadToken += 1
  pendingForwardSync = null
  pendingViewerRestore = null
  viewerScaleLock = null
  latexViewerReady.value = false
  if (viewerLoadTimeout) {
    window.clearTimeout(viewerLoadTimeout)
    viewerLoadTimeout = 0
  }
  if (viewerAppBindTimer) {
    window.clearTimeout(viewerAppBindTimer)
    viewerAppBindTimer = 0
  }
  viewerAppEventCleanup?.()
  viewerAppEventCleanup = null
  viewerContextMenuCleanup?.()
  viewerContextMenuCleanup = null
  latexReverseSyncCleanup?.()
  latexReverseSyncCleanup = null
  viewerFramePatchesInstalled = false
  viewerSrc.value = null
  revokeCurrentBlobUrl()
}

function postLatexViewerMessage(type, payload = {}) {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow) return false
  frameWindow.postMessage(
    {
      channel: 'scribeflow-latex-sync',
      type,
      ...payload,
    },
    '*'
  )
  return true
}

function getViewerApp() {
  return iframeRef.value?.contentWindow?.PDFViewerApplication || null
}

function getViewerContainer(app = getViewerApp()) {
  return (
    app?.appConfig?.mainContainer ||
    iframeRef.value?.contentDocument?.getElementById?.('viewerContainer') ||
    null
  )
}

function captureViewerRestoreState(app = getViewerApp()) {
  const pdfViewer = app?.pdfViewer
  const container = getViewerContainer(app)
  if (!pdfViewer || !container) return null

  const location = pdfViewer._location || null
  const pageNumber = Math.max(1, Number(pdfViewer.currentPageNumber || 1))
  const pageView = pdfViewer._pages?.[pageNumber - 1]
  const pageElement = pageView?.div
  const pageHeight = Number(pageElement?.clientHeight || pageElement?.offsetHeight || 0)
  const pageTop = Number(pageElement?.offsetTop || 0)
  const relativeTop = container.scrollTop - pageTop
  const normalizedScaleValue = normalizeWorkspacePdfViewerLastScale(pdfViewer.currentScaleValue)
  const rawScaleValue = String(pdfViewer.currentScaleValue || '').trim()

  return {
    pageNumber,
    scaleValue: normalizedScaleValue || rawScaleValue || '',
    pdfOpenParams: String(location?.pdfOpenParams || '').trim(),
    pdfPointLeft: Number(location?.left),
    pdfPointTop: Number(location?.top),
    pageScrollRatio:
      Number.isFinite(pageHeight) && pageHeight > 0
        ? Math.max(0, Math.min(1, relativeTop / pageHeight))
        : null,
    scrollLeft: Number(container.scrollLeft || 0),
  }
}

function restoreViewerState(snapshot, app = getViewerApp()) {
  if (!snapshot) return false

  const pdfViewer = app?.pdfViewer
  const pdfLinkService = app?.pdfLinkService
  const container = getViewerContainer(app)
  if (!pdfViewer || !container) return false

  const pdfOpenParams = String(snapshot.pdfOpenParams || '').trim()
  if (pdfOpenParams && pdfLinkService?.setHash) {
    try {
      pdfLinkService.setHash(pdfOpenParams.replace(/^#/, ''))
      return true
    } catch {
      // Fall through to the manual restoration path below.
    }
  }

  const pdfPointLeft = Number(snapshot.pdfPointLeft)
  const pdfPointTop = Number(snapshot.pdfPointTop)
  if (
    Number.isFinite(pdfPointLeft)
    && Number.isFinite(pdfPointTop)
    && typeof pdfViewer.scrollPageIntoView === 'function'
  ) {
    try {
      pdfViewer.scrollPageIntoView({
        pageNumber: Math.max(1, Number(snapshot.pageNumber || 1)),
        destArray: [null, { name: 'XYZ' }, pdfPointLeft, pdfPointTop, null],
        allowNegativeOffset: true,
      })
      return true
    } catch {
      // Fall through to the manual restoration path below.
    }
  }

  const scaleValue = String(snapshot.scaleValue || '').trim()
  if (scaleValue) {
    try {
      pdfViewer.currentScaleValue = scaleValue
    } catch {
      // Ignore invalid scale restoration and keep the viewer stable.
    }
  }

  const pageCount = Math.max(1, Number(app?.pagesCount || pdfViewer.pagesCount || 1))
  const pageNumber = Math.min(Math.max(1, Number(snapshot.pageNumber || 1)), pageCount)
  pdfViewer.currentPageNumber = pageNumber

  window.requestAnimationFrame(() => {
    const restoredPage = pdfViewer._pages?.[pageNumber - 1]?.div
    const restoredHeight = Number(restoredPage?.clientHeight || restoredPage?.offsetHeight || 0)
    const restoredTop = Number(restoredPage?.offsetTop || 0)
    const scrollRatio = Number(snapshot.pageScrollRatio)
    if (Number.isFinite(scrollRatio) && Number.isFinite(restoredHeight) && restoredHeight > 0) {
      container.scrollTop = restoredTop + restoredHeight * Math.max(0, Math.min(1, scrollRatio))
    }
    const scrollLeft = Number(snapshot.scrollLeft)
    if (Number.isFinite(scrollLeft)) {
      container.scrollLeft = scrollLeft
    }
  })

  return true
}

function restorePendingViewerState(app = getViewerApp()) {
  if (!pendingViewerRestore) return false
  const snapshot = pendingViewerRestore
  pendingViewerRestore = null
  return restoreViewerState(snapshot, app)
}

function captureCurrentPreviewViewState() {
  return snapshotPdfPreviewViewState(captureViewerRestoreState())
}

function syncPreviewSessionState(nextSession = {}) {
  previewSessionState.sessionKey = nextSession.sessionKey || ''
  previewSessionState.sourcePath = nextSession.sourcePath || ''
  previewSessionState.artifactPath = nextSession.artifactPath || ''
  previewSessionState.buildId = nextSession.buildId || ''
  previewSessionState.revisionKey = nextSession.revisionKey || ''
  previewSessionState.synctexPath = nextSession.synctexPath || ''
  previewSessionState.sourceFingerprint = nextSession.sourceFingerprint || ''
  previewSessionState.viewState = nextSession.viewState || null
}

function lockViewerScaleForResize() {
  const pdfViewer = getViewerApp()?.pdfViewer
  if (!pdfViewer) return false

  const scaleLock = createPdfViewerScaleLock(pdfViewer.currentScaleValue, pdfViewer.currentScale)
  if (!scaleLock) return false

  viewerScaleLock = scaleLock
  pdfViewer.currentScaleValue = scaleLock.lockedScaleValue
  return true
}

function restoreViewerScaleAfterResize() {
  const restoreScaleValue = String(viewerScaleLock?.restoreScaleValue || '').trim()
  viewerScaleLock = null
  if (!restoreScaleValue) return false

  const pdfViewer = getViewerApp()?.pdfViewer
  if (!pdfViewer) return false
  pdfViewer.currentScaleValue = restoreScaleValue
  return true
}

async function resolvePdfDocumentSource(options = {}) {
  const artifactPath = String(props.artifactPath || '').trim()
  const preferProtocol = options.preferProtocol !== false
  const expectedToken = Number(options.expectedToken || 0)
  const protocolUrl = preferProtocol ? resolveProtocolViewerUrl(artifactPath) : ''
  let documentUrl = protocolUrl || ''
  let blobUrl = null
  const sourceMode = documentUrl ? 'protocol' : 'blob'

  if (!documentUrl) {
    const base64 = await readPdfArtifactBase64(artifactPath)
    if (expectedToken && expectedToken !== loadToken) return null

    const bytes = base64ToUint8Array(base64)
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    documentUrl = blobUrl
  }

  return {
    documentUrl,
    blobUrl,
    sourceMode,
  }
}

async function reopenPdfInPlace(options = {}) {
  const app = getViewerApp()
  if (!viewerRuntimeActive || !viewerSrc.value || !app?.open || !app?.pdfViewer) {
    return false
  }

  const snapshot = options.viewState || previewSessionState.viewState || captureViewerRestoreState(app)
  const source = await resolvePdfDocumentSource(options)
  if (!source?.documentUrl) return false

  const previousBlobUrl = currentBlobUrl
  activeLoadSourceMode = source.sourceMode
  protocolFailureFallbackTriggered = source.sourceMode !== 'protocol'
  loadError.value = ''
  latexViewerReady.value = false
  pendingViewerRestore = snapshot
  hotReloadInFlight.value = true
  const initialBookmark = String(snapshot?.pdfOpenParams || '').replace(/^#/, '').trim()

  try {
    if (initialBookmark) {
      app.initialBookmark = initialBookmark
    }
    app.loadingBar?.hide?.()
    await app.open({
      url: source.documentUrl,
      originalUrl: props.artifactPath,
    })
    currentBlobUrl = source.blobUrl || null
    if (previousBlobUrl && previousBlobUrl !== currentBlobUrl) {
      URL.revokeObjectURL(previousBlobUrl)
    }
    return true
  } catch {
    pendingViewerRestore = null
    hotReloadInFlight.value = false
    if (source.blobUrl) {
      URL.revokeObjectURL(source.blobUrl)
    }
    return false
  }
}

function handleShellResizePhase(event) {
  const phase = String(event?.detail?.phase || '').trim()
  if (phase === 'live-resize') {
    lockViewerScaleForResize()
    return
  }

  if (phase === 'settling' || phase === 'idle') {
    restoreViewerScaleAfterResize()
  }
}

function shouldUseCanvasFilterFallback() {
  return shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    pageBackground: resolvePreferredPdfPageBackground(),
    resolvedTheme: getResolvedTheme(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  })
}

function applyCanvasFilterFallback() {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  const root = doc.documentElement
  const useFallback = shouldUseCanvasFilterFallback()
  const pageBackground = resolvePdfPageBackground()
  const fallbackMode = resolvePdfCanvasFallbackMode(pageBackground)
  root.dataset.scribeflowCanvasFilterFallback = useFallback ? 'true' : 'false'
  root.style.setProperty(
    '--scribeflow-pdf-page-bg',
    useFallback && pageBackground ? pageBackground : ''
  )
  root.style.setProperty(
    '--scribeflow-pdf-canvas-filter',
    useFallback && fallbackMode === 'dark'
      ? 'invert(1) hue-rotate(180deg) contrast(1.08) brightness(1.05)'
      : 'none'
  )
  root.style.setProperty(
    '--scribeflow-pdf-canvas-blend-mode',
    useFallback ? (fallbackMode === 'dark' ? 'screen' : 'multiply') : 'normal'
  )
}

function applyTheme() {
  const doc = iframeRef.value?.contentDocument
  if (!doc?.documentElement) return
  const root = doc.documentElement
  const pdfSurfaceBackground = resolvePdfSurfaceBackground()
  const pageBackground = resolvePdfPageBackground()
  const tokenMap = new Map([
    ['--scribeflow-surface-base', '--surface-base'],
    ['--scribeflow-surface-raised', '--surface-raised'],
    ['--scribeflow-surface-hover', '--surface-hover'],
    ['--scribeflow-border-subtle', '--border-subtle'],
    ['--scribeflow-text-primary', '--text-primary'],
    ['--scribeflow-text-muted', '--text-muted'],
    ['--scribeflow-focus-ring', '--focus-ring'],
  ])

  root.style.setProperty('color-scheme', getResolvedTheme())
  for (const [targetName, sourceName] of tokenMap) {
    const value = resolveThemeToken(sourceName)
    if (value) {
      root.style.setProperty(targetName, value)
    }
  }

  if (pdfSurfaceBackground) {
    root.style.setProperty('--scribeflow-shell-preview-surface', pdfSurfaceBackground)
    root.style.setProperty('--scribeflow-pdf-page-bg', pageBackground)
    root.style.setProperty('--body-bg-color', pdfSurfaceBackground)
    root.style.setProperty('--page-bg-color', pageBackground)

    if (doc.body) {
      doc.body.style.backgroundColor = pdfSurfaceBackground
    }
  }

  applyCanvasFilterFallback()
}

function getViewerThemeOptions() {
  return buildPdfViewerThemeOptions({
    themedPages: true,
    resolvedTheme: getResolvedTheme(),
    usePageFilterFallback: shouldUseCanvasFilterFallback(),
    pageBackground: resolvePreferredPdfPageBackground(),
    pageForeground: resolvePreferredPdfPageForeground(),
  })
}

function getViewerLocale() {
  return String(uiLocale.value || '').trim() || 'en-US'
}

function normalizeViewerChromeText() {
  const doc = iframeRef.value?.contentDocument
  const numPages = doc?.getElementById('numPages')
  if (!numPages) return
  const value = String(numPages.textContent || '').trim()
  if (!value) return
  numPages.textContent = value.replace(/^of\s+/i, '/ ')
}

async function savePdfToDisk() {
  if (pdfSaveInProgress) return
  pdfSaveInProgress = true
  try {
    const app = getViewerApp()
    if (!app?.pdfDocument) return

    const hasChanges = Number(app.pdfDocument.annotationStorage?.size || 0) > 0
    const data = hasChanges ? await app.pdfDocument.saveDocument() : await app.pdfDocument.getData()

    const base64 = uint8ArrayToBase64(new Uint8Array(data))
    await writePdfArtifactBase64(props.artifactPath, base64)
  } catch (error) {
    console.error('PDF save error:', error)
  } finally {
    pdfSaveInProgress = false
  }
}

function getPdfSelectionText() {
  const selection = iframeRef.value?.contentWindow?.getSelection?.()
  return String(selection?.toString?.() || '').trim()
}

async function copyPdfSelectionText() {
  const text = getPdfSelectionText()
  if (!text) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  document.execCommand('copy')
}

function scrollToPdfPoint(point = {}) {
  return scrollPdfPreviewToPoint({
    app: getViewerApp(),
    doc: iframeRef.value?.contentDocument,
    point,
  })
}

function flushPendingLatexForwardSync() {
  if (props.kind !== 'latex' || !pendingForwardSync) return false
  const point = pendingForwardSync
  const scrolled = scrollToPdfPoint(point)
  if (latexViewerReady.value) {
    postLatexViewerMessage('synctex', { data: point })
  }
  if (scrolled) {
    pendingForwardSync = null
  }
  return scrolled
}

async function handleLatexViewerReverseSync(detail = {}) {
  if (props.kind !== 'latex') return
  const synctexPath = String(props.compileState?.synctexPath || '').trim()
  if (!synctexPath) return

  try {
    const result = await requestLatexPdfBackwardSync({
      synctexPath,
      page: Number(detail.page || 0),
      x: Number(detail.pos?.[0]),
      y: Number(detail.pos?.[1]),
    })
    if (result?.file && result?.line) {
      const resolvedFile = resolveLatexSyncTargetPath(result.file, {
        sourcePath: props.sourcePath,
        compileTargetPath: props.compileState?.compileTargetPath || '',
        workspacePath: props.workspacePath || '',
      })
      emit('backward-sync', {
        ...result,
        file: resolvedFile || result.file,
        textBeforeSelection: String(detail.textBeforeSelection || ''),
        textAfterSelection: String(detail.textAfterSelection || ''),
      })
      return
    }
  } catch (error) {
    void error
    // Ignore backward sync failures and leave the viewer stable.
  }
}

async function handlePdfDoubleClick(event) {
  if (props.kind !== 'latex') return
  await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const detail = resolveLatexPdfReverseSyncPayload({
    event,
    frameWindow: iframeRef.value?.contentWindow,
  })
  if (!detail) return
  await handleLatexViewerReverseSync(detail)
}

function installLatexReverseSyncHandlers() {
  if (props.kind !== 'latex') return
  const doc = iframeRef.value?.contentDocument
  if (!doc) return

  latexReverseSyncCleanup?.()
  const handler = (event) => {
    void handlePdfDoubleClick(event)
  }
  doc.addEventListener('dblclick', handler, true)
  latexReverseSyncCleanup = () => {
    doc.removeEventListener('dblclick', handler, true)
  }
}

function installViewerFramePatches() {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow) return

  try {
    if (viewerFramePatchesInstalled) return
    viewerContextMenuCleanup?.()
    viewerContextMenuCleanup = null

    const dismissTransientOverlays = () => {
      dismissOtherTransientOverlays()
    }

    const bridgeMouseDown = (event) => {
      if (Number(event?.button) === 2) {
        return
      }
      dismissTransientOverlays()
      iframeRef.value?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    }
    frameWindow.document.addEventListener('mousedown', bridgeMouseDown, true)
    frameWindow.document.addEventListener('wheel', dismissTransientOverlays, true)

    const keydownHandler = (event) => {
      if (event.key === 'Escape') {
        dismissTransientOverlays()
        event.preventDefault()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
        event.preventDefault()
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: event.key,
            code: event.code,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            bubbles: true,
            cancelable: true,
          })
        )
      }
    }
    frameWindow.document.addEventListener('keydown', keydownHandler)

    const clickHandler = async (event) => {
      dismissTransientOverlays()
      const resolved = resolveExternalHttpAnchor(event.target, frameWindow.location.href)
      if (!resolved?.url) return
      event.preventDefault()
      event.stopPropagation()
      try {
        await openExternalHttpUrl(resolved.url)
      } catch {
        // Ignore shell-open failures here.
      }
    }
    frameWindow.document.addEventListener('click', clickHandler, true)

    const contextMenuHandler = (event) => {
      event.preventDefault()
      event.stopPropagation()
      handleIframeContextMenu(event)
    }
    frameWindow.document.addEventListener('contextmenu', contextMenuHandler, true)
    viewerContextMenuCleanup = () => {
      frameWindow.document.removeEventListener('mousedown', bridgeMouseDown, true)
      frameWindow.document.removeEventListener('wheel', dismissTransientOverlays, true)
      frameWindow.document.removeEventListener('keydown', keydownHandler)
      frameWindow.document.removeEventListener('click', clickHandler, true)
      frameWindow.document.removeEventListener('contextmenu', contextMenuHandler, true)
    }
    viewerFramePatchesInstalled = true
    installLatexReverseSyncHandlers()
  } catch {
    // Same-origin access can fail transiently during reload; the iframe can still render.
  }
}

function installViewerAppPatches(options = {}) {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow || viewerAppEventCleanup) return

  const app = frameWindow.PDFViewerApplication
  if (!app?.eventBus) {
    if (viewerAppBindTimer) {
      window.clearTimeout(viewerAppBindTimer)
    }
    const nextAttempt = Number(options.attempt || 0) + 1
    if (nextAttempt > 90) return
    viewerAppBindTimer = window.setTimeout(() => {
      viewerAppBindTimer = 0
      installViewerAppPatches({ attempt: nextAttempt })
    }, 32)
    return
  }

  const handlePagesInit = () => {
    applyViewerDefaults(app)
    latexViewerReady.value = true
    flushPendingLatexForwardSync()
  }
  const handleDocumentLoaded = () => {
    if (viewerLoadTimeout) {
      window.clearTimeout(viewerLoadTimeout)
      viewerLoadTimeout = 0
    }
    loading.value = false
    hotReloadInFlight.value = false
    loadError.value = ''
    applyTheme()
    normalizeViewerChromeText()
    app.loadingBar?.hide?.()
  }
  const handlePagesLoaded = () => {
    applyTheme()
    normalizeViewerChromeText()
    installLatexReverseSyncHandlers()
    latexViewerReady.value = true
    hotReloadInFlight.value = false
    restorePendingViewerState(app)
    flushPendingLatexForwardSync()
    app.loadingBar?.hide?.()
  }
  const handleDocumentError = (event) => {
    if (
      fallbackToBlobAfterProtocolFailure({
        reason: String(event?.reason || event?.message || '').trim(),
        type: 'documenterror',
      })
    ) {
      return
    }
    if (viewerLoadTimeout) {
      window.clearTimeout(viewerLoadTimeout)
      viewerLoadTimeout = 0
    }
    hotReloadInFlight.value = false
    loading.value = false
    loadError.value = String(event?.reason || event?.message || t('Could not load PDF')).trim()
  }

  app.eventBus?.on?.('pagesinit', handlePagesInit)
  app.eventBus?.on?.('documentloaded', handleDocumentLoaded)
  app.eventBus?.on?.('pagesloaded', handlePagesLoaded)
  app.eventBus?.on?.('documenterror', handleDocumentError)
  viewerAppEventCleanup = () => {
    app.eventBus?.off?.('pagesinit', handlePagesInit)
    app.eventBus?.off?.('documentloaded', handleDocumentLoaded)
    app.eventBus?.off?.('pagesloaded', handlePagesLoaded)
    app.eventBus?.off?.('documenterror', handleDocumentError)
  }
  app.downloadOrSave = async function downloadOrSavePatched() {
    const { classList } = this.appConfig.appContainer
    classList.add('wait')
    await savePdfToDisk()
    classList.remove('wait')
  }
  app.download = async () => savePdfToDisk()
  app.save = async () => savePdfToDisk()
  syncViewerLoadedState(app)
}

function buildPdfMenuGroups(options = {}) {
  const selectedText = String(options.selectedText || '')
  const revealDetail = options.revealDetail || null

  return [
    {
      key: 'pdf-preview-actions',
      items: [
        {
          key: 'copy',
          label: t('Copy'),
          disabled: !selectedText,
          action: () => {
            void copyPdfSelectionText()
          },
        },
        {
          key: 'reload-pdf',
          label: t('Reload PDF'),
          action: () => {
            reloadPdf()
          },
        },
        {
          key: 'open-pdf',
          label: t('Open PDF'),
          action: () => {
            emit('open-external')
          },
        },
        ...(revealDetail
          ? [
              {
                key: 'reveal-source',
                label: t('Reveal Source'),
                action: () => {
                  void handleLatexViewerReverseSync(revealDetail)
                },
              },
            ]
          : []),
      ],
    },
  ]
}

function handleShellContextMenu(event) {
  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: buildPdfMenuGroups({
      selectedText: getPdfSelectionText(),
    }),
  })
}

function handleIframeContextMenu(event) {
  const frameWindow = iframeRef.value?.contentWindow
  const iframeRect = iframeRef.value?.getBoundingClientRect()
  if (!frameWindow || !iframeRect) return

  openSurfaceContextMenu({
    x: iframeRect.left + Number(event.clientX || 0),
    y: iframeRect.top + Number(event.clientY || 0),
    groups: buildPdfMenuGroups({
      selectedText: getPdfSelectionText(),
      revealDetail:
        props.kind === 'latex'
          ? resolveLatexPdfReverseSyncPayload({
              event,
              frameWindow,
            })
          : null,
    }),
  })
}

function onIframeLoad() {
  latexViewerReady.value = props.kind !== 'latex'
  applyTheme()
  normalizeViewerChromeText()
  installViewerFramePatches()
  installViewerAppPatches()
  viewerScaleLock = null
  if (isShellResizeActive()) {
    lockViewerScaleForResize()
  }

  if (pendingForwardSync) {
    if (props.kind === 'latex') {
      flushPendingLatexForwardSync()
    } else {
      scrollToPdfPoint(pendingForwardSync)
      pendingForwardSync = null
    }
  }
}

function resolveProtocolViewerUrl(artifactPath = '') {
  const revision = getActivePreviewRevision()
  return toWorkspaceProtocolUrl(
    artifactPath,
    {
      path: props.workspacePath,
      workspaceDataDir: props.workspaceDataDir,
      globalConfigDir: props.globalConfigDir,
    },
    {
      version: revision?.buildId || '',
    }
  )
}

function syncViewerLoadedState(app = getViewerApp()) {
  const pageCount = Number(app?.pagesCount || app?.pdfDocument?.numPages || 0)
  if (!app?.pdfDocument || !Number.isFinite(pageCount) || pageCount < 1) {
    return false
  }
  if (viewerLoadTimeout) {
    window.clearTimeout(viewerLoadTimeout)
    viewerLoadTimeout = 0
  }
  loading.value = false
  loadError.value = ''
  normalizeViewerChromeText()
  return true
}

function fallbackToBlobAfterProtocolFailure(detail = {}) {
  if (activeLoadSourceMode !== 'protocol' || protocolFailureFallbackTriggered) {
    return false
  }

  protocolFailureFallbackTriggered = true
  if (viewerLoadTimeout) {
    window.clearTimeout(viewerLoadTimeout)
    viewerLoadTimeout = 0
  }
  void detail
  void loadPdfWithStrategy({ preferProtocol: false })
  return true
}

async function loadPdf() {
  return loadPdfWithStrategy({ preferProtocol: true })
}

async function loadPdfWithStrategy(options = {}) {
  const artifactPath = String(props.artifactPath || '').trim()
  const preferProtocol = options.preferProtocol !== false
  loadToken += 1
  const currentToken = loadToken

  loading.value = true
  hotReloadInFlight.value = false
  loadError.value = ''
  latexViewerReady.value = false
  viewerAppEventCleanup?.()
  viewerAppEventCleanup = null
  viewerContextMenuCleanup?.()
  viewerContextMenuCleanup = null
  latexReverseSyncCleanup?.()
  latexReverseSyncCleanup = null
  viewerFramePatchesInstalled = false

  revokeCurrentBlobUrl()
  if (viewerLoadTimeout) {
    window.clearTimeout(viewerLoadTimeout)
    viewerLoadTimeout = 0
  }
  if (viewerAppBindTimer) {
    window.clearTimeout(viewerAppBindTimer)
    viewerAppBindTimer = 0
  }

  if (!viewerRuntimeActive) {
    viewerSrc.value = null
    loading.value = false
    return
  }

  if (!artifactPath) {
    viewerSrc.value = null
    loading.value = false
    return
  }

  try {
    const previousBlobUrl = currentBlobUrl
    const source = await resolvePdfDocumentSource({
      preferProtocol,
      expectedToken: currentToken,
    })
    if (!source || currentToken !== loadToken) {
      if (source?.blobUrl) {
        URL.revokeObjectURL(source.blobUrl)
      }
      return
    }

    activeLoadSourceMode = source.sourceMode
    protocolFailureFallbackTriggered = source.sourceMode !== 'protocol'
    currentBlobUrl = source.blobUrl || null

    viewerSrc.value = buildPdfViewerSrc(source.documentUrl, {
      ...getViewerThemeOptions(),
      locale: getViewerLocale(),
    })
    viewerKey.value += 1
    if (previousBlobUrl && previousBlobUrl !== currentBlobUrl) {
      URL.revokeObjectURL(previousBlobUrl)
    }

    viewerLoadTimeout = window.setTimeout(
      () => {
        if (currentToken !== loadToken || !loading.value) return
        viewerLoadTimeout = 0
        if (syncViewerLoadedState()) {
          return
        }
        if (source.sourceMode === 'protocol') {
          void loadPdfWithStrategy({ preferProtocol: false })
          return
        }
        loadError.value = t('PDF viewer did not finish rendering the document.')
        loading.value = false
      },
      source.sourceMode === 'protocol' ? PROTOCOL_LOAD_TIMEOUT_MS : BLOB_LOAD_TIMEOUT_MS
    )
  } catch (error) {
    if (currentToken !== loadToken) return
    viewerSrc.value = null
    loadError.value = error?.message || String(error || t('Could not load PDF'))
    loading.value = false
  }
}

function reloadPdf() {
  void loadPdf()
}

async function handleIframeViewerMessage(event) {
  const frameWindow = iframeRef.value?.contentWindow
  if (event.source && frameWindow && event.source !== frameWindow) return

  const data = event.data
  if (!data || typeof data !== 'object') return

  if (data.channel === 'scribeflow-pdf-debug') {
    if (data.type === 'document-error' || data.type === 'open-failure') {
      if (
        fallbackToBlobAfterProtocolFailure({
          reason: String(data.reason || data.message || '').trim(),
          type: data.type,
        })
      ) {
        return
      }
      if (viewerLoadTimeout) {
        window.clearTimeout(viewerLoadTimeout)
        viewerLoadTimeout = 0
      }
      loadError.value = String(data.reason || data.message || t('Could not load PDF')).trim()
      hotReloadInFlight.value = false
      loading.value = false
      return
    }
    if (data.type === 'document-load' || data.type === 'open-success') {
      if (viewerLoadTimeout) {
        window.clearTimeout(viewerLoadTimeout)
        viewerLoadTimeout = 0
      }
      loadError.value = ''
      hotReloadInFlight.value = false
      loading.value = false
      return
    }
    return
  }

  if (data.channel !== 'scribeflow-latex-sync') return

  if (data.type === 'loaded' || data.type === 'pagesinit') {
    latexViewerReady.value = true
    if (pendingForwardSync) {
      postLatexViewerMessage('synctex', { data: pendingForwardSync })
      pendingForwardSync = null
    }
    return
  }

  if (data.type === 'reverse_synctex') {
    await handleLatexViewerReverseSync(data)
  }
}

async function handleForwardSyncRequest(request) {
  if (props.kind !== 'latex' || !request?.id || request.id === lastHandledForwardSyncId) return
  if (props.pdfViewerAutoSync !== true) {
    emit('forward-sync-handled', { id: request.id, sourcePath: props.sourcePath })
    return
  }

  const synctexPath = String(props.compileState?.synctexPath || '').trim()
  if (!synctexPath) {
    emit('forward-sync-handled', { id: request.id, sourcePath: props.sourcePath })
    return
  }

  lastHandledForwardSyncId = request.id
  try {
    const result = await requestLatexPdfForwardSync({
      synctexPath,
      texPath: props.sourcePath,
      line: request.line,
      column: request.column,
    })
    if (result?.page && Number.isFinite(result?.x) && Number.isFinite(result?.y)) {
      const point = {
        page: Number(result.page),
        x: Number(result.x),
        y: Number(result.y),
      }
      if (props.kind === 'latex') {
        const scrolled = scrollToPdfPoint(point)
        if (latexViewerReady.value) {
          postLatexViewerMessage('synctex', { data: point })
        }
        if (!scrolled) {
          pendingForwardSync = point
        }
      } else if (!scrollToPdfPoint(point)) {
        pendingForwardSync = point
      }
    }
  } catch {
    emit('open-external')
  } finally {
    emit('forward-sync-handled', { id: request.id, sourcePath: props.sourcePath })
  }
}

async function handlePreviewRevisionChange(nextRevision, previousRevision) {
  const transition = resolvePdfPreviewSessionTransition(previewSessionState, nextRevision, {
    viewState: captureCurrentPreviewViewState(),
  })
  syncPreviewSessionState(transition.nextSession)

  const previousRevisionKey = previousRevision?.revisionKey || ''
  const nextRevisionKey = nextRevision?.revisionKey || ''
  if (!nextRevisionKey || nextRevisionKey === previousRevisionKey) return
  if (transition.action === 'noop') return

  if (transition.action === 'refresh-document') {
    const reopened = await reopenPdfInPlace({
      preferProtocol: true,
      viewState: transition.nextSession.viewState,
    }).catch(() => false)
    if (reopened) return
  }

  void loadPdf()
}

watch(
  () => props.themeTokens,
  () => {
    applyTheme()
  },
  { deep: true }
)

watch(
  () => viewerThemeReloadKey.value,
  (nextKey, previousKey) => {
    if (previousKey != null && nextKey !== previousKey && viewerSrc.value) {
      void loadPdf()
      return
    }
    applyTheme()
  }
)

watch(
  () => [props.pdfViewerZoomMode, props.pdfViewerSpreadMode],
  () => {
    applyViewerDefaults()
  }
)

watch(
  () => props.previewRevision || getActivePreviewRevision(),
  (nextRevision, previousRevision) => {
    void handlePreviewRevisionChange(nextRevision, previousRevision)
  },
  { immediate: true, deep: true }
)

watch(
  () => props.forwardSyncRequest,
  (request) => {
    void handleForwardSyncRequest(request)
  }
)

function activateViewerRuntime() {
  if (viewerRuntimeActive) return
  viewerRuntimeActive = true
  window.addEventListener('message', handleIframeViewerMessage)
  window.addEventListener(SHELL_RESIZE_PHASE_EVENT, handleShellResizePhase)
  void loadPdf()
}

function deactivateViewerRuntime() {
  if (!viewerRuntimeActive) return
  viewerRuntimeActive = false
  window.removeEventListener('message', handleIframeViewerMessage)
  window.removeEventListener(SHELL_RESIZE_PHASE_EVENT, handleShellResizePhase)
  resetViewerRuntime()
}

onMounted(() => {
  activateViewerRuntime()
})

onActivated(() => {
  activateViewerRuntime()
})

onDeactivated(() => {
  deactivateViewerRuntime()
})

onUnmounted(() => {
  deactivateViewerRuntime()
  resetViewerRuntime()
})

defineExpose({
  reloadPdf,
  scrollToPdfPoint,
})
</script>

<style scoped>
.pdf-artifact-preview {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--shell-preview-surface, var(--shell-editor-surface));
  cursor: text;
  contain: strict;
  isolation: isolate;
}

.pdf-artifact-preview__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  cursor: text;
}

.pdf-artifact-preview__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--shell-preview-surface, var(--shell-editor-surface));
}

.pdf-artifact-preview__error-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.pdf-artifact-preview__error-message {
  max-width: min(420px, 100%);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.pdf-artifact-preview__error-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
</style>
