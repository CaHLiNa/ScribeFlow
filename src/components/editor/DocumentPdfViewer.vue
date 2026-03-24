<template>
  <LatexPdfViewer
    v-if="pdfSourceReady && pdfSourceKind === 'latex'"
    :filePath="filePath"
    :paneId="paneId"
    :toolbar-target-selector="toolbarTargetSelector"
  />
  <TypstPdfViewer
    v-else-if="pdfSourceReady && canUseTypstWorkflowPdfViewer"
    :filePath="filePath"
    :paneId="paneId"
    :toolbar-target-selector="toolbarTargetSelector"
  />
  <div
    v-else-if="!pdfSourceReady"
    class="absolute inset-0 flex items-center justify-center text-sm"
    style="color: var(--fg-muted); background: var(--bg-primary);"
  >
    {{ t('Detecting PDF source...') }}
  </div>
  <PdfViewer
    v-else
    :filePath="filePath"
    :paneId="paneId"
    :toolbar-target-selector="toolbarTargetSelector"
  />
</template>

<script setup>
import { computed, watch } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useI18n } from '../../i18n'
import { isLatex, isTypst } from '../../utils/fileTypes'
import PdfViewer from './PdfViewer.vue'
import LatexPdfViewer from './LatexPdfViewer.vue'
import TypstPdfViewer from './TypstPdfViewer.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const filesStore = useFilesStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

const previewBinding = computed(() => workflowStore.getPreviewBinding(props.filePath))
const previewSourcePath = computed(() => workflowStore.getSourcePathForPreview(props.filePath) || '')
const pdfSourceState = computed(() => filesStore.getPdfSourceState(props.filePath))
const boundSourceKind = computed(() => {
  if (isLatex(previewSourcePath.value)) return 'latex'
  if (isTypst(previewSourcePath.value)) return 'typst'
  return null
})
const canUseTypstWorkflowPdfViewer = computed(() => (
  previewBinding.value?.previewKind === 'pdf'
  && (isTypst(previewBinding.value?.sourcePath || '') || boundSourceKind.value === 'typst')
))
const pdfSourceReady = computed(() => !!boundSourceKind.value || pdfSourceState.value?.status === 'ready')
const pdfSourceKind = computed(() => boundSourceKind.value || pdfSourceState.value?.kind || 'plain')

async function ensurePdfSourceKind(force = false) {
  if (!props.filePath?.toLowerCase().endsWith('.pdf')) return
  if (boundSourceKind.value && !force) return
  try {
    await filesStore.ensurePdfSourceKind(props.filePath, { force })
  } catch (error) {
    console.warn('[document-pdf-viewer] failed to resolve PDF source kind:', error)
  }
}

watch(
  () => props.filePath,
  (filePath) => {
    if (!filePath) return
    void ensurePdfSourceKind(false)
  },
  { immediate: true },
)
</script>
