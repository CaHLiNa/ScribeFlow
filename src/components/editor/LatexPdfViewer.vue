<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- PDF viewer -->
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
      <div v-else class="compiled-pdf-viewer-state flex items-center justify-center h-full">
        <div class="text-center text-sm">
          <div v-if="compileStatus === 'compiling'">
            {{ t('Compiling…') }}
          </div>
          <div v-else-if="compileStatus === 'error'">
            <div>{{ t('Compilation failed — see Terminal.') }}</div>
            <div class="mt-1 text-xs">{{ t('Diagnostics are shown in Terminal.') }}</div>
          </div>
          <div v-else-if="!latexStore.hasAvailableCompiler">
            {{ t('No LaTeX compiler configured. Choose one in Settings > System.') }}
          </div>
          <div v-else>
            {{ t('No PDF yet — click Compile in the .tex tab') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useLatexStore } from '../../stores/latex'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useI18n } from '../../i18n'
import { useCompiledPdfPreview } from '../../composables/useCompiledPdfPreview'
import PdfViewer from './PdfViewer.vue'

const props = defineProps({
  filePath: { type: String, required: true }, // The .pdf path
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const latexStore = useLatexStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

function inferLatexSourcePath(pdfPath) {
  return String(pdfPath || '').replace(/\.pdf$/i, '.tex')
}

function inferSyncTexPath(latexPath) {
  return String(latexPath || '').replace(/\.(tex|latex)$/i, '.synctex.gz')
}

const texPath = computed(
  () =>
    workflowStore.getSourcePathForPreview(props.filePath) || inferLatexSourcePath(props.filePath)
)

const state = computed(() => latexStore.stateForFile(texPath.value))
const synctexPath = computed(() => state.value?.synctexPath || inferSyncTexPath(texPath.value))
const forwardSyncRequest = computed(() => latexStore.forwardSyncRequestFor(texPath.value))
const compileStatus = computed(() => state.value?.status || null)
const pdfPath = computed(() => state.value?.pdfPath || props.filePath)

const pdfViewerRef = ref(null)
let activeForwardSyncRequestId = null

const { hasPdf, pdfReloadKey } = useCompiledPdfPreview({
  pdfPathRef: pdfPath,
  reloadEventName: 'latex-compile-done',
  matchesReloadEvent: (event) => event.detail?.texPath === texPath.value,
  onReload: () => {
    void maybeRunForwardSync()
  },
})

function handleBackwardSync({ page, x, y }) {
  if (!synctexPath.value || !page) return

  invoke('synctex_backward', { synctexPath: synctexPath.value, page, x, y })
    .then((result) => {
      if (result?.line) {
        window.dispatchEvent(
          new CustomEvent('latex-backward-sync', {
            detail: { file: result.file, line: result.line },
          })
        )
      }
    })
    .catch(() => {})
}

async function maybeRunForwardSync() {
  const request = forwardSyncRequest.value
  if (!request?.id || request.texPath !== texPath.value) return
  if (!synctexPath.value || !hasPdf.value) return
  if (!pdfViewerRef.value?.scrollToLocation) return
  if (activeForwardSyncRequestId === request.id) return

  const syncTexExists = await invoke('path_exists', { path: synctexPath.value }).catch(() => false)
  if (!syncTexExists) return

  activeForwardSyncRequestId = request.id
  try {
    const result = await invoke('synctex_forward', {
      synctexPath: synctexPath.value,
      texPath: texPath.value,
      line: request.line,
      column: request.column ?? 0,
    })
    if (forwardSyncRequest.value?.id !== request.id) return
    if (result?.page) {
      pdfViewerRef.value?.scrollToLocation(result.page, result.x, result.y)
    }
    latexStore.clearForwardSync(texPath.value, request.id)
  } catch {
    if (forwardSyncRequest.value?.id === request.id) {
      latexStore.clearForwardSync(texPath.value, request.id)
    }
  } finally {
    if (activeForwardSyncRequestId === request.id) {
      activeForwardSyncRequestId = null
    }
  }
}

onMounted(() => {
  latexStore.checkCompilers()
})

watch(pdfViewerRef, () => {
  void maybeRunForwardSync()
})

watch(
  () => [forwardSyncRequest.value?.id, synctexPath.value, hasPdf.value],
  () => {
    void maybeRunForwardSync()
  },
  { immediate: true }
)
</script>

<style scoped>
.compiled-pdf-viewer-state {
  color: var(--text-muted);
}
</style>
