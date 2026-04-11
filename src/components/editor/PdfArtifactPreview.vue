<template>
  <div
    ref="shellRef"
    class="pdf-artifact-preview"
    :class="{ 'is-resize-suspended': previewSuspended }"
  >
    <iframe
      v-if="viewerSrc"
      ref="iframeRef"
      :key="viewerKey"
      :src="viewerSrc"
      class="pdf-artifact-preview__frame"
      :title="t('PDF preview')"
      v-show="!previewSuspended || !iframeLoaded"
      @load="onIframeLoad"
    />

    <div
      v-if="previewSuspended && iframeLoaded && !loading && !loadError"
      class="pdf-artifact-preview__freeze-mask"
      aria-hidden="true"
    ></div>

    <div
      v-if="loading"
      class="pdf-artifact-preview__state"
    >
      {{ t('Loading PDF...') }}
    </div>

    <div
      v-else-if="loadError"
      class="pdf-artifact-preview__state"
    >
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
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import UiButton from '../shared/ui/UiButton.vue'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { useLatexStore } from '../../stores/latex.js'
import { useTypstStore } from '../../stores/typst.js'
import { useI18n } from '../../i18n'
import {
  readPdfArtifactBase64,
  requestLatexPdfBackwardSync,
  requestLatexPdfForwardSync,
  writePdfArtifactBase64,
} from '../../services/pdf/artifactPreview.js'
import { resolveLatexSyncTargetPath } from '../../services/latex/previewSync.js'
import {
  dispatchLatexBackwardSync,
  resolveLatexPdfReverseSyncPayload,
  scrollPdfPreviewToPoint,
} from '../../services/latex/pdfPreviewSync.js'
import {
  buildPdfViewerSrc,
  buildPdfViewerThemeOptions,
  shouldUsePdfCanvasFilterFallback,
} from '../../services/pdf/viewerUrl.js'
import { normalizeWorkspaceThemeId } from '../../shared/workspaceThemeOptions.js'
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks.js'

const props = defineProps({
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, required: true },
})

const emit = defineEmits(['open-external'])

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const typstStore = useTypstStore()
const { t } = useI18n()

const iframeRef = ref(null)
const shellRef = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const loadError = ref('')
const viewerKey = ref(0)
const iframeLoaded = ref(false)
const previewSuspended = ref(false)
const latexViewerReady = ref(false)

let currentBlobUrl = null
let pdfSaveInProgress = false
let lastHandledForwardSyncId = 0
let pendingForwardSync = null
let loadToken = 0
let resizeObserver = null
let previewResumeTimer = null
let lastObservedShellSize = { width: 0, height: 0 }
let latexReverseSyncCleanup = null

const RESIZE_SUSPEND_SETTLE_MS = 140
const TOGGLE_SUSPEND_SETTLE_MS = 320
const RESIZE_SUSPEND_DELTA_PX = 1

const compileState = computed(() => {
  if (props.kind === 'latex') return latexStore.stateForFile(props.sourcePath) || null
  if (props.kind === 'typst') return typstStore.stateForFile(props.sourcePath) || null
  return null
})

const artifactVersion = computed(() => compileState.value?.lastCompiled || '')

async function ensureLatexSynctexState() {
  if (props.kind !== 'latex') return
  const pdfPath = String(compileState.value?.pdfPath || props.artifactPath || '').trim()
  if (!pdfPath || String(compileState.value?.synctexPath || '').trim()) return
  await latexStore.registerExistingArtifact?.(props.sourcePath, pdfPath, {
    targetPath: compileState.value?.compileTargetPath || '',
  })
}

function getResolvedTheme() {
  if (typeof document === 'undefined') return 'dark'
  const datasetResolved = String(document.documentElement.dataset.themeResolved || '').trim().toLowerCase()
  if (datasetResolved === 'light' || datasetResolved === 'dark') {
    return datasetResolved
  }

  const normalizedTheme = normalizeWorkspaceThemeId(workspace.theme)
  if (normalizedTheme === 'light' || normalizedTheme === 'dark') {
    return normalizedTheme
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return 'dark'
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

function clearPreviewResumeTimer() {
  if (previewResumeTimer !== null) {
    window.clearTimeout(previewResumeTimer)
    previewResumeTimer = null
  }
}

function postLatexViewerMessage(type, payload = {}) {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow) return false
  frameWindow.postMessage({
    channel: 'altals-latex-sync',
    type,
    ...payload,
  }, '*')
  return true
}

function schedulePreviewResume(delay = RESIZE_SUSPEND_SETTLE_MS) {
  clearPreviewResumeTimer()
  previewResumeTimer = window.setTimeout(() => {
    previewResumeTimer = null
    previewSuspended.value = false
  }, delay)
}

function suspendPreviewForResize(delay = RESIZE_SUSPEND_SETTLE_MS) {
  if (!viewerSrc.value || !iframeLoaded.value) return
  previewSuspended.value = true
  schedulePreviewResume(delay)
}

function resetShellResizeTracking() {
  clearPreviewResumeTimer()
  previewSuspended.value = false
  lastObservedShellSize = { width: 0, height: 0 }
}

function observeShellResize() {
  if (typeof ResizeObserver === 'undefined' || !shellRef.value) return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const width = Math.round(entry.contentRect?.width || 0)
    const height = Math.round(entry.contentRect?.height || 0)
    if (width <= 0 || height <= 0) return

    const widthDelta = Math.abs(width - lastObservedShellSize.width)
    const heightDelta = Math.abs(height - lastObservedShellSize.height)
    lastObservedShellSize = { width, height }

    if (widthDelta < RESIZE_SUSPEND_DELTA_PX && heightDelta < RESIZE_SUSPEND_DELTA_PX) {
      if (previewSuspended.value) schedulePreviewResume()
      return
    }

    suspendPreviewForResize()
  })
  resizeObserver.observe(shellRef.value)
}

