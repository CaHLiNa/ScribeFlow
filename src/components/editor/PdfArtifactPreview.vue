<template>
  <div ref="previewHostRef" class="pdf-artifact-preview-host">
    <PdfIframeSurface
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
      :pdfPageBackgroundFollowsTheme="workspace.pdfPageBackgroundFollowsTheme"
      :pdfCustomPageBackground="workspace.pdfCustomPageBackground"
      :themeTokens="themeTokens"
      @open-external="$emit('open-external')"
      @backward-sync="handleBackwardSync"
      @forward-sync-handled="handleForwardSyncHandled"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useLatexStore } from '../../stores/latex.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { dispatchLatexBackwardSync } from '../../services/latex/pdfPreviewSync.js'
import { normalizeWorkspaceThemeId } from '../../shared/workspaceThemeOptions.js'
import PdfIframeSurface from './PdfIframeSurface.vue'

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
const previewHostRef = ref(null)
const themeTokens = ref(capturePdfPreviewThemeTokens())
const resolvedTheme = ref(resolveThemePreference())

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
  resolvedTheme.value = resolveThemePreference()
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
  void scheduleThemeSnapshot()
}

watch(
  () => [props.artifactPath, documentVersion.value],
  () => {
    void ensureLatexSynctexState()
  },
  { immediate: true }
)

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
