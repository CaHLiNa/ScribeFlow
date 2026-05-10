<template>
  <section class="document-preview-dock" :aria-label="previewLabel">
    <div class="document-preview-dock__body">
      <MarkdownPreview
        v-if="previewMode === 'markdown'"
        :key="`right-dock-markdown:${filePath}`"
        :filePath="filePath"
        :paneId="paneId"
      />
      <PdfArtifactPreview
        v-else-if="previewMode === 'pdf-artifact'"
        :key="`right-dock-pdf:${filePath}:${previewTargetPath}`"
        :paneId="paneId"
        :artifactPath="previewTargetPath"
        :sourcePath="filePath"
        :kind="previewKindLabel"
        :compact-toolbar="compactPdfToolbar"
        :defer-compact-resize-fit="documentDockResizing"
        @open-external="openPreviewTarget"
      />
      <PythonTerminalPreview
        v-else-if="previewMode === 'terminal-output'"
        :key="`right-dock-python:${filePath}`"
        :filePath="filePath"
        :sourcePath="filePath"
      />
      <div v-else class="document-preview-dock__empty">
        {{ t('No preview') }}
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from '../../i18n'
import { getDocumentWorkflowKind } from '../../domains/document/documentWorkflowPolicy.js'
import { openLocalPath } from '../../services/localFileOpen'

const MarkdownPreview = defineAsyncComponent(() => import('../editor/MarkdownPreview.vue'))
const PdfArtifactPreview = defineAsyncComponent(() => import('../editor/PdfArtifactPreview.vue'))
const PythonTerminalPreview = defineAsyncComponent(() => import('../editor/PythonTerminalPreview.vue'))

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  previewState: { type: Object, default: null },
  compactPdfToolbar: { type: Boolean, default: false },
  documentDockResizing: { type: Boolean, default: false },
})

const { t } = useI18n()

const previewMode = computed(() => props.previewState?.previewMode || null)
const previewTargetPath = computed(() => String(props.previewState?.previewTargetPath || ''))
const previewKindLabel = computed(() => {
  return getDocumentWorkflowKind(props.filePath) || 'document'
})
const previewLabel = computed(() => {
  if (previewMode.value === 'pdf-artifact') return t('PDF Preview')
  if (previewMode.value === 'terminal-output') return t('Terminal Output')
  return t('Preview')
})

function openPreviewTarget() {
  if (!previewTargetPath.value) return
  void openLocalPath(previewTargetPath.value)
}
</script>

<style scoped>
.document-preview-dock {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  color: var(--text-primary);
}

.document-preview-dock__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.document-preview-dock__body > :deep(*) {
  min-width: 0;
}

.document-preview-dock__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
