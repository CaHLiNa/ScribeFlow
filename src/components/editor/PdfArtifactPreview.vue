<template>
  <div ref="previewHostRef" class="pdf-artifact-preview-host">
    <component
      :is="PdfEmbedSurface"
      :sourcePath="sourcePath"
      :artifactPath="artifactPath"
      :previewRevision="previewRevision"
      :themeTokens="themeTokens"
      :kind="kind"
      :workspacePath="workspace.path || ''"
      :compileState="compileState"
      :forwardSyncRequest="forwardSyncRequest"
      :pdfViewerZoomMode="workspace.pdfViewerZoomMode"
      :pdfViewerSpreadMode="workspace.pdfViewerSpreadMode"
      :pdfViewerAutoSync="workspace.pdfViewerAutoSync"
      :pdfViewerLastScale="workspace.pdfViewerLastScale"
      @open-external="$emit('open-external')"
      @backward-sync="handleBackwardSync"
      @forward-sync-handled="handleForwardSyncHandled"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import { useLatexStore } from '../../stores/latex.js'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { dispatchLatexBackwardSync } from '../../services/latex/pdfPreviewSync.js'
import { resolvePdfPreviewRevision } from '../../domains/document/pdfPreviewSessionRuntime.js'
import PdfEmbedSurface from './PdfEmbedSurface.vue'

const PDF_PREVIEW_THEME_TOKEN_NAMES = [
  '--surface-base',
  '--surface-raised',
  '--surface-hover',
  '--border-subtle',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--shell-preview-surface',
  '--shell-editor-surface',
  '--workspace-ink',
  '--focus-ring',
  '--error',
]

const props = defineProps({
  paneId: { type: String, default: 'pane-root' },
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, required: true },
})

defineEmits(['open-external'])

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const workflowStore = useDocumentWorkflowStore()
const previewHostRef = ref(null)
const themeTokens = ref(capturePdfPreviewThemeTokens())

const compileState = computed(() => {
  if (props.kind !== 'latex') return null

  const liveState = latexStore.stateForFile(props.sourcePath) || null
  const persistedState = workflowStore.getLatexPreviewStateForFile(props.sourcePath) || null
  if (liveState && persistedState) {
    return {
      ...persistedState,
      ...liveState,
    }
  }

  return liveState || persistedState || null
})

const forwardSyncRequest = computed(() =>
  props.kind === 'latex' ? latexStore.forwardSyncRequestFor(props.sourcePath) : null
)
const previewRevision = computed(() =>
  resolvePdfPreviewRevision({
    paneId: props.paneId,
    sourcePath: props.sourcePath,
    artifactPath: props.artifactPath,
    kind: props.kind,
    compileState: compileState.value,
  })
)

function refreshThemeTokens() {
  themeTokens.value = capturePdfPreviewThemeTokens()
}

function readThemeTokenValue(name) {
  if (typeof document === 'undefined') return ''

  const hostElement = previewHostRef.value
  if (hostElement) {
    const hostValue = String(getComputedStyle(hostElement).getPropertyValue(name) || '').trim()
    if (hostValue) return hostValue
  }

  return String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim()
}

function capturePdfPreviewThemeTokens() {
  if (typeof document === 'undefined') return {}
  const tokens = {}
  for (const name of PDF_PREVIEW_THEME_TOKEN_NAMES) {
    const value = readThemeTokenValue(name)
    if (value) {
      tokens[name] = value
    }
  }
  return tokens
}

let themeSnapshotFrame = 0

function commitThemeSnapshot() {
  refreshThemeTokens()
}

async function scheduleThemeSnapshot() {
  await nextTick()
  if (typeof window === 'undefined') {
    commitThemeSnapshot()
    return
  }
  if (themeSnapshotFrame) return
  themeSnapshotFrame = window.requestAnimationFrame(() => {
    themeSnapshotFrame = 0
    commitThemeSnapshot()
  })
}

function handleBackwardSync(detail) {
  if (!detail) return
  dispatchLatexBackwardSync(window, detail)
}

function handleForwardSyncHandled(detail) {
  if (props.kind !== 'latex') return
  const requestId = Number(detail?.id || 0)
  if (!Number.isInteger(requestId) || requestId < 1) return
  latexStore.clearForwardSync(props.sourcePath, requestId)
}

function handleWorkspaceThemeUpdated() {
  void scheduleThemeSnapshot()
}

onMounted(() => {
  window.addEventListener('workspace-theme-updated', handleWorkspaceThemeUpdated)
  void scheduleThemeSnapshot()
})

onUnmounted(() => {
  window.removeEventListener('workspace-theme-updated', handleWorkspaceThemeUpdated)
  if (themeSnapshotFrame) {
    window.cancelAnimationFrame(themeSnapshotFrame)
    themeSnapshotFrame = 0
  }
})
</script>

<style scoped>
.pdf-artifact-preview-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
