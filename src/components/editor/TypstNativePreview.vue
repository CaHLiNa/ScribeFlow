<template>
  <div
    ref="shellRef"
    class="typst-native-preview-shell"
    :class="{ 'is-resize-suspended': previewSuspended }"
  >
    <div v-if="loadError" class="typst-native-preview-state typst-native-preview-state-error">
      <div class="text-center text-sm">
        <div>{{ t('Tinymist preview failed to start.') }}</div>
        <div class="mt-1 text-xs opacity-70">{{ loadError }}</div>
      </div>
    </div>
    <div
      v-else-if="!previewUrl"
      class="typst-native-preview-state typst-native-preview-state-pending"
    >
      <div class="text-center text-sm">
        <div>{{ t('Starting Typst preview…') }}</div>
      </div>
    </div>
    <template v-else>
      <iframe
        v-show="!previewSuspended || !iframeLoaded"
        ref="iframeRef"
        class="typst-native-preview-frame"
        :src="previewUrl"
        @load="handleIframeLoad"
      />
      <div
        v-if="previewSuspended && iframeLoaded"
        class="typst-native-preview-freeze-mask"
        aria-hidden="true"
      ></div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useTypstStore } from '../../stores/typst'
import { useWorkspaceStore } from '../../stores/workspace'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useI18n } from '../../i18n'
import { resolveTypstNativePreviewInput } from '../../domains/document/documentWorkspacePreviewAdapters.js'
import { resolveCachedTypstRootPath } from '../../services/typst/root.js'
import {
  clearPendingTypstForwardSync,
  ensureTypstNativePreviewSession,
  peekPendingTypstForwardSync,
  requestTypstNativePreviewForwardSync,
  sourceBelongsToTypstPreviewRoot,
  subscribeTypstPreviewScrollSource,
} from '../../services/typst/previewSync.js'
import { revealTypstSourceLocation } from '../../services/typst/reveal.js'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  sourcePath: { type: String, default: '' },
  rootPath: { type: String, default: '' },
})

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const typstStore = useTypstStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

const RESIZE_SUSPEND_SETTLE_MS = 140
const TOGGLE_SUSPEND_SETTLE_MS = 320
const RESIZE_SUSPEND_DELTA_PX = 1

const shellRef = ref(null)
const iframeRef = ref(null)
const previewRootPath = ref('')
const previewUrl = ref('')
const loadError = ref('')
const iframeLoaded = ref(false)
const previewSuspended = ref(false)
let unsubscribeScrollSource = null
let resizeObserver = null
let previewResumeTimer = null
let previewUrlRevision = 0
let previewUrlIdentity = ''
let lastObservedShellSize = { width: 0, height: 0 }

const resolvedSourcePath = computed(() => resolvedPreviewInput.value.sourcePath)
const resolvedPreviewInput = ref({ sourcePath: '', rootPath: '' })

const preferredSourcePaneId = computed(
  () =>
    editorStore.findPaneWithTab(resolvedSourcePath.value)?.id ||
    (workflowStore.session.previewSourcePath === resolvedSourcePath.value
      ? workflowStore.session.sourcePaneId
      : null) ||
    null
)

async function resolveRootPath() {
  const resolved = await resolveTypstNativePreviewInput(props.filePath, {
    sourcePath: props.sourcePath,
    rootPath: props.rootPath,
    workflowStore,
    typstStore,
    filesStore,
    workspacePath: workspace.path,
    resolveCachedTypstRootPathImpl: resolveCachedTypstRootPath,
  })
  resolvedPreviewInput.value = resolved
  return resolved.rootPath || ''
}

function buildPreviewFrameUrl(baseUrl, rootPath, revision = 0) {
  const normalizedBaseUrl = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
  if (!normalizedBaseUrl) return ''
  const params = new URLSearchParams()
  if (rootPath) {
    params.set('root', rootPath)
  }
  params.set('host', 'altals')
  params.set('rev', String(revision))
  return `${normalizedBaseUrl}/?${params.toString()}`
}

function clearPreviewResumeTimer() {
  if (previewResumeTimer !== null) {
    window.clearTimeout(previewResumeTimer)
    previewResumeTimer = null
  }
}

function schedulePreviewResume(delay = RESIZE_SUSPEND_SETTLE_MS) {
  clearPreviewResumeTimer()
  previewResumeTimer = window.setTimeout(() => {
    previewResumeTimer = null
    previewSuspended.value = false
  }, delay)
}

