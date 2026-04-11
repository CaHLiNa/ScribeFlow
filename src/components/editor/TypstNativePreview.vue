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
    <iframe
      v-else
      ref="iframeRef"
      class="typst-native-preview-frame"
      :src="previewUrl"
      v-show="!previewSuspended || !iframeLoaded"
      @load="handleIframeLoad"
    />
    <div
      v-if="previewSuspended && iframeLoaded && previewUrl && !loadError"
      class="typst-native-preview-freeze-mask"
      aria-hidden="true"
    ></div>
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
  createTypstPreviewDocumentUrl,
  isManagedTypstPreviewDocumentUrl,
} from '../../services/typst/previewDocument.js'
import {
  clearPendingTypstForwardSync,
  ensureTypstNativePreviewSession,
  peekPendingTypstForwardSync,
  requestTypstNativePreviewForwardSync,
  sourceBelongsToTypstPreviewRoot,
  subscribeTypstPreviewScrollSource,
} from '../../services/typst/previewSync.js'
import { shouldRepairTypstPreviewFit } from '../../services/typst/previewViewportFit.js'
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

const shellRef = ref(null)
const iframeRef = ref(null)
const previewRootPath = ref('')
const previewUrl = ref('')
const loadError = ref('')
const iframeLoaded = ref(false)
const previewSuspended = ref(false)
let previewLoadToken = 0
let unsubscribeScrollSource = null
let shellResizeObserver = null
let hoverResumeTimer = null
let hoverSuppressed = false
let previewResumeTimer = null
let previewFitRepairTimer = null
let lastObservedShellSize = { width: 0, height: 0 }

const RESIZE_SUSPEND_SETTLE_MS = 140
const TOGGLE_SUSPEND_SETTLE_MS = 320
const RESIZE_SUSPEND_DELTA_PX = 1
const PREVIEW_FIT_REPAIR_SETTLE_MS = 120

const resolvedPreviewInput = ref({ sourcePath: '', rootPath: '' })
const resolvedSourcePath = computed(() => resolvedPreviewInput.value.sourcePath)

const preferredSourcePaneId = computed(
  () =>
    editorStore.findPaneWithTab(resolvedSourcePath.value)?.id ||
    (workflowStore.session.previewSourcePath === resolvedSourcePath.value
      ? workflowStore.session.sourcePaneId
      : null) ||
    null,
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

async function ensurePreviewReady() {
  const loadToken = ++previewLoadToken
  loadError.value = ''
  iframeLoaded.value = false
  resetShellResizeTracking()
  const resolvedRoot = await resolveRootPath()
  if (loadToken !== previewLoadToken) return
  if (!resolvedRoot) {
    previewRootPath.value = ''
    replacePreviewUrl('')
    return
  }
  previewRootPath.value = resolvedRoot

  try {
    const session = await ensureTypstNativePreviewSession({
      rootPath: resolvedRoot,
      workspacePath: workspace.path,
    })
    if (loadToken !== previewLoadToken) return
    const nextPreviewUrl = await resolvePreviewDocumentUrl(session?.previewUrl || '')
    if (loadToken !== previewLoadToken) {
      revokePreviewUrl(nextPreviewUrl)
      return
    }
    if (nextPreviewUrl && nextPreviewUrl !== previewUrl.value) {
      replacePreviewUrl(nextPreviewUrl)
    }
    flushPendingForwardSync()
  } catch (error) {
    if (loadToken !== previewLoadToken) return
    loadError.value = error?.message || String(error)
  }
}

async function resolvePreviewDocumentUrl(sessionPreviewUrl) {
  const rawPreviewUrl = String(sessionPreviewUrl || '')
  if (!rawPreviewUrl) return ''

  try {
    const patchedPreviewUrl = await createTypstPreviewDocumentUrl(rawPreviewUrl)
    return patchedPreviewUrl || rawPreviewUrl
  } catch {
    return rawPreviewUrl
  }
}

function revokePreviewUrl(url) {
  const value = String(url || '')
  if (value.startsWith('blob:') && !isManagedTypstPreviewDocumentUrl(value)) {
    URL.revokeObjectURL(value)
  }
}

function replacePreviewUrl(nextUrl) {
  revokePreviewUrl(previewUrl.value)
  previewUrl.value = String(nextUrl || '')
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
  ) {
    return
  }
  if (!Number.isInteger(detail.line) || !Number.isInteger(detail.character)) return
  void runForwardSync(detail)
}

function handleIframeLoad() {
  iframeLoaded.value = true
  previewSuspended.value = false
  installPreviewInteractionGuards()
  installPreviewFitRepair()
  notifyPreviewResize()
  schedulePreviewFitRepair(220)
  flushPendingForwardSync()
}

function notifyPreviewResize() {
  const frameWindow = iframeRef.value?.contentWindow
  if (!frameWindow) return
  try {
    frameWindow.dispatchEvent(new Event('resize'))
  } catch {
    // Ignore transient iframe initialization races.
  }
}

function getPreviewScrollMetrics() {
  const frameDocument = iframeRef.value?.contentWindow?.document
  if (!frameDocument) return null
  const scrollContainer = frameDocument.getElementById('typst-container-main')
  const previewApp = frameDocument.getElementById('typst-app')
  if (!scrollContainer || !previewApp) return null
  return {
    clientWidth: scrollContainer.clientWidth,
    scrollWidth: scrollContainer.scrollWidth,
    previewWidth: previewApp.getBoundingClientRect().width,
  }
}

