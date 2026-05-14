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
      @motion-state-change="handleDocumentDockMotionStateChange"
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
        :document-dock-resizing="documentDockLayoutLocked"
        :document-dock-motion-active="documentDockMotionActive"
        :problems-reveal-path="documentProblemsRevealPath"
        :problems-reveal-token="documentProblemsRevealToken"
        @close="$emit('inline-dock-close')"
      />
    </InlineDockFrame>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { DOCUMENT_DOCK_PROBLEMS_PAGE } from '../../domains/editor/documentDockPages.js'
import {
  isWorkspaceDocumentPath,
  resolvePaneDockContextPath,
  resolvePaneDocumentTab,
} from '../../domains/editor/paneDocumentDockRuntime.js'
import { ROOT_PANE_ID } from '../../domains/editor/paneTreeLayout.js'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { getDocumentWorkflowKind } from '../../domains/document/documentWorkflowPolicy.js'
import { resolveCachedLatexRootPath } from '../../services/latex/root.js'
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
const workspace = useWorkspaceStore()
const { t } = useI18n()
const containerRef = ref(null)
const lastDocumentTab = ref(null)
const documentDockMotionActive = ref(false)
const documentProblemsRevealPath = ref('')
const documentProblemsRevealToken = ref(0)

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
  return resolvePaneDocumentTab({
    activeTab: editorStore.activeTab,
    lastDocumentTab: lastDocumentTab.value,
    workspacePath: workspace.path,
  })
})
const documentPreviewState = computed(() => {
  if (!documentTab.value) return null
  return workflowStore.getWorkspacePreviewStateForFile(documentTab.value) || null
})
const documentPreviewVisible = computed(() => documentPreviewState.value?.previewVisible === true)
const isDocumentDockOpen = computed(() => props.documentDockOpen || documentPreviewVisible.value)
const documentDockLayoutLocked = computed(() =>
  props.documentDockResizing || documentDockMotionActive.value
)
const dockContextPath = computed(() =>
  resolvePaneDockContextPath({
    documentTab: documentTab.value,
    activeDocumentDockTab: editorStore.activeDocumentDockTab,
    documentDockTabs: editorStore.documentDockTabs,
    workspacePath: workspace.path,
  })
)
watch(
  () => editorStore.activeTab,
  (tab) => {
    if (isWorkspaceDocumentPath(tab, workspace.path)) {
      lastDocumentTab.value = tab
    }
  },
  { flush: 'post', immediate: true }
)
watch(
  () => [workspace.path, editorStore.restoreGeneration],
  () => {
    if (!isWorkspaceDocumentPath(lastDocumentTab.value, workspace.path)) {
      lastDocumentTab.value = null
    }
    if (!isWorkspaceDocumentPath(documentProblemsRevealPath.value, workspace.path)) {
      documentProblemsRevealPath.value = ''
    }
  },
  { flush: 'sync' }
)
watch(
  () => props.documentDockOpen,
  (isOpen, wasOpen) => {
    if (isOpen || wasOpen !== true || documentProblemsRevealToken.value <= 0) return
    documentProblemsRevealPath.value = ''
  }
)

function resolveContainerWidth() {
  return containerRef.value?.getBoundingClientRect?.().width || 0
}

function handleDocumentDockMotionStateChange(isActive) {
  documentDockMotionActive.value = isActive === true
}

function compileEventMatchesActiveDocument(detail = {}) {
  const activePath = String(documentTab.value || '').trim()
  if (!activePath || getDocumentWorkflowKind(activePath) !== 'latex') return false

  const issuePaths = [
    ...(Array.isArray(detail.errors) ? detail.errors : []),
    ...(Array.isArray(detail.warnings) ? detail.warnings : []),
  ].map((problem) => String(problem?.file || problem?.sourcePath || '').trim()).filter(Boolean)
  const eventPaths = [
    detail.texPath,
    detail.sourcePath,
    detail.compileTargetPath,
    ...issuePaths,
  ].map((path) => String(path || '').trim()).filter(Boolean)
  const activeRootPath = String(resolveCachedLatexRootPath(activePath) || '').trim()

  return eventPaths.includes(activePath) ||
    (!!activeRootPath && eventPaths.includes(activeRootPath))
}

async function handleLatexCompileDone(event = {}) {
  const detail = event.detail || {}
  if (!compileEventMatchesActiveDocument(detail)) return

  const hasCompileIssues =
    (Array.isArray(detail.errors) && detail.errors.length > 0) ||
    (Array.isArray(detail.warnings) && detail.warnings.length > 0)
  if (!hasCompileIssues) return

  await nextTick()
  const activePath = String(documentTab.value || '').trim()
  const compileProblems = workflowStore.getProblemsForFile(activePath, { t })
    .filter((problem) => problem.origin === 'compile')
  if (compileProblems.length === 0) return

  documentProblemsRevealPath.value = activePath
  documentProblemsRevealToken.value += 1
  void workspace.openDocumentDock()
  void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PROBLEMS_PAGE)
}

onMounted(() => {
  window.addEventListener('latex-compile-done', handleLatexCompileDone)
})

onUnmounted(() => {
  window.removeEventListener('latex-compile-done', handleLatexCompileDone)
})
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
