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

    <div v-if="loading" class="pdf-artifact-preview__state">
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
import { readWorkspaceTextFile, saveWorkspaceTextFile } from '../../services/fileStoreIO.js'
import {
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
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks.js'
import { toWorkspaceProtocolUrl } from '../../utils/workspaceProtocol.js'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import { useTransientOverlayDismiss } from '../../composables/useTransientOverlayDismiss'
import { isShellResizeActive, SHELL_RESIZE_PHASE_EVENT } from '../../shared/shellResizeSignals.js'

const props = defineProps({
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, required: true },
  workspacePath: { type: String, default: '' },
  workspaceDataDir: { type: String, default: '' },
  globalConfigDir: { type: String, default: '' },
  compileState: { type: Object, default: null },
  documentVersion: { type: [String, Number], default: '' },
  forwardSyncRequest: { type: Object, default: null },
  resolvedTheme: { type: String, default: 'dark' },
  pdfPageBackgroundFollowsTheme: { type: Boolean, default: true },
  pdfCustomPageBackground: { type: String, default: '#1e1e1e' },
  themeTokens: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['open-external', 'backward-sync', 'forward-sync-handled'])

const { locale: uiLocale, t } = useI18n()
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

let currentBlobUrl = null
let pdfSaveInProgress = false
let lastHandledForwardSyncId = 0
let pendingForwardSync = null
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

async function appendLatexSyncDebug(entry = {}) {
  void entry
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
  loadToken += 1
  pendingForwardSync = null
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
      channel: 'altals-latex-sync',
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
  root.dataset.altalsCanvasFilterFallback = useFallback ? 'true' : 'false'
  root.style.setProperty(
    '--altals-pdf-page-bg',
    useFallback && pageBackground ? pageBackground : ''
  )
  root.style.setProperty(
    '--altals-pdf-canvas-filter',
    useFallback && fallbackMode === 'dark'
      ? 'invert(1) hue-rotate(180deg) contrast(1.08) brightness(1.05)'
      : 'none'
  )
  root.style.setProperty(
    '--altals-pdf-canvas-blend-mode',
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
    ['--altals-surface-base', '--surface-base'],
    ['--altals-surface-raised', '--surface-raised'],
    ['--altals-surface-hover', '--surface-hover'],
    ['--altals-border-subtle', '--border-subtle'],
    ['--altals-text-primary', '--text-primary'],
    ['--altals-text-muted', '--text-muted'],
    ['--altals-focus-ring', '--focus-ring'],
  ])

  root.style.setProperty('color-scheme', getResolvedTheme())
  for (const [targetName, sourceName] of tokenMap) {
    const value = resolveThemeToken(sourceName)
    if (value) {
      root.style.setProperty(targetName, value)
    }
  }

  if (pdfSurfaceBackground) {
    root.style.setProperty('--altals-shell-preview-surface', pdfSurfaceBackground)
    root.style.setProperty('--altals-pdf-page-bg', pageBackground)
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
    await appendLatexSyncDebug({
      event: 'reverse-sync-start',
      detail,
      synctexPath,
    })
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
      await appendLatexSyncDebug({
        event: 'reverse-sync-result',
        detail,
        result,
        resolvedFile: resolvedFile || result.file,
      })
      emit('backward-sync', {
        ...result,
        file: resolvedFile || result.file,
        textBeforeSelection: String(detail.textBeforeSelection || ''),
        textAfterSelection: String(detail.textAfterSelection || ''),
      })
      return
    }
    await appendLatexSyncDebug({
      event: 'reverse-sync-empty',
      detail,
      result,
    })
  } catch (error) {
    await appendLatexSyncDebug({
      event: 'reverse-sync-error',
      detail,
      error: error?.message || String(error || ''),
    })
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
    latexViewerReady.value = true
    flushPendingLatexForwardSync()
  }
  const handleDocumentLoaded = () => {
    if (viewerLoadTimeout) {
      window.clearTimeout(viewerLoadTimeout)
      viewerLoadTimeout = 0
    }
    loading.value = false
    loadError.value = ''
    applyTheme()
    normalizeViewerChromeText()
  }
  const handlePagesLoaded = () => {
    applyTheme()
    normalizeViewerChromeText()
    installLatexReverseSyncHandlers()
    latexViewerReady.value = true
    flushPendingLatexForwardSync()
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
  return toWorkspaceProtocolUrl(
    artifactPath,
    {
      path: props.workspacePath,
      workspaceDataDir: props.workspaceDataDir,
      globalConfigDir: props.globalConfigDir,
    },
    {
      version: props.documentVersion,
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

function buildViewerStateSnapshot(app = getViewerApp()) {
  return {
    hasApp: Boolean(app),
    initialized: Boolean(app?.initialized),
    hasEventBus: Boolean(app?.eventBus),
    hasLoadingTask: Boolean(app?.pdfLoadingTask),
    hasPdfDocument: Boolean(app?.pdfDocument),
    hasL10n: Boolean(app?.l10n),
    hasPdfViewer: Boolean(app?.pdfViewer),
    hasToolbar: Boolean(app?.toolbar),
    hasSecondaryToolbar: Boolean(app?.secondaryToolbar),
    pagesCount: Number(app?.pagesCount || app?.pdfDocument?.numPages || 0),
    initPhase: String(app?._altalsInitPhase || ''),
    runPhase: String(app?._altalsRunPhase || ''),
    openPhase: String(app?._altalsOpenPhase || ''),
    viewerUrl: String(app?.url || ''),
    viewerBaseUrl: String(app?.baseUrl || ''),
    viewerSrc: String(viewerSrc.value || ''),
    artifactPath: String(props.artifactPath || ''),
  }
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
  void appendLatexSyncDebug({
    event: 'pdf-protocol-load-failed',
    sourceMode: activeLoadSourceMode,
    detail,
    snapshot: buildViewerStateSnapshot(),
  })
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
    const protocolUrl = preferProtocol ? resolveProtocolViewerUrl(artifactPath) : ''
    const fileUrl = protocolUrl || null
    let sourceMode = fileUrl ? 'protocol' : 'blob'
    activeLoadSourceMode = sourceMode
    protocolFailureFallbackTriggered = sourceMode !== 'protocol'

    if (!fileUrl) {
      const base64 = await readPdfArtifactBase64(artifactPath)
      if (currentToken !== loadToken) return

      const bytes = base64ToUint8Array(base64)
      currentBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    }

    viewerSrc.value = buildPdfViewerSrc(fileUrl || currentBlobUrl, {
      ...getViewerThemeOptions(),
      locale: getViewerLocale(),
    })
    viewerKey.value += 1

    viewerLoadTimeout = window.setTimeout(
      () => {
        if (currentToken !== loadToken || !loading.value) return
        viewerLoadTimeout = 0
        if (syncViewerLoadedState()) {
          return
        }
        void appendLatexSyncDebug({
          event: 'pdf-load-timeout',
          sourceMode,
          snapshot: buildViewerStateSnapshot(),
        })
        if (sourceMode === 'protocol') {
          void loadPdfWithStrategy({ preferProtocol: false })
          return
        }
        loadError.value = t('PDF viewer did not finish rendering the document.')
        loading.value = false
      },
      sourceMode === 'protocol' ? PROTOCOL_LOAD_TIMEOUT_MS : BLOB_LOAD_TIMEOUT_MS
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

  if (data.channel === 'altals-pdf-debug') {
    void appendLatexSyncDebug({
      event: 'pdf-viewer-debug',
      detail: data,
      snapshot: buildViewerStateSnapshot(),
    })
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
      loading.value = false
      return
    }
    if (data.type === 'document-load' || data.type === 'open-success') {
      if (viewerLoadTimeout) {
        window.clearTimeout(viewerLoadTimeout)
        viewerLoadTimeout = 0
      }
      loadError.value = ''
      loading.value = false
      return
    }
    return
  }

  if (data.channel !== 'altals-latex-sync') return

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
  () => [props.artifactPath, props.documentVersion],
  () => {
    void loadPdf()
  },
  { immediate: true }
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