function clearPreviewResumeTimer() {
  if (previewResumeTimer != null) {
    window.clearTimeout(previewResumeTimer)
    previewResumeTimer = null
  }
}

function clearPreviewFitRepairTimer() {
  if (previewFitRepairTimer != null) {
    window.clearTimeout(previewFitRepairTimer)
    previewFitRepairTimer = null
  }
}

function repairPreviewFitIfNeeded() {
  if (!iframeLoaded.value || previewSuspended.value) return
  const metrics = getPreviewScrollMetrics()
  if (!metrics || !shouldRepairTypstPreviewFit(metrics)) return
  notifyPreviewResize()
}

function schedulePreviewFitRepair(delayMs = PREVIEW_FIT_REPAIR_SETTLE_MS) {
  clearPreviewFitRepairTimer()
  previewFitRepairTimer = window.setTimeout(() => {
    previewFitRepairTimer = null
    repairPreviewFitIfNeeded()
  }, Math.max(0, Number(delayMs || 0)))
}

function schedulePreviewResume(delayMs = RESIZE_SUSPEND_SETTLE_MS) {
  clearPreviewResumeTimer()
  previewResumeTimer = window.setTimeout(() => {
    previewResumeTimer = null
    previewSuspended.value = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        notifyPreviewResize()
        schedulePreviewFitRepair()
      })
    })
  }, Math.max(0, Number(delayMs || 0)))
}

function suspendPreviewForResize(delayMs = RESIZE_SUSPEND_SETTLE_MS) {
  if (!previewUrl.value || !iframeLoaded.value) return
  previewSuspended.value = true
  schedulePreviewResume(delayMs)
}

function resetShellResizeTracking() {
  clearPreviewResumeTimer()
  clearPreviewFitRepairTimer()
  previewSuspended.value = false
  lastObservedShellSize = { width: 0, height: 0 }
}

function observeShellResize() {
  if (typeof ResizeObserver !== 'function' || shellResizeObserver || !shellRef.value) return
  shellResizeObserver = new ResizeObserver((entries) => {
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
  shellResizeObserver.observe(shellRef.value)
}

function clearShellResizeTracking() {
  if (shellResizeObserver) {
    shellResizeObserver.disconnect()
    shellResizeObserver = null
  }
  resetShellResizeTracking()
}

function installPreviewInteractionGuards() {
  const frameDocument = iframeRef.value?.contentWindow?.document
  if (!frameDocument || frameDocument.__altalsTypstHoverGuardInstalled) return

  const guardHoverEvent = (event) => {
    if (!hoverSuppressed) return
    event.stopImmediatePropagation()
    event.stopPropagation()
  }

  try {
    frameDocument.addEventListener('mousemove', guardHoverEvent, true)
    frameDocument.addEventListener('mouseleave', guardHoverEvent, true)
    frameDocument.__altalsTypstHoverGuardInstalled = true
  } catch {
    // Ignore iframe bootstrap races.
  }
}

function installPreviewFitRepair() {
  const frameDocument = iframeRef.value?.contentWindow?.document
  const scrollContainer = frameDocument?.getElementById('typst-container-main')
  if (!scrollContainer || scrollContainer.__altalsTypstFitRepairInstalled) return

  const handleScroll = () => {
    schedulePreviewFitRepair()
  }

  try {
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    scrollContainer.__altalsTypstFitRepairInstalled = true
  } catch {
    // Ignore iframe bootstrap races.
  }
}

function suppressPreviewHoverTemporarily(durationMs = 320) {
  hoverSuppressed = true
  if (hoverResumeTimer != null) {
    window.clearTimeout(hoverResumeTimer)
    hoverResumeTimer = null
  }
  hoverResumeTimer = window.setTimeout(() => {
    hoverResumeTimer = null
    hoverSuppressed = false
  }, Math.max(0, Number(durationMs || 0)))
}

function clearHoverSuppression() {
  hoverSuppressed = false
  if (hoverResumeTimer != null) {
    window.clearTimeout(hoverResumeTimer)
    hoverResumeTimer = null
  }
}

async function handleScrollSource(location) {
  const filePath = String(location?.filePath || '')
  if (!filePath || !previewRootPath.value) return
  const sourceRootPath = resolveCachedTypstRootPath(filePath) || filePath
  if (!sourceBelongsToTypstPreviewRoot(filePath, previewRootPath.value, sourceRootPath)) return
  await revealTypstSourceLocation(editorStore, location, {
    center: true,
    paneId: preferredSourcePaneId.value,
    suppressPreviewSync: true,
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
  previewLoadToken += 1
  window.removeEventListener('typst-forward-sync-location', handleForwardSyncRequest)
  unsubscribeScrollSource?.()
  unsubscribeScrollSource = null
  clearShellResizeTracking()
  clearHoverSuppression()
  replacePreviewUrl('')
})

watch(
  [() => props.filePath, () => props.sourcePath, () => props.rootPath, () => workspace.path],
  () => {
    void ensurePreviewReady()
  },
)

watch(
  [() => workspace.leftSidebarOpen, () => workspace.rightSidebarOpen],
  ([nextLeftOpen, nextRightOpen], [prevLeftOpen, prevRightOpen]) => {
    if (nextLeftOpen === prevLeftOpen && nextRightOpen === prevRightOpen) return
    if (!iframeLoaded.value) return
    suppressPreviewHoverTemporarily()
    suspendPreviewForResize(TOGGLE_SUSPEND_SETTLE_MS)
  },
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
    color-mix(in srgb, var(--shell-editor-surface) 94%, transparent) 0%,
    var(--shell-editor-surface) 100%
  );
}
</style>
