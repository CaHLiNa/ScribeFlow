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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import UiButton from '../shared/ui/UiButton.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import { useI18n } from '../../i18n'
import { readWorkspaceTextFile, saveWorkspaceTextFile } from '../../services/fileStoreIO.js'
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
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks.js'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'

const props = defineProps({
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, required: true },
  workspacePath: { type: String, default: '' },
  compileState: { type: Object, default: null },
  documentVersion: { type: [String, Number], default: '' },
  forwardSyncRequest: { type: Object, default: null },
  resolvedTheme: { type: String, default: 'dark' },
  pdfThemedPages: { type: Boolean, default: true },
  themeRevision: { type: Number, default: 0 },
  themeTokens: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['open-external', 'backward-sync', 'forward-sync-handled'])

const { t } = useI18n()
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

const iframeRef = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const loadError = ref('')
const viewerKey = ref(0)
const latexViewerReady = ref(false)
const surfaceStyle = computed(() => ({ ...(props.themeTokens || {}) }))
const viewerThemeReloadKey = computed(() =>
  JSON.stringify({
    resolvedTheme: getResolvedTheme(),
    pdfThemedPages: props.pdfThemedPages === true,
    themeRevision: Number(props.themeRevision || 0),
    pageBackground: resolveThemeToken('--shell-editor-surface'),
    pageForeground: resolveThemeToken('--workspace-ink'),
    useCanvasFilterFallback: shouldUseCanvasFilterFallback(),
  })
)

let currentBlobUrl = null
let pdfSaveInProgress = false
let lastHandledForwardSyncId = 0
let pendingForwardSync = null
let loadToken = 0
let latexReverseSyncCleanup = null
let viewerContextMenuCleanup = null
const LATEX_SYNC_DEBUG_LOG = '.altals-latex-sync-debug.jsonl'

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

async function appendLatexSyncDebug(entry = {}) {
  const workspacePath = String(props.workspacePath || '').trim()
  if (!workspacePath) return
  const logPath = `${workspacePath}/${LATEX_SYNC_DEBUG_LOG}`
  const line = `${JSON.stringify({
    ts: new Date().toISOString(),
    stage: 'preview',
    sourcePath: props.sourcePath,
    artifactPath: props.artifactPath,
    ...entry,
  })}\n`
  try {
    const previous = await readWorkspaceTextFile(logPath).catch(() => '')
    await saveWorkspaceTextFile(logPath, `${previous}${line}`)
  } catch {
    // Ignore debug log failures.
  }
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

function shouldUseCanvasFilterFallback() {
  return shouldUsePdfCanvasFilterFallback({
    themedPages: props.pdfThemedPages,
    resolvedTheme: getResolvedTheme(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  })
}

function applyCanvasFilterFallback() {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  const root = doc.documentElement
  const useFallback = shouldUseCanvasFilterFallback()
  const pageBackground = resolveThemeToken('--shell-editor-surface')
  root.dataset.altalsCanvasFilterFallback = useFallback ? 'true' : 'false'
  root.style.setProperty(
    '--altals-pdf-page-bg',
    useFallback && pageBackground ? pageBackground : ''
  )
  root.style.setProperty(
    '--altals-pdf-canvas-filter',
    useFallback ? 'invert(1) hue-rotate(180deg) contrast(1.08) brightness(1.05)' : 'none'
  )
}

function applyTheme() {
  const doc = iframeRef.value?.contentDocument
  if (!doc?.documentElement) return
  const root = doc.documentElement
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
    const value = resolveThemeToken(sourceName)
    if (value) {
      root.style.setProperty(targetName, value)
    }
  }

  applyCanvasFilterFallback()
}

function getViewerThemeOptions() {
  return buildPdfViewerThemeOptions({
    themedPages: props.pdfThemedPages,
    resolvedTheme: getResolvedTheme(),
    usePageFilterFallback: shouldUseCanvasFilterFallback(),
    pageBackground: resolveThemeToken('--shell-editor-surface'),
    pageForeground: resolveThemeToken('--workspace-ink'),
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

function installViewerPatches() {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow) return

  try {
    viewerContextMenuCleanup?.()
    viewerContextMenuCleanup = null

    frameWindow.document.addEventListener('mousedown', () => {
      iframeRef.value?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    frameWindow.document.addEventListener('keydown', (event) => {
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
    })

    frameWindow.document.addEventListener(
      'click',
      async (event) => {
        const resolved = resolveExternalHttpAnchor(event.target, frameWindow.location.href)
        if (!resolved?.url) return
        event.preventDefault()
        event.stopPropagation()
        try {
          await openExternalHttpUrl(resolved.url)
        } catch {
          // Ignore shell-open failures here.
        }
      },
      true
    )

    const contextMenuHandler = (event) => {
      event.preventDefault()
      event.stopPropagation()
      handleIframeContextMenu(event)
    }
    frameWindow.document.addEventListener('contextmenu', contextMenuHandler, true)
    viewerContextMenuCleanup = () => {
      frameWindow.document.removeEventListener('contextmenu', contextMenuHandler, true)
    }

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
  latexViewerReady.value = false

  revokeCurrentBlobUrl()

  if (!artifactPath) {
    viewerSrc.value = null
    loading.value = false
    return
  }

  try {
    const base64 = await readPdfArtifactBase64(artifactPath)
    if (currentToken !== loadToken) return

    const bytes = base64ToUint8Array(base64)
    currentBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    viewerSrc.value = buildPdfViewerSrc(currentBlobUrl, getViewerThemeOptions())
    viewerKey.value += 1
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
    applyTheme()
    if (previousKey != null && nextKey !== previousKey && viewerSrc.value) {
      void loadPdf()
    }
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

onMounted(() => {
  window.addEventListener('message', handleIframeViewerMessage)
  void loadPdf()
})

onUnmounted(() => {
  window.removeEventListener('message', handleIframeViewerMessage)
  loadToken += 1
  pendingForwardSync = null
  viewerContextMenuCleanup?.()
  viewerContextMenuCleanup = null
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
  background: var(--shell-editor-surface);
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