function getViewerApp() {
  return iframeRef.value?.contentWindow?.PDFViewerApplication || null
}

function shouldUseCanvasFilterFallback() {
  return shouldUsePdfCanvasFilterFallback({
    themedPages: workspace.pdfThemedPages,
    resolvedTheme: getResolvedTheme(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  })
}

function applyCanvasFilterFallback() {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  const root = doc.documentElement
  const useFallback = shouldUseCanvasFilterFallback()
  const source = getComputedStyle(document.documentElement)
  const pageBackground = source.getPropertyValue('--shell-editor-surface').trim()
  root.dataset.altalsCanvasFilterFallback = useFallback ? 'true' : 'false'
  root.style.setProperty('--altals-pdf-page-bg', useFallback && pageBackground ? pageBackground : '')
  root.style.setProperty(
    '--altals-pdf-canvas-filter',
    useFallback ? 'invert(1) hue-rotate(180deg) contrast(1.08) brightness(1.05)' : 'none',
  )
}

function applyTheme() {
  const doc = iframeRef.value?.contentDocument
  if (!doc?.documentElement) return
  const root = doc.documentElement
  const source = getComputedStyle(document.documentElement)
  const tokenMap = new Map([
    ['--altals-surface-base', '--surface-base'],
    ['--altals-surface-raised', '--surface-raised'],
    ['--altals-surface-hover', '--surface-hover'],
    ['--altals-border-subtle', '--border-subtle'],
    ['--altals-text-primary', '--text-primary'],
    ['--altals-text-muted', '--text-muted'],
    ['--altals-shell-preview-surface', '--shell-editor-surface'],
    ['--altals-focus-ring', '--focus-ring'],
  ])

  root.style.setProperty('color-scheme', getResolvedTheme())
  for (const [targetName, sourceName] of tokenMap) {
    const value = source.getPropertyValue(sourceName).trim()
    if (value) {
      root.style.setProperty(targetName, value)
    }
  }

  applyCanvasFilterFallback()
}

function getViewerThemeOptions() {
  const source = getComputedStyle(document.documentElement)
  return buildPdfViewerThemeOptions({
    themedPages: workspace.pdfThemedPages,
    resolvedTheme: getResolvedTheme(),
    usePageFilterFallback: shouldUseCanvasFilterFallback(),
    pageBackground: source.getPropertyValue('--shell-editor-surface').trim(),
    pageForeground: source.getPropertyValue('--workspace-ink').trim(),
  })
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
    const data = hasChanges
      ? await app.pdfDocument.saveDocument()
      : await app.pdfDocument.getData()

    const base64 = uint8ArrayToBase64(new Uint8Array(data))
    await writePdfArtifactBase64(props.artifactPath, base64)
  } catch (error) {
    console.error('PDF save error:', error)
  } finally {
    pdfSaveInProgress = false
  }
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
  const synctexPath = String(compileState.value?.synctexPath || '').trim()
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
        compileTargetPath: compileState.value?.compileTargetPath || '',
        workspacePath: workspace.path || '',
      })
      dispatchLatexBackwardSync(window, {
        ...result,
        file: resolvedFile || result.file,
        textBeforeSelection: String(detail.textBeforeSelection || ''),
        textAfterSelection: String(detail.textAfterSelection || ''),
      })
    }
  } catch (error) {
    // Ignore backward sync failures and leave the viewer stable.
  }
}