function suspendPreviewForResize(delay = RESIZE_SUSPEND_SETTLE_MS) {
  if (!previewUrl.value || !iframeLoaded.value) return
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

async function ensurePreviewReady() {
  loadError.value = ''
  const resolvedRoot = await resolveRootPath()
  if (!resolvedRoot) {
    previewRootPath.value = ''
    previewUrl.value = ''
    previewUrlIdentity = ''
    iframeLoaded.value = false
    resetShellResizeTracking()
    return
  }
  previewRootPath.value = resolvedRoot

  try {
    const session = await ensureTypstNativePreviewSession({
      rootPath: resolvedRoot,
      workspacePath: workspace.path,
    })
    const nextBaseUrl = String(session?.previewUrl || '').trim()
    const nextIdentity = nextBaseUrl ? `${nextBaseUrl}::${resolvedRoot}` : ''
    if (!nextIdentity) {
      previewUrl.value = ''
      previewUrlIdentity = ''
      iframeLoaded.value = false
      resetShellResizeTracking()
      return
    }

    if (nextIdentity !== previewUrlIdentity || !previewUrl.value) {
      previewUrlIdentity = nextIdentity
      previewUrlRevision += 1
      iframeLoaded.value = false
      previewUrl.value = buildPreviewFrameUrl(nextBaseUrl, resolvedRoot, previewUrlRevision)
      resetShellResizeTracking()
    }
    flushPendingForwardSync()
  } catch (error) {
    loadError.value = error?.message || String(error)
  }
}

async function runForwardSync(detail) {
  try {
    const ok = await requestTypstNativePreviewForwardSync({
      sourcePath: detail.sourcePath,
      rootPath: previewRootPath.value,
      workspacePath: workspace.path,
      line: detail.line,
      character: detail.character,
    })
    if (ok && iframeLoaded.value) {
      clearPendingTypstForwardSync(detail)
    }
  } catch {
    // Keep pending request so iframe load or next reveal can retry it.
  }
}

function flushPendingForwardSync() {
  if (!previewRootPath.value) return
  const detail = peekPendingTypstForwardSync(previewRootPath.value)
  if (!detail) return
  void runForwardSync(detail)
}

function handleForwardSyncRequest(event) {
  const detail = event.detail || {}
  const source = String(detail.sourcePath || '')
  if (!source || !previewRootPath.value) return
  if (
    source !== resolvedSourcePath.value &&
    !sourceBelongsToTypstPreviewRoot(source, previewRootPath.value, detail.rootPath)
  )
    return
  if (!Number.isInteger(detail.line) || !Number.isInteger(detail.character)) return
  void runForwardSync(detail)
}

function handleIframeLoad() {
  iframeLoaded.value = true
  flushPendingForwardSync()
}

async function handleScrollSource(location) {
  const filePath = String(location?.filePath || '')
  if (!filePath || !previewRootPath.value) return
  const sourceRootPath = resolveCachedTypstRootPath(filePath) || filePath
  if (!sourceBelongsToTypstPreviewRoot(filePath, previewRootPath.value, sourceRootPath)) return
  await revealTypstSourceLocation(editorStore, location, {
    center: true,
    paneId: preferredSourcePaneId.value,
  })
}

onMounted(() => {
  window.addEventListener('typst-forward-sync-location', handleForwardSyncRequest)
  unsubscribeScrollSource = subscribeTypstPreviewScrollSource((location) => {
    void handleScrollSource(location)
  })
  observeShellResize()
  void ensurePreviewReady()
})

onUnmounted(() => {
  window.removeEventListener('typst-forward-sync-location', handleForwardSyncRequest)
  unsubscribeScrollSource?.()
  unsubscribeScrollSource = null
  resizeObserver?.disconnect()
  resizeObserver = null
  clearPreviewResumeTimer()
})

watch(
  [() => props.filePath, () => props.sourcePath, () => props.rootPath, () => workspace.path],
  () => {
    void ensurePreviewReady()
  }
)

watch(
  [() => workspace.leftSidebarOpen, () => workspace.rightSidebarOpen],
  ([nextLeftOpen, nextRightOpen], [prevLeftOpen, prevRightOpen]) => {
    if (nextLeftOpen === prevLeftOpen && nextRightOpen === prevRightOpen) return
    suspendPreviewForResize(TOGGLE_SUSPEND_SETTLE_MS)
  }
)
</script>

<style scoped>
.typst-native-preview-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: inherit;
  contain: strict;
  isolation: isolate;
}

.typst-native-preview-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.typst-native-preview-state-error {
  color: var(--error);
}

.typst-native-preview-state-pending {
  color: var(--text-muted);
}

.typst-native-preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: inherit;
}

.typst-native-preview-freeze-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--shell-preview-surface) 94%, transparent) 0%,
    var(--shell-preview-surface) 100%
  );
}
</style>
