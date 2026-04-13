<template>
  <PdfHostedPreview
    v-if="useHostedPreview"
    :key="hostedPreviewKey"
    :paneId="paneId"
    :sessionId="hostedPreviewSession"
    :sourcePath="sourcePath"
    :artifactPath="artifactPath"
    :kind="kind"
    :workspacePath="workspace.path || ''"
    :compileState="compileState"
    :documentVersion="documentVersion"
    :forwardSyncRequest="forwardSyncRequest"
    :resolvedTheme="resolvedTheme"
    :pdfThemedPages="workspace.pdfThemedPages"
    :themeRevision="themeRevision"
    :themeTokens="themeTokens"
    @backward-sync="handleBackwardSync"
    @forward-sync-handled="handleForwardSyncHandled"
    @unavailable="handleHostedPreviewUnavailable"
  />

  <PdfIframeSurface
    v-else
    :sourcePath="sourcePath"
    :artifactPath="artifactPath"
    :kind="kind"
    :workspacePath="workspace.path || ''"
    :workspaceDataDir="workspace.workspaceDataDir || ''"
    :globalConfigDir="workspace.globalConfigDir || ''"
    :compileState="compileState"
    :documentVersion="documentVersion"
    :forwardSyncRequest="forwardSyncRequest"
    :resolvedTheme="resolvedTheme"
    :pdfThemedPages="workspace.pdfThemedPages"
    :themeRevision="themeRevision"
    :themeTokens="themeTokens"
    @open-external="$emit('open-external')"
    @backward-sync="handleBackwardSync"
    @forward-sync-handled="handleForwardSyncHandled"
  />
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useLatexStore } from '../../stores/latex.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { dispatchLatexBackwardSync } from '../../services/latex/pdfPreviewSync.js'
import {
  capturePdfPreviewThemeTokens,
  isPdfHostedPreviewSupported,
} from '../../services/pdf/pdfPreviewWebview.js'
import { normalizeWorkspaceThemeId } from '../../shared/workspaceThemeOptions.js'
import PdfHostedPreview from './PdfHostedPreview.vue'
import PdfIframeSurface from './PdfIframeSurface.vue'

let nextHostedPreviewSessionId = 1

const props = defineProps({
  paneId: { type: String, default: 'pane-root' },
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, required: true },
})

defineEmits(['open-external'])

const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const themeTokens = ref(capturePdfPreviewThemeTokens())
const resolvedTheme = ref(resolveThemePreference())
const themeRevision = ref(0)
const hostedPreviewSession = ref(nextHostedPreviewSessionId++)
const hostedPreviewRejected = ref(false)
const useHostedPreview = computed(() =>
  isPdfHostedPreviewSupported() && hostedPreviewRejected.value !== true
)
const hostedPreviewKey = computed(() => `${props.paneId}:${hostedPreviewSession.value}`)

const compileState = computed(() => {
  if (props.kind === 'latex') return latexStore.stateForFile(props.sourcePath) || null
  return null
})

const documentVersion = computed(() => compileState.value?.lastCompiled || '')
const forwardSyncRequest = computed(() =>
  props.kind === 'latex' ? latexStore.forwardSyncRequestFor(props.sourcePath) : null
)

function normalizeResolvedThemeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'light'
    ? 'light'
    : 'dark'
}

function resolveThemePreference() {
  if (typeof document !== 'undefined') {
    const datasetResolved = String(document.documentElement.dataset.themeResolved || '')
      .trim()
      .toLowerCase()
    if (datasetResolved === 'light' || datasetResolved === 'dark') {
      return datasetResolved
    }
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

function refreshThemeTokens() {
  themeTokens.value = capturePdfPreviewThemeTokens()
}

let themeSnapshotFrame = 0
let pendingThemeReload = false

function commitThemeSnapshot(options = {}) {
  refreshThemeTokens()
  if (options.forceReload === true) {
    themeRevision.value += 1
    hostedPreviewSession.value = nextHostedPreviewSessionId++
  }
}

function scheduleThemeSnapshot(options = {}) {
  pendingThemeReload ||= options.forceReload === true
  if (typeof window === 'undefined') {
    const shouldForceReload = pendingThemeReload
    pendingThemeReload = false
    commitThemeSnapshot({ forceReload: shouldForceReload })
    return
  }
  if (themeSnapshotFrame) return
  themeSnapshotFrame = window.requestAnimationFrame(() => {
    themeSnapshotFrame = 0
    const shouldForceReload = pendingThemeReload
    pendingThemeReload = false
    commitThemeSnapshot({ forceReload: shouldForceReload })
  })
}

async function ensureLatexSynctexState() {
  if (props.kind !== 'latex') return
  const pdfPath = String(compileState.value?.pdfPath || props.artifactPath || '').trim()
  if (!pdfPath || String(compileState.value?.synctexPath || '').trim()) return
  await latexStore.registerExistingArtifact?.(props.sourcePath, pdfPath, {
    targetPath: compileState.value?.compileTargetPath || '',
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

function handleWorkspaceThemeUpdated(event) {
  resolvedTheme.value = normalizeResolvedThemeValue(
    event?.detail?.resolvedTheme || resolveThemePreference()
  )
  scheduleThemeSnapshot({ forceReload: true })
}

function handleHostedPreviewUnavailable() {
  hostedPreviewRejected.value = true
}

watch(
  () => [props.artifactPath, documentVersion.value],
  () => {
    void ensureLatexSynctexState()
  },
  { immediate: true }
)

watch(
  () => workspace.pdfThemedPages,
  () => {
    scheduleThemeSnapshot({ forceReload: true })
  }
)

onMounted(() => {
  window.addEventListener('workspace-theme-updated', handleWorkspaceThemeUpdated)
  commitThemeSnapshot()
})

onUnmounted(() => {
  window.removeEventListener('workspace-theme-updated', handleWorkspaceThemeUpdated)
  if (themeSnapshotFrame) {
    window.cancelAnimationFrame(themeSnapshotFrame)
    themeSnapshotFrame = 0
  }
  pendingThemeReload = false
})
</script>
