<template>
  <section class="document-dock inline-dock" :aria-label="t('Document sidebar')">
    <InlineDockTabBar
      v-if="hasDockTabs"
      :active-key="activeDockKey"
      :aria-label="t('Document sidebar')"
      :pages="dockPages"
      tabbar-class="document-dock__tabbar"
      tabs-class="document-dock__tabs"
      @activate="activateDockPage"
      @close="closeDockPage"
    />

    <div class="document-dock__body inline-dock__body" :class="{ 'is-immersive': usesImmersivePreview }">
      <component
        :is="activeDockPage?.component"
        v-if="activeDockPage?.component"
        v-bind="activeDockPage?.componentProps || {}"
      />
      <div v-else class="document-dock__empty inline-dock__empty">
        {{ t('No preview') }}
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import {
  DOCUMENT_DOCK_FILE_PAGE,
  DOCUMENT_DOCK_PROBLEMS_PAGE,
  DOCUMENT_DOCK_PREVIEW_PAGE,
  documentDockFileKey,
} from '../../domains/editor/documentDockPages.js'
import { findInlineDockPage } from '../../domains/workbench/inlineDockPageRegistry.js'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { basenamePath } from '../../utils/path'
import InlineDockTabBar from '../layout/InlineDockTabBar.vue'
import { documentDockPageRegistry } from './documentDockPageRegistry.js'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  previewState: { type: Object, default: null },
  documentDockResizing: { type: Boolean, default: false },
})

const workflowStore = useDocumentWorkflowStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const hasPreview = computed(() => props.previewState?.previewVisible === true)
const comparisonTabs = computed(() => editorStore.documentDockTabs || [])
const documentProblems = computed(() => workflowStore.getProblemsForFile(props.filePath, { t }))
const previewMode = computed(() => props.previewState?.previewMode || null)
const documentLabel = computed(() => basenamePath(props.filePath) || props.filePath)
const dockPages = computed(() =>
  documentDockPageRegistry.resolvePages({
    allowedPageIds: workspace.documentDockPageIds,
    comparisonTabs: comparisonTabs.value,
    documentDockResizing: props.documentDockResizing,
    documentLabel: documentLabel.value,
    filePath: props.filePath,
    hasPreview: hasPreview.value,
    pageDefinitions: workspace.documentDockPageDefinitions,
    paneId: props.paneId,
    problemCount: documentProblems.value.length,
    previewMode: previewMode.value,
    previewState: props.previewState,
    t,
  })
)
const hasDockTabs = computed(() => dockPages.value.length > 0)
const activeDockKey = computed(() => {
  const activePage = String(workspace.documentDockActivePage || DOCUMENT_DOCK_PREVIEW_PAGE)

  if (activePage === DOCUMENT_DOCK_PREVIEW_PAGE && hasPreview.value) {
    return DOCUMENT_DOCK_PREVIEW_PAGE
  }

  if (activePage === DOCUMENT_DOCK_PROBLEMS_PAGE) {
    return DOCUMENT_DOCK_PROBLEMS_PAGE
  }

  if (
    activePage === DOCUMENT_DOCK_FILE_PAGE &&
    editorStore.activeDocumentDockTab &&
    comparisonTabs.value.includes(editorStore.activeDocumentDockTab)
  ) {
    return documentDockFileKey(editorStore.activeDocumentDockTab)
  }

  if (hasPreview.value) return DOCUMENT_DOCK_PREVIEW_PAGE
  return comparisonTabs.value.length > 0
    ? documentDockFileKey(comparisonTabs.value[0])
    : DOCUMENT_DOCK_PROBLEMS_PAGE
})
const activeDockPage = computed(() => findInlineDockPage(dockPages.value, activeDockKey.value))
const usesImmersivePreview = computed(() => activeDockPage.value?.immersive === true)

function activateDockPage(page = {}) {
  if (page.type === DOCUMENT_DOCK_PREVIEW_PAGE) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PREVIEW_PAGE)
    return
  }

  if (page.type === DOCUMENT_DOCK_FILE_PAGE && page.path) {
    editorStore.setActiveDocumentDockFile(page.path)
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_FILE_PAGE)
    return
  }

  if (page.type === DOCUMENT_DOCK_PROBLEMS_PAGE) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PROBLEMS_PAGE)
  }
}

function closePreview() {
  void workflowStore.hideWorkspacePreviewForFile(props.filePath)
  if (comparisonTabs.value.length > 0) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_FILE_PAGE)
    return
  }
  void workspace.openDocumentDock()
  void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PROBLEMS_PAGE)
}

function closeFilePage(page = {}) {
  const path = page.path
  if (!path) return

  const isActivePage = activeDockKey.value === page.key
  const onlyComparisonTab = comparisonTabs.value.length === 1 && comparisonTabs.value[0] === path
  editorStore.closeDocumentDockFile(path)

  if (!hasPreview.value && onlyComparisonTab) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PROBLEMS_PAGE)
    return
  }

  if (!isActivePage) return
  if (comparisonTabs.value.length > 1) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_FILE_PAGE)
    return
  }
  if (hasPreview.value) {
    void workspace.setDocumentDockActivePage(DOCUMENT_DOCK_PREVIEW_PAGE)
  }
}

function closeDockPage(page = {}) {
  if (page.type === DOCUMENT_DOCK_PREVIEW_PAGE) {
    closePreview()
    return
  }
  if (page.type === DOCUMENT_DOCK_FILE_PAGE) {
    closeFilePage(page)
  }
}

</script>

<style scoped>
.document-dock {
  flex: 0 0 auto;
  width: 100%;
}

:deep(.document-dock__preview-tab--icon) {
  flex: 0 0 30px;
  justify-content: center;
  width: 30px;
  min-width: 30px;
  max-width: 30px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}

:deep(.document-dock__preview-tab--icon .document-dock__preview-label) {
  flex: 0 0 auto;
  justify-content: center;
  gap: 0;
}

:deep(.document-dock__preview-tab--icon .document-dock__preview-icon) {
  opacity: 1;
  transform: none;
}

:deep(.document-dock__preview-tab--icon:hover .document-dock__preview-icon),
:deep(.document-dock__preview-tab--icon:focus-within .document-dock__preview-icon) {
  opacity: 1;
  transform: none;
}

:deep(.document-dock__preview-tab--icon .document-dock__tab-close) {
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%) scale(0.94);
}

:deep(.document-dock__preview-tab--icon:hover .document-dock__tab-close),
:deep(.document-dock__preview-tab--icon:focus-within .document-dock__tab-close) {
  transform: translate(-50%, -50%) scale(1);
}
</style>
