<template>
  <div class="typst-native-preview-shell">
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
      @load="handleIframeLoad"
    />
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
import { previewSourcePathFromPath } from '../../utils/fileTypes'
import { resolveCachedTypstRootPath, resolveTypstCompileTarget } from '../../services/typst/root.js'
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
})

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const typstStore = useTypstStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

const iframeRef = ref(null)
const rootPath = ref('')
const previewUrl = ref('')
const loadError = ref('')
const iframeLoaded = ref(false)
let unsubscribeScrollSource = null

const sourcePath = computed(
  () =>
    workflowStore.getSourcePathForPreview(props.filePath) ||
    previewSourcePathFromPath(props.filePath)
)

const preferredSourcePaneId = computed(
  () =>
    editorStore.findPaneWithTab(sourcePath.value)?.id ||
    (workflowStore.session.previewSourcePath === sourcePath.value
      ? workflowStore.session.sourcePaneId
      : null) ||
    null
)

async function resolveRootPath() {
  const source = sourcePath.value
  if (!source) return ''
  const fallbackRootPath =
    typstStore.stateForFile(source)?.projectRootPath ||
    typstStore.stateForFile(source)?.compileTargetPath ||
    resolveCachedTypstRootPath(source) ||
    source

  try {
    const resolved = await resolveTypstCompileTarget(source, {
      filesStore,
      workspacePath: workspace.path,
      contentOverrides: {
        [source]: filesStore.fileContents[source],
      },
    })
    return resolved || fallbackRootPath
  } catch {
    return fallbackRootPath
  }
}

async function ensurePreviewReady() {
  loadError.value = ''
  iframeLoaded.value = false
  previewUrl.value = ''
  const resolvedRoot = await resolveRootPath()
  if (!resolvedRoot) return
  rootPath.value = resolvedRoot

  try {
    const session = await ensureTypstNativePreviewSession({
      rootPath: resolvedRoot,
      workspacePath: workspace.path,
    })
    previewUrl.value = session?.previewUrl || ''
    flushPendingForwardSync()
  } catch (error) {
    loadError.value = error?.message || String(error)
  }
}

async function runForwardSync(detail) {
  try {
    const ok = await requestTypstNativePreviewForwardSync({
      sourcePath: detail.sourcePath,
      rootPath: rootPath.value,
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
  if (!rootPath.value) return
  const detail = peekPendingTypstForwardSync(rootPath.value)
  if (!detail) return
  void runForwardSync(detail)
}

function handleForwardSyncRequest(event) {
  const detail = event.detail || {}
  const source = String(detail.sourcePath || '')
  if (!source || !rootPath.value) return
  if (
    source !== sourcePath.value &&
    !sourceBelongsToTypstPreviewRoot(source, rootPath.value, detail.rootPath)
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
  if (!filePath || !rootPath.value) return
  const sourceRootPath = resolveCachedTypstRootPath(filePath) || filePath
  if (!sourceBelongsToTypstPreviewRoot(filePath, rootPath.value, sourceRootPath)) return
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
  void ensurePreviewReady()
})

onUnmounted(() => {
  window.removeEventListener('typst-forward-sync-location', handleForwardSyncRequest)
  unsubscribeScrollSource?.()
  unsubscribeScrollSource = null
})

watch(
  () => sourcePath.value,
  () => {
    void ensurePreviewReady()
  }
)

watch(
  () => workspace.path,
  () => {
    void ensurePreviewReady()
  }
)
</script>

<style scoped>
.typst-native-preview-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
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
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--bg-primary);
}
</style>
