<template>
  <div
    ref="shellRef"
    class="pdf-hosted-preview"
    data-surface-context-guard="true"
    :style="surfaceStyle"
  >
    <div v-if="hostError" class="pdf-hosted-preview__state">
      <div class="pdf-hosted-preview__error-title">{{ t('Preview failed') }}</div>
      <div class="pdf-hosted-preview__error-message">{{ hostError }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'

import { useI18n } from '../../i18n'
import {
  PDF_PREVIEW_HOST_BACKWARD_SYNC_EVENT,
  PDF_PREVIEW_HOST_FORWARD_SYNC_HANDLED_EVENT,
  PDF_PREVIEW_HOST_READY_EVENT,
  PDF_PREVIEW_HOST_UPDATE_EVENT,
  buildPdfPreviewHostUrl,
  buildPdfPreviewWebviewLabel,
  createPdfPreviewHostPayload,
  destroyPdfPreviewWebview,
  ensurePdfPreviewWebview,
  hidePdfPreviewWebview,
  isPdfHostedPreviewSupported,
} from '../../services/pdf/pdfPreviewWebview.js'

const props = defineProps({
  paneId: { type: String, required: true },
  sessionId: { type: Number, default: 0 },
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

const emit = defineEmits(['backward-sync', 'forward-sync-handled', 'unavailable'])

const { t } = useI18n()

const shellRef = ref(null)
const hostError = ref('')
const surfaceStyle = computed(() => ({ ...(props.themeTokens || {}) }))
const hostLabel = computed(() => buildPdfPreviewWebviewLabel(`${props.paneId}:${props.sessionId}`))

let currentWebview = null
let parentLabel = ''
let resizeObserver = null
let resizeFrame = 0
let pendingPayload = null
let cleanupReadyListener = null
let cleanupBackwardListener = null
let cleanupForwardHandledListener = null

function isHostedPreviewPermissionError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('create_webview not allowed') ||
    message.includes('core:webview:allow-create-webview') ||
    message.includes('not allowed')
  )
}

function getHostUrl() {
  const bootBackground = String(
    props.themeTokens?.['--shell-preview-surface'] ||
      props.themeTokens?.['--shell-editor-surface'] ||
      ''
  ).trim()
  return buildPdfPreviewHostUrl({
    label: hostLabel.value,
    parentLabel,
    resolvedTheme: props.resolvedTheme,
    themeRevision: props.themeRevision,
    bootBackground,
    bootForeground: props.themeTokens?.['--workspace-ink'] || '',
  })
}

function measureBounds() {
  const rect = shellRef.value?.getBoundingClientRect?.()
  if (!rect || rect.width < 1 || rect.height < 1) return null
  return {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

function buildPayload() {
  return createPdfPreviewHostPayload({
    label: hostLabel.value,
    sourcePath: props.sourcePath,
    artifactPath: props.artifactPath,
    kind: props.kind,
    workspacePath: props.workspacePath,
    documentVersion: props.documentVersion,
    compileState: props.compileState,
    forwardSyncRequest: props.forwardSyncRequest,
    resolvedTheme: props.resolvedTheme,
    pdfThemedPages: props.pdfThemedPages,
    themeRevision: props.themeRevision,
    themeTokens: props.themeTokens,
  })
}

async function syncHostedBounds() {
  if (!isPdfHostedPreviewSupported()) return
  const bounds = measureBounds()
  if (!bounds) {
    await hidePdfPreviewWebview(hostLabel.value).catch(() => {})
    return
  }

  await ensurePdfPreviewWebview({
    label: hostLabel.value,
    url: getHostUrl(),
    bounds,
  })
}

async function sendHostedPayload() {
  if (!isPdfHostedPreviewSupported()) return
  pendingPayload = buildPayload()
  const bounds = measureBounds()
  if (!bounds) return

  try {
    await ensurePdfPreviewWebview({
      label: hostLabel.value,
      url: getHostUrl(),
      bounds,
    })
    const emitter = currentWebview || getCurrentWebview()
    currentWebview = emitter
    await emitter
      .emitTo(hostLabel.value, PDF_PREVIEW_HOST_UPDATE_EVENT, pendingPayload)
      .catch(() => {})
    hostError.value = ''
  } catch (error) {
    hostError.value = error?.message || String(error || t('Could not load PDF'))
    if (isHostedPreviewPermissionError(error)) {
      emit('unavailable', {
        reason: 'permission-denied',
        message: hostError.value,
      })
    }
  }
}

function scheduleHostedBoundsSync() {
  if (resizeFrame) return
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0
    void syncHostedBounds()
  })
}

async function installHostEventBridge() {
  if (!isPdfHostedPreviewSupported()) return
  currentWebview = getCurrentWebview()
  parentLabel = String(currentWebview?.label || '').trim()
  if (!parentLabel) return

  cleanupReadyListener = await currentWebview.listen(PDF_PREVIEW_HOST_READY_EVENT, (event) => {
    if (String(event.payload?.label || '') !== hostLabel.value) return
    if (!pendingPayload) return
    void currentWebview
      .emitTo(hostLabel.value, PDF_PREVIEW_HOST_UPDATE_EVENT, pendingPayload)
      .catch(() => {})
  })

  cleanupBackwardListener = await currentWebview.listen(
    PDF_PREVIEW_HOST_BACKWARD_SYNC_EVENT,
    (event) => {
      if (String(event.payload?.label || '') !== hostLabel.value) return
      emit('backward-sync', event.payload?.detail || null)
    }
  )

  cleanupForwardHandledListener = await currentWebview.listen(
    PDF_PREVIEW_HOST_FORWARD_SYNC_HANDLED_EVENT,
    (event) => {
      if (String(event.payload?.label || '') !== hostLabel.value) return
      emit('forward-sync-handled', event.payload || null)
    }
  )
}

onMounted(async () => {
  if (!isPdfHostedPreviewSupported()) return
  await installHostEventBridge()
  resizeObserver = new ResizeObserver(() => {
    scheduleHostedBoundsSync()
  })
  if (shellRef.value) {
    resizeObserver.observe(shellRef.value)
  }
  await syncHostedBounds()
  await sendHostedPayload()
})

onUnmounted(() => {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = 0
  }
  resizeObserver?.disconnect?.()
  resizeObserver = null
  cleanupReadyListener?.()
  cleanupReadyListener = null
  cleanupBackwardListener?.()
  cleanupBackwardListener = null
  cleanupForwardHandledListener?.()
  cleanupForwardHandledListener = null
  void destroyPdfPreviewWebview(hostLabel.value)
})

watch(
  () => [
    props.sourcePath,
    props.artifactPath,
    props.kind,
    props.workspacePath,
    props.documentVersion,
    props.forwardSyncRequest,
    props.compileState,
    props.resolvedTheme,
    props.pdfThemedPages,
    props.themeRevision,
    props.themeTokens,
  ],
  () => {
    void sendHostedPayload()
  },
  { deep: true }
)
</script>

<style scoped>
.pdf-hosted-preview {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--shell-preview-surface, var(--shell-editor-surface));
  cursor: text;
  isolation: isolate;
}

.pdf-hosted-preview__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--shell-preview-surface, var(--shell-editor-surface));
}

.pdf-hosted-preview__error-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.pdf-hosted-preview__error-message {
  max-width: min(420px, 100%);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
</style>
