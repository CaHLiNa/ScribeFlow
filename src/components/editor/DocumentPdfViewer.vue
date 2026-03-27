<template>
  <LatexPdfViewer
    v-if="pdfSourceReady && pdfSourceKind === 'latex'"
    :filePath="viewerFilePath"
    :paneId="paneId"
    :toolbar-target-selector="toolbarTargetSelector"
  />
  <TypstPdfViewer
    v-else-if="pdfSourceReady && canUseTypstWorkflowPdfViewer"
    :filePath="viewerFilePath"
    :paneId="paneId"
    :toolbar-target-selector="toolbarTargetSelector"
  />
  <div
    v-else-if="!pdfSourceReady"
    class="document-pdf-viewer-state absolute inset-0 flex items-center justify-center text-sm"
  >
    {{ t('Detecting PDF source...') }}
  </div>
  <PdfViewer
    v-else
    :filePath="viewerFilePath"
    :paneId="paneId"
    :toolbar-target-selector="toolbarTargetSelector"
  />
</template>

<script setup>
import { computed, watch } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useI18n } from '../../i18n'
import { resolveDocumentPdfPreviewInput } from '../../domains/document/documentWorkspacePreviewAdapters.js'
import PdfViewer from './PdfViewer.vue'
import LatexPdfViewer from './LatexPdfViewer.vue'
import TypstPdfViewer from './TypstPdfViewer.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
  workflowSourcePath: { type: String, default: '' },
  workflowPreviewKind: { type: String, default: '' },
  sourcePath: { type: String, default: '' },
  previewTargetPath: { type: String, default: '' },
  resolvedTargetPath: { type: String, default: '' },
})

const filesStore = useFilesStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

const previewInput = computed(() => resolveDocumentPdfPreviewInput(props.filePath, {
  sourcePath: props.sourcePath || props.workflowSourcePath,
  previewTargetPath: props.previewTargetPath,
  resolvedTargetPath: props.resolvedTargetPath,
  workflowStore,
  filesStore,
}))
const pdfSourceReady = computed(
  () => previewInput.value.resolutionState === 'ready' || previewInput.value.resolutionState === 'resolved-from-source'
)
const pdfSourceKind = computed(() => previewInput.value.resolvedKind)
const viewerFilePath = computed(
  () => previewInput.value.sourcePath || previewInput.value.artifactPath || props.filePath
)
const canUseTypstWorkflowPdfViewer = computed(() => pdfSourceKind.value === 'typst')
const needsPdfSourceDetection = computed(
  () => !previewInput.value.sourceKind && !!previewInput.value.artifactPath
)

async function ensurePdfSourceKind(force = false) {
  if (!needsPdfSourceDetection.value) return
  if (pdfSourceReady.value && !force) return
  try {
    await filesStore.ensurePdfSourceKind(previewInput.value.artifactPath, { force })
  } catch (error) {
    console.warn('[document-pdf-viewer] failed to resolve PDF source kind:', error)
  }
}

watch(
  () => [props.filePath, props.sourcePath, props.previewTargetPath, props.resolvedTargetPath],
  ([filePath]) => {
    if (!filePath) return
    void ensurePdfSourceKind(false)
  },
  { immediate: true }
)
</script>

<style scoped>
.document-pdf-viewer-state {
  color: var(--text-muted);
  background: var(--bg-primary);
}
</style>
