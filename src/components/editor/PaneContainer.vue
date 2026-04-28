<template>
  <section
    ref="containerRef"
    class="pane-container"
    :class="{
      'has-document-dock': isDocumentDockOpen,
      'is-document-dock-resizing': documentDockResizing,
    }"
  >
    <div class="pane-container__editor">
      <EditorPane
        :key="`pane:${renderNode.id}:${editorStore.restoreGeneration}`"
        :paneId="renderNode.id"
        :tabs="renderNode.tabs"
        :activeTab="renderNode.activeTab"
        :topbarTabsTargetSelector="topbarTabsTargetSelector"
        :topbarWorkflowTargetSelector="topbarWorkflowTargetSelector"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
      />
    </div>

    <InlineDockFrame
      :aria-label="t('Document sidebar')"
      :open="isDocumentDockOpen"
      :render-active="!!dockContextPath"
      :width="documentDockWidth"
      :resizing="documentDockResizing"
      region-class="pane-container__document-dock"
      resize-slot-class="pane-container__dock-resize-slot"
      resize-handle-class="pane-container__dock-resize-handle"
      :get-container-width="resolveContainerWidth"
      @resize="(event) => $emit('inline-dock-resize', event)"
      @resize-start="$emit('inline-dock-resize-start')"
      @resize-end="$emit('inline-dock-resize-end')"
      @resize-snap="(event) => $emit('inline-dock-resize-snap', event)"
    >
      <DocumentDock
        v-if="dockContextPath"
        :file-path="dockContextPath"
        :pane-id="renderNode.id"
        :preview-state="documentPreviewState"
        :document-dock-resizing="documentDockResizing"
        @close="$emit('inline-dock-close')"
      />
    </InlineDockFrame>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ROOT_PANE_ID } from '../../domains/editor/paneTreeLayout.js'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { isNewTab, isPreviewPath } from '../../utils/fileTypes'
import { useI18n } from '../../i18n'
import InlineDockFrame from '../layout/InlineDockFrame.vue'
import EditorPane from './EditorPane.vue'

const DocumentDock = defineAsyncComponent(() => import('../sidebar/DocumentDock.vue'))

const props = defineProps({
  node: { type: Object, required: true },
  topbarTabsTargetSelector: { type: String, default: '' },
  topbarWorkflowTargetSelector: { type: String, default: '' },
  documentDockOpen: { type: Boolean, default: false },
  documentDockWidth: { type: Number, default: 360 },
  documentDockResizing: { type: Boolean, default: false },
})

defineEmits([
  'cursor-change',
  'editor-stats',
  'selection-change',
  'inline-dock-resize',
  'inline-dock-resize-start',
  'inline-dock-resize-end',
  'inline-dock-resize-snap',
  'inline-dock-close',
])
const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()
const containerRef = ref(null)
const lastDocumentTab = ref(null)

const renderNode = computed(() => {
  if (props.node?.type === 'leaf') return props.node
  return editorStore.findFirstLeaf(props.node) || {
    type: 'leaf',
    id: ROOT_PANE_ID,
    tabs: [],
    activeTab: null,
  }
})
const documentTab = computed(() => {
  const active = editorStore.activeTab
  if (active && !isNewTab(active) && !isPreviewPath(active)) {
    return active
  }
  return lastDocumentTab.value
})
const documentPreviewState = computed(() => {
  if (!documentTab.value) return null
  return workflowStore.getWorkspacePreviewStateForFile(documentTab.value) || null
})
const documentPreviewVisible = computed(() => documentPreviewState.value?.previewVisible === true)
const isDocumentDockOpen = computed(() => props.documentDockOpen || documentPreviewVisible.value)
const dockContextPath = computed(
  () =>
    documentTab.value ||
    editorStore.activeDocumentDockTab ||
    editorStore.documentDockTabs?.[0] ||
    ''
)
watch(
  () => editorStore.activeTab,
  (tab) => {
    if (tab && !isNewTab(tab) && !isPreviewPath(tab)) {
      lastDocumentTab.value = tab
    }
  },
  { flush: 'post', immediate: true }
)

function resolveContainerWidth() {
  return containerRef.value?.getBoundingClientRect?.().width || 0
}
</script>

<style scoped>
.pane-container {
  display: flex;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-editor-surface);
}

.pane-container__editor {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

</style>