async function handlePdfDoubleClick(event) {
  if (props.kind !== 'latex') return
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

function installViewerPatches() {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow) return

  try {
    frameWindow.document.addEventListener('mousedown', () => {
      iframeRef.value?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    frameWindow.document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
        event.preventDefault()
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: event.key,
          code: event.code,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          bubbles: true,
          cancelable: true,
        }))
      }
    })

    frameWindow.document.addEventListener('click', async (event) => {
      const resolved = resolveExternalHttpAnchor(event.target, frameWindow.location.href)
      if (!resolved?.url) return
      event.preventDefault()
      event.stopPropagation()
      try {
        await openExternalHttpUrl(resolved.url)
      } catch {
        // Ignore shell-open failures here.
      }
    }, true)

    const app = frameWindow.PDFViewerApplication
    if (app) {
      app.eventBus?.on?.('pagesinit', () => {
        latexViewerReady.value = true
        flushPendingLatexForwardSync()
      })
      app.eventBus?.on?.('pagesloaded', () => {
        normalizeViewerChromeText()
        installLatexReverseSyncHandlers()
        latexViewerReady.value = true
        flushPendingLatexForwardSync()
      })
      app.downloadOrSave = async function downloadOrSavePatched() {
        const { classList } = this.appConfig.appContainer
        classList.add('wait')
        await savePdfToDisk()
        classList.remove('wait')
      }
      app.download = async () => savePdfToDisk()
      app.save = async () => savePdfToDisk()
    }

    installLatexReverseSyncHandlers()
  } catch {
    // Same-origin access can fail transiently during reload; the iframe can still render.
  }
}

function onIframeLoad() {
  iframeLoaded.value = true
  latexViewerReady.value = props.kind !== 'latex'
  applyTheme()
  normalizeViewerChromeText()
  installViewerPatches()
  requestAnimationFrame(() => applyCanvasFilterFallback())
  loading.value = false
  loadError.value = ''

  if (pendingForwardSync) {
    if (props.kind === 'latex') {
      flushPendingLatexForwardSync()
    } else {
      scrollToPdfPoint(pendingForwardSync)
      pendingForwardSync = null
    }
  }
}

async function loadPdf() {
  const artifactPath = String(props.artifactPath || '').trim()
  loadToken += 1
  const currentToken = loadToken

  loading.value = true
  loadError.value = ''
  iframeLoaded.value = false

  revokeCurrentBlobUrl()

  if (!artifactPath) {
    viewerSrc.value = null
    loading.value = false
    resetShellResizeTracking()
    return
  }

  try {
    const base64 = await readPdfArtifactBase64(artifactPath)
    if (currentToken !== loadToken) return

    const bytes = base64ToUint8Array(base64)
    currentBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    viewerSrc.value = buildPdfViewerSrc(currentBlobUrl, getViewerThemeOptions())
    viewerKey.value += 1
    resetShellResizeTracking()
  } catch (error) {
    if (currentToken !== loadToken) return
    viewerSrc.value = null
    loadError.value = error?.message || String(error || t('Could not load PDF'))
    loading.value = false
    resetShellResizeTracking()
  }
}

function reloadPdf() {
  void loadPdf()
}

async function handleIframeViewerMessage(event) {
  const data = event.data
  if (!data || data.channel !== 'altals-latex-sync') return

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

watch(
  () => [getResolvedTheme(), workspace.theme, workspace.pdfThemedPages],
  () => {
    applyTheme()
    if (viewerSrc.value) {
      void loadPdf()
    }
  },
)

function handleWorkspaceThemeUpdated() {
  applyTheme()
  if (viewerSrc.value) {
    void loadPdf()
  }
}

watch(
  () => [props.artifactPath, artifactVersion.value],
  () => {
    void ensureLatexSynctexState()
    void loadPdf()
  },
  { immediate: true },
)

watch(
  [() => workspace.leftSidebarOpen, () => workspace.rightSidebarOpen],
  ([nextLeftOpen, nextRightOpen], [prevLeftOpen, prevRightOpen]) => {
    if (nextLeftOpen === prevLeftOpen && nextRightOpen === prevRightOpen) return
    suspendPreviewForResize(TOGGLE_SUSPEND_SETTLE_MS)
  }
)

watch(
  () => latexStore.forwardSyncRequestFor(props.sourcePath),
  async (request) => {
    if (props.kind !== 'latex' || !request?.id || request.id === lastHandledForwardSyncId) return

    const synctexPath = String(compileState.value?.synctexPath || '').trim()
    if (!synctexPath) {
      latexStore.clearForwardSync(props.sourcePath, request.id)
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
    } catch (error) {
      emit('open-external')
    } finally {
      latexStore.clearForwardSync(props.sourcePath, request.id)
    }
  },
)

onMounted(() => {
  window.addEventListener('workspace-theme-updated', handleWorkspaceThemeUpdated)
  window.addEventListener('message', handleIframeViewerMessage)
  observeShellResize()
  void ensureLatexSynctexState()
  void loadPdf()
})

onUnmounted(() => {
  window.removeEventListener('workspace-theme-updated', handleWorkspaceThemeUpdated)
  window.removeEventListener('message', handleIframeViewerMessage)
  resizeObserver?.disconnect()
  resizeObserver = null
  clearPreviewResumeTimer()
  loadToken += 1
  pendingForwardSync = null
  latexReverseSyncCleanup?.()
  latexReverseSyncCleanup = null
  viewerSrc.value = null
  revokeCurrentBlobUrl()
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
  background: var(--shell-editor-surface);
  contain: strict;
  isolation: isolate;
}

.pdf-artifact-preview__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
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
  background: var(--shell-editor-surface);
}

.pdf-artifact-preview__freeze-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--shell-editor-surface) 94%, transparent) 0%,
    var(--shell-editor-surface) 100%
  );
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
