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

    <div
      class="pane-container__dock-resize-slot workbench-inline-dock-resize-slot"
      :class="{ 'is-visible': isDocumentDockOpen, 'is-hidden': !isDocumentDockOpen }"
    >
      <ResizeHandle
        class="pane-container__dock-resize-handle workbench-inline-dock-resize-handle"
        direction="vertical"
        @resize="handleDocumentDockResize"
        @resize-start="handleDocumentDockResizeStart"
        @resize-end="handleDocumentDockResizeEnd"
        @dblclick="handleDocumentDockResizeSnap"
      />
    </div>

    <aside
      class="pane-container__document-dock workbench-inline-dock-region"
      :class="{
        'is-open': isDocumentDockOpen,
        'is-collapsed': !isDocumentDockOpen,
        'is-resizing': documentDockResizing,
      }"
      :aria-hidden="isDocumentDockOpen ? 'false' : 'true'"
      :style="{ width: isDocumentDockOpen ? `${documentDockWidth}px` : '0px' }"
    >
      <DocumentDock
        v-if="shouldRenderDocumentDock && dockContextPath"
        :file-path="dockContextPath"
        :pane-id="renderNode.id"
        :preview-state="documentPreviewState"
        :document-dock-resizing="documentDockResizing"
        @close="$emit('document-dock-close')"
      />
    </aside>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ROOT_PANE_ID } from '../../domains/editor/paneTreeLayout.js'
import { useDelayedRender } from '../../composables/useDelayedRender.js'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { isNewTab, isPreviewPath } from '../../utils/fileTypes'
import ResizeHandle from '../layout/ResizeHandle.vue'
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

const emit = defineEmits([
  'cursor-change',
  'editor-stats',
  'selection-change',
  'document-dock-resize',
  'document-dock-resize-start',
  'document-dock-resize-end',
  'document-dock-resize-snap',
  'document-dock-close',
])
const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()
const containerRef = ref(null)
const lastDocumentTab = ref(null)
const dockResizeStartWidth = ref(null)

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
const shouldRenderDocumentDock = useDelayedRender(
  () => isDocumentDockOpen.value && !!dockContextPath.value,
  { delayMs: 280 }
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

function handleDocumentDockResizeStart() {
  dockResizeStartWidth.value = props.documentDockWidth
  emit('document-dock-resize-start')
}

function handleDocumentDockResize(event = {}) {
  const startWidth = dockResizeStartWidth.value ?? props.documentDockWidth
  emit('document-dock-resize', {
    width: startWidth - Number(event.dx || 0),
    containerWidth: containerRef.value?.getBoundingClientRect?.().width || 0,
  })
}

function handleDocumentDockResizeEnd() {
  dockResizeStartWidth.value = null
  emit('document-dock-resize-end')
}

function handleDocumentDockResizeSnap() {
  const containerWidth = containerRef.value?.getBoundingClientRect?.().width || 0
  emit('document-dock-resize-snap', { containerWidth })
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
