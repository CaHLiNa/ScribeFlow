<template>
  <section class="document-dock-file-surface" :aria-label="fileLabel">
    <EditorTextWorkspaceSurface
      v-if="viewerType === 'text'"
      :key="`dock-text:${filePath}:${editorStore.restoreGeneration}`"
      :file-path="filePath"
      :pane-id="dockPaneId"
      read-only
    />
    <PdfArtifactPreview
      v-else-if="viewerType === 'pdf'"
      :key="`dock-pdf:${filePath}:${editorStore.restoreGeneration}`"
      :pane-id="dockPaneId"
      :artifact-path="filePath"
      :source-path="filePath"
      kind="pdf"
      compact-toolbar
      :defer-compact-resize-fit="documentDockResizing"
      :defer-surface-mount="documentDockMotionActive"
      @open-external="openFileExternal"
    />
    <CsvPreviewPane
      v-else-if="viewerType === 'csv'"
      :key="`dock-csv:${filePath}:${editorStore.restoreGeneration}`"
      :file-path="filePath"
    />
    <HtmlPreviewPane
      v-else-if="viewerType === 'html'"
      :key="`dock-html:${filePath}:${editorStore.restoreGeneration}`"
      :file-path="filePath"
    />
    <ImagePreviewPane
      v-else-if="viewerType === 'image'"
      :key="`dock-image:${filePath}:${editorStore.restoreGeneration}`"
      :file-path="filePath"
    />
    <UnsupportedFilePane
      v-else-if="viewerType === 'unsupported-binary'"
      :key="`dock-unsupported:${filePath}:${editorStore.restoreGeneration}`"
      :file-path="filePath"
    />
    <div v-else class="document-dock-file-surface__empty">
      {{ t('No document') }}
    </div>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, toRef } from 'vue'
import { useEditorStore } from '../../stores/editor.js'
import { useI18n } from '../../i18n'
import { useViewerType, useBasename } from '../../composables/useFileMetadata.js'
import { openLocalPath } from '../../services/localFileOpen.js'

const EditorTextWorkspaceSurface = defineAsyncComponent(
  () => import('../editor/EditorTextWorkspaceSurface.vue')
)
const PdfArtifactPreview = defineAsyncComponent(() => import('../editor/PdfArtifactPreview.vue'))
const CsvPreviewPane = defineAsyncComponent(() => import('../editor/CsvPreviewPane.vue'))
const HtmlPreviewPane = defineAsyncComponent(() => import('../editor/HtmlPreviewPane.vue'))
const ImagePreviewPane = defineAsyncComponent(() => import('../editor/ImagePreviewPane.vue'))
const UnsupportedFilePane = defineAsyncComponent(() => import('../editor/UnsupportedFilePane.vue'))

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  documentDockResizing: { type: Boolean, default: false },
  documentDockMotionActive: { type: Boolean, default: false },
})

const editorStore = useEditorStore()
const { t } = useI18n()

const dockPaneId = computed(() => `${props.paneId}:document-dock`)
const viewerType = useViewerType(toRef(props, 'filePath'))
const fileBasename = useBasename(toRef(props, 'filePath'))
const fileLabel = computed(() => fileBasename.value || props.filePath)

function openFileExternal() {
  if (!props.filePath) return
  void openLocalPath(props.filePath)
}
</script>

<style scoped>
.document-dock-file-surface {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-editor-surface);
}

.document-dock-file-surface__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
