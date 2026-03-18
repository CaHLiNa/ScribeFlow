<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div class="flex-1 overflow-hidden">
      <PdfViewer
        v-if="hasPdf"
        ref="pdfViewerRef"
        :key="pdfReloadKey"
        :filePath="pdfPath"
        :paneId="paneId"
        :toolbar-target-selector="toolbarTargetSelector"
        @dblclick-page="handleBackwardSync"
      />
      <div v-else class="flex items-center justify-center h-full" style="color: var(--fg-muted);">
        <div class="text-center text-sm">
          <div v-if="compileStatus === 'compiling'">
            {{ t('Compiling…') }}
          </div>
          <div v-else-if="compileStatus === 'error'">
            <div>{{ t('Compilation failed — see Terminal.') }}</div>
            <div class="mt-1 text-xs">{{ t('Diagnostics are shown in Terminal.') }}</div>
          </div>
          <div v-else-if="!typstStore.available && typstStore.lastCompilerCheckAt">
            {{ t('Typst compiler not available yet.') }}
          </div>
          <div v-else>
            {{ t('No PDF yet — click Compile in the .typ tab') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTypstStore } from '../../stores/typst'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useI18n } from '../../i18n'
import { useCompiledPdfPreview } from '../../composables/useCompiledPdfPreview'
import { resolveCachedTypstRootPath } from '../../services/typst/root.js'
import {
  clearPendingTypstForwardSync,
  requestTypstPreviewBackwardSync,
  requestTypstPreviewForwardSync,
  sourceBelongsToTypstPreviewRoot,
  takePendingTypstForwardSync,
} from '../../services/typst/previewSync.js'
import { revealTypstSourceLocation } from '../../services/typst/reveal.js'
import PdfViewer from './PdfViewer.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const typstStore = useTypstStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

const pdfViewerRef = ref(null)
const typPath = computed(() => (
  workflowStore.getSourcePathForPreview(props.filePath)
  || props.filePath.replace(/\.pdf$/i, '.typ')
))
const rootPath = computed(() => resolveCachedTypstRootPath(typPath.value) || typPath.value)
const state = computed(() => typstStore.stateForFile(typPath.value) || typstStore.stateForFile(rootPath.value))
const compileStatus = computed(() => state.value?.status || null)
const pdfPath = computed(() => state.value?.pdfPath || props.filePath)
const { hasPdf, pdfReloadKey } = useCompiledPdfPreview({
  pdfPathRef: pdfPath,
  reloadEventName: 'typst-compile-done',
  matchesReloadEvent: (event) => {
    const eventPath = event.detail?.typPath
    return eventPath === typPath.value || eventPath === rootPath.value
  },
})

let forwardSyncInFlight = 0
let backwardSyncInFlight = 0

function handleForwardSyncRequest(event) {
  const detail = event.detail || {}
  const sourcePath = String(detail.sourcePath || '')
  if (!sourcePath || !hasPdf.value) return
  if (!sourceBelongsToTypstPreviewRoot(sourcePath, rootPath.value)) return
  if (!Number.isInteger(detail.line) || !Number.isInteger(detail.character)) return
  clearPendingTypstForwardSync(detail)
  void runForwardSync(detail)
}

async function runForwardSync(detail) {
  const requestId = ++forwardSyncInFlight
  try {
    const result = await requestTypstPreviewForwardSync({
      sourcePath: detail.sourcePath,
      rootPath: rootPath.value,
      workspacePath: workspace.path,
      line: detail.line,
      character: detail.character,
      currentPage: pdfViewerRef.value?.getCurrentPageNumber?.() || 1,
    })
    if (requestId !== forwardSyncInFlight) return
    if (result?.page) {
      pdfViewerRef.value?.scrollToLocation?.(result.page, result.x, result.y)
    }
  } catch {
    // Ignore preview sync failures and keep the PDF viewer interactive.
  }
}

async function handleBackwardSync({ page, x, y }) {
  const requestId = ++backwardSyncInFlight
  try {
    const location = await requestTypstPreviewBackwardSync({
      rootPath: rootPath.value,
      workspacePath: workspace.path,
      page,
      x,
      y,
    })
    if (requestId !== backwardSyncInFlight || !location) return
    await revealTypstSourceLocation(editorStore, location, { center: true })
  } catch {
    // Ignore reverse sync failures and leave the PDF viewer untouched.
  }
}

function flushPendingForwardSync() {
  if (!hasPdf.value) return
  const detail = takePendingTypstForwardSync(rootPath.value)
  if (!detail) return
  void runForwardSync(detail)
}

onMounted(() => {
  typstStore.checkCompiler()
  window.addEventListener('typst-forward-sync-location', handleForwardSyncRequest)
  flushPendingForwardSync()
})

onUnmounted(() => {
  window.removeEventListener('typst-forward-sync-location', handleForwardSyncRequest)
})

watch([hasPdf, rootPath], () => {
  flushPendingForwardSync()
})
</script>
