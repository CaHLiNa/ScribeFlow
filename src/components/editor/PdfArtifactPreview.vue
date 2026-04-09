<template>
  <div class="pdf-artifact-preview">
    <iframe
      v-if="viewerSrc"
      ref="iframeRef"
      :key="viewerKey"
      :src="viewerSrc"
      class="pdf-artifact-preview__frame"
      :title="t('PDF preview')"
      @load="onIframeLoad"
    />

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
import { buildPdfViewerSrc } from '../../services/pdf/viewerUrl.js'
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
const viewerSrc = ref(null)
const loading = ref(true)
const loadError = ref('')
const viewerKey = ref(0)

let currentBlobUrl = null
let pdfSaveInProgress = false
let lastHandledForwardSyncId = 0
let pendingForwardSync = null
let loadToken = 0

const compileState = computed(() => {
  if (props.kind === 'latex') return latexStore.stateForFile(props.sourcePath) || null
  if (props.kind === 'typst') return typstStore.stateForFile(props.sourcePath) || null
  return null
})

const artifactVersion = computed(() => compileState.value?.lastCompiled || '')

const LIGHT_THEMES = new Set(['light', 'one-light', 'humane', 'solarized'])
const isDark = computed(() => {
  const normalized = normalizeWorkspaceThemeId(workspace.theme)
  if (normalized === 'dark') return true
  if (normalized === 'light') return false
  return !LIGHT_THEMES.has(workspace.theme)
})

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

function getViewerApp() {
  return iframeRef.value?.contentWindow?.PDFViewerApplication || null
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

  root.style.setProperty('color-scheme', isDark.value ? 'dark' : 'light')
  for (const [targetName, sourceName] of tokenMap) {
    const value = source.getPropertyValue(sourceName).trim()
    if (value) {
      root.style.setProperty(targetName, value)
    }
  }
}

function getViewerThemeOptions() {
  const source = getComputedStyle(document.documentElement)
  const pageBackground = source.getPropertyValue('--shell-editor-surface').trim()
  const pageForeground = source.getPropertyValue('--text-primary').trim()

  return {
    forcePageColors: Boolean(pageBackground && pageForeground),
    pageBackground,
    pageForeground,
    viewerCssTheme: isDark.value ? 2 : 1,
  }
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
  const app = getViewerApp()
  const page = Number(point.page || 0)
  const x = Number(point.x)
  const y = Number(point.y)
  if (!app?.pdfViewer || !Number.isInteger(page) || page < 1) return false

  if (Number.isFinite(x) && Number.isFinite(y)) {
    app.pdfViewer.scrollPageIntoView({
      pageNumber: page,
      destArray: [null, { name: 'XYZ' }, x, y, null],
      allowNegativeOffset: true,
    })
    return true
  }

  app.pdfViewer.scrollPageIntoView({ pageNumber: page })
  return true
}

async function handlePdfDoubleClick(event) {
  if (props.kind !== 'latex') return

  const pageDom = event.target instanceof Element
    ? event.target.closest('.page')
    : null
  const pageNumber = Number(pageDom?.dataset?.pageNumber || 0)
  if (!pageDom || !Number.isInteger(pageNumber) || pageNumber < 1) return

  const app = getViewerApp()
  const pageView = app?.pdfViewer?._pages?.[pageNumber - 1]
  const viewerContainer = iframeRef.value?.contentDocument?.getElementById('viewerContainer')
  const canvasDom = pageDom.getElementsByTagName('canvas')[0]
  const canvasWrapper = pageDom.getElementsByClassName('canvasWrapper')[0]
  if (!pageView || !viewerContainer || !canvasDom || !canvasWrapper) return

  const left = event.pageX - pageDom.offsetLeft + viewerContainer.scrollLeft - canvasWrapper.offsetLeft
  const top = event.pageY - pageDom.offsetTop + viewerContainer.scrollTop - canvasWrapper.offsetTop
  const pos = pageView.getPagePoint(left, canvasDom.offsetHeight - top)
  if (!Array.isArray(pos) || pos.length < 2) return

  const synctexPath = String(compileState.value?.synctexPath || '').trim()
  if (!synctexPath) return

  try {
    const result = await requestLatexPdfBackwardSync({
      synctexPath,
      page: pageNumber,
      x: Number(pos[0]),
      y: Number(pos[1]),
    })
    if (result?.file && result?.line) {
      window.dispatchEvent(new CustomEvent('latex-backward-sync', {
        detail: result,
      }))
    }
  } catch {
    // Ignore backward sync failures and leave the viewer stable.
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

    if (props.kind === 'latex') {
      frameWindow.document.addEventListener('dblclick', (event) => {
        void handlePdfDoubleClick(event)
      }, true)
    }

    const app = frameWindow.PDFViewerApplication
    if (app) {
      app.eventBus?.on?.('pagesloaded', normalizeViewerChromeText)
      app.downloadOrSave = async function downloadOrSavePatched() {
        const { classList } = this.appConfig.appContainer
        classList.add('wait')
        await savePdfToDisk()
        classList.remove('wait')
      }
      app.download = async () => savePdfToDisk()
      app.save = async () => savePdfToDisk()
    }
  } catch {
    // Same-origin access can fail transiently during reload; the iframe can still render.
  }
}

function onIframeLoad() {
  applyTheme()
  normalizeViewerChromeText()
  installViewerPatches()
  loading.value = false
  loadError.value = ''

  if (pendingForwardSync) {
    scrollToPdfPoint(pendingForwardSync)
    pendingForwardSync = null
  }
}

async function loadPdf() {
  const artifactPath = String(props.artifactPath || '').trim()
  loadToken += 1
  const currentToken = loadToken

  loading.value = true
  loadError.value = ''

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

watch(isDark, () => {
  applyTheme()
  if (viewerSrc.value) {
    void loadPdf()
  }
})

watch(
  () => [props.artifactPath, artifactVersion.value],
  () => {
    void loadPdf()
  },
  { immediate: true },
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
        if (!scrollToPdfPoint(point)) {
          pendingForwardSync = point
        }
      }
    } catch {
      emit('open-external')
    } finally {
      latexStore.clearForwardSync(props.sourcePath, request.id)
    }
  },
)

onMounted(() => {
  void loadPdf()
})

onUnmounted(() => {
  loadToken += 1
  pendingForwardSync = null
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
