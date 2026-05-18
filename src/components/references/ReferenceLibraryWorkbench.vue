<!-- START OF FILE src/components/references/ReferenceLibraryWorkbench.vue -->
<template>
  <section
    ref="workbenchRef"
    class="reference-workbench"
    :class="{
      'has-reference-detail': referenceDetailOpen,
      'is-reference-detail-resizing': referenceDetailResizing,
    }"
    data-surface-context-guard="true"
  >
    <ReferenceLibraryMain
      :can-export="referencesStore.references.length > 0"
      :import-in-flight="referencesStore.importInFlight"
      :is-loading="referencesStore.isLoading"
      :load-error="referencesStore.loadError"
      :references="filteredReferences"
      :selected-reference-id="selectedReference?.id"
      :sort-key="sortKey"
      :zotero-mutation-error="referencesStore.zoteroMutationError"
      @add="showAddDialog = true"
      @export-bibtex="handleExportBibTeX"
      @import-bibtex="handleImportBibTeX"
      @import-pdf="handleImportPdf"
      @open-context-menu="openReferenceContextMenu"
      @select-reference="handleReferenceRowClick"
      @toggle-author-sort="toggleAuthorSort"
      @toggle-title-sort="toggleTitleSort"
      @toggle-year-sort="toggleYearSort"
    />

    <ReferenceLibraryDetailDock
      :active-key="activeReferenceDockKey"
      :active-page="activeReferenceDockPage"
      :aria-label="t('Details')"
      :get-container-width="resolveReferenceWorkbenchWidth"
      :open="referenceDetailOpen"
      :pages="referenceDockPages"
      :resizing="referenceDetailResizing"
      :width="referenceDetailDockWidth"
      @activate-page="activateReferenceDockPage"
      @close-page="closeReferenceDockPage"
      @motion-state-change="handleReferenceDetailMotionStateChange"
      @resize="handleReferenceDetailResize"
      @resize-start="handleReferenceDetailResizeStart"
      @resize-end="handleReferenceDetailResizeEnd"
      @resize-snap="handleReferenceDetailResizeSnap"
    />

    <SurfaceContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :groups="menuGroups"
      @close="closeSurfaceContextMenu"
      @select="handleSurfaceContextMenuSelect"
    />

    <ReferenceAddDialog
      :visible="showAddDialog"
      @close="showAddDialog = false"
      @imported="handleManualImport"
    />
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useReferenceLibraryActions } from '../../composables/references/useReferenceLibraryActions.js'
import {
  findInlineDockPage,
  resolveInlineDockActivePageKey,
  resolveInlineDockFallbackPageType,
} from '../../domains/workbench/inlineDockPageRegistry.js'
import {
  REFERENCE_DOCK_CITED_IN_PAGE,
  REFERENCE_DOCK_DETAILS_PAGE,
  REFERENCE_DOCK_PDF_PAGE,
} from '../../domains/references/referenceDockPages.js'
import {
  REFERENCE_WORKBENCH_DETAIL_CLOSE_RESET_DELAY_MS,
  buildReferenceDetailResizeConstraints,
  buildReferenceDetailResizePayload,
  resolveNextReferenceSortKey,
  resolveReferenceCitedInFiles,
  resolveReferenceDetailDockWidth,
  resolveReferencePdfPath,
  shouldReconcileReferenceDetailWidth,
} from '../../domains/references/referenceWorkbenchPresentation.js'
import ReferenceAddDialog from './ReferenceAddDialog.vue'
import ReferenceLibraryDetailDock from './ReferenceLibraryDetailDock.vue'
import ReferenceLibraryMain from './ReferenceLibraryMain.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import { referenceDockPageRegistry } from './referenceDockPageRegistry.js'

const props = defineProps({
  referenceDetailOpen: { type: Boolean, default: false },
  referenceDetailWidth: { type: Number, default: 360 },
  referenceDetailResizing: { type: Boolean, default: false },
})

const emit = defineEmits([
  'inline-dock-resize',
  'inline-dock-resize-start',
  'inline-dock-resize-end',
  'inline-dock-resize-snap',
])

const { t } = useI18n()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const showAddDialog = ref(false)
const workbenchRef = ref(null)
const referenceDetailMotionActive = ref(false)
let referenceDockCloseResetTimer = null

const filteredReferences = computed(() => referencesStore.filteredReferences)
const selectedReference = computed(() => referencesStore.selectedReference)
const {
  closeSurfaceContextMenu,
  handleExportBibTeX,
  handleImportBibTeX,
  handleImportPdf,
  handleManualImport,
  handleSurfaceContextMenuSelect,
  menuGroups,
  menuVisible,
  menuX,
  menuY,
  openReferenceContextMenu,
} = useReferenceLibraryActions({ filteredReferences })
const selectedReferencePdfPath = computed(() => resolveReferencePdfPath(selectedReference.value))
const selectedReferenceCitationKey = computed(() =>
  String(selectedReference.value?.citationKey || '').trim()
)
const selectedReferenceCitedInFiles = computed(() =>
  resolveReferenceCitedInFiles(referencesStore.citedIn, selectedReferenceCitationKey.value)
)
const hasSelectedReferenceCitations = computed(() => selectedReferenceCitedInFiles.value.length > 0)
const canPreviewSelectedReferencePdf = computed(() => selectedReferencePdfPath.value.length > 0)
const showReferencePdfTab = computed(
  () => referencesStore.selectedReferencePdfTabOpen && canPreviewSelectedReferencePdf.value
)
const referenceDockPages = computed(() =>
  referenceDockPageRegistry.resolvePages({
    allowedPageIds: workspace.referenceDockPageIds,
    citedInCount: selectedReferenceCitedInFiles.value.length,
    openPdfPreview: activateReferencePdfTab,
    pageDefinitions: workspace.referenceDockPageDefinitions,
    referenceDetailResizing: referenceDetailLayoutLocked.value,
    selectedReference: selectedReference.value,
    selectedReferencePdfPath: selectedReferencePdfPath.value,
    showReferencePdfTab: showReferencePdfTab.value,
    t,
  })
)
const activeReferenceDockKey = computed(() => {
  return resolveInlineDockActivePageKey(referenceDockPages.value, workspace.referenceDockActivePage, {
    defaultType: workspace.referenceDockDefaultPage || REFERENCE_DOCK_DETAILS_PAGE,
  })
})
const activeReferenceDockPage = computed(() =>
  findInlineDockPage(referenceDockPages.value, activeReferenceDockKey.value)
)
const referenceDetailDockWidth = computed(() => resolveReferenceDetailDockWidth(props.referenceDetailWidth))
const referenceDetailLayoutLocked = computed(() =>
  props.referenceDetailResizing || referenceDetailMotionActive.value
)
const sortKey = computed({
  get: () => referencesStore.sortKey,
  set: (value) => referencesStore.setSortKey(value),
})

function toggleTitleSort() {
  referencesStore.setSortKey(resolveNextReferenceSortKey(sortKey.value, 'title'))
}

function toggleAuthorSort() {
  referencesStore.setSortKey(resolveNextReferenceSortKey(sortKey.value, 'author'))
}

function toggleYearSort() {
  referencesStore.setSortKey(resolveNextReferenceSortKey(sortKey.value, 'year'))
}

function handleReferenceRowClick(reference = {}) {
  if (!reference?.id) return
  referencesStore.selectReference(reference.id)
  resetReferenceDockTabs()
  void workspace.openReferenceDock()
}

function activateReferenceDetailsTab() {
  void workspace.setReferenceDockActivePage(REFERENCE_DOCK_DETAILS_PAGE)
}

function activateReferencePdfTab() {
  if (!canPreviewSelectedReferencePdf.value) return
  if (!referencesStore.openReferenceDockPdf(selectedReference.value?.id)) return
  void workspace.openReferenceDock()
  void workspace.setReferenceDockActivePage(REFERENCE_DOCK_PDF_PAGE)
}

function activateReferenceDockPage(page = {}) {
  if (page.type === REFERENCE_DOCK_DETAILS_PAGE) {
    activateReferenceDetailsTab()
    return
  }
  if (page.type === REFERENCE_DOCK_PDF_PAGE) {
    activateReferencePdfTab()
    return
  }
  if (page.type === REFERENCE_DOCK_CITED_IN_PAGE) {
    void workspace.setReferenceDockActivePage(REFERENCE_DOCK_CITED_IN_PAGE)
  }
}

function resolveReferenceDockFallbackPage(page = {}) {
  return resolveInlineDockFallbackPageType(
    referenceDockPages.value.filter((candidate) => candidate.key !== page.key),
    page,
    { defaultType: workspace.referenceDockDefaultPage || REFERENCE_DOCK_DETAILS_PAGE }
  ) || REFERENCE_DOCK_DETAILS_PAGE
}

function closeReferencePdfTab(page = {}) {
  const wasActive =
    activeReferenceDockKey.value === REFERENCE_DOCK_PDF_PAGE ||
    workspace.referenceDockActivePage === REFERENCE_DOCK_PDF_PAGE
  referencesStore.closeReferenceDockPdf(selectedReference.value?.id)
  if (wasActive) {
    void workspace.setReferenceDockActivePage(resolveReferenceDockFallbackPage(page))
  }
}

function closeReferenceDockPage(page = {}) {
  if (page.type === REFERENCE_DOCK_PDF_PAGE) {
    closeReferencePdfTab(page)
  }
}

function clearReferenceDockCloseResetTimer() {
  if (referenceDockCloseResetTimer === null) return
  window.clearTimeout(referenceDockCloseResetTimer)
  referenceDockCloseResetTimer = null
}

function resetReferenceDockTabs() {
  referencesStore.resetReferenceDockTabs()
  void workspace.setReferenceDockActivePage(REFERENCE_DOCK_DETAILS_PAGE)
}

function handleReferenceDetailResizeStart() {
  emit('inline-dock-resize-start')
}

function handleReferenceDetailMotionStateChange(isActive) {
  referenceDetailMotionActive.value = isActive === true
}

function resolveReferenceWorkbenchWidth() {
  return workbenchRef.value?.getBoundingClientRect?.().width || 0
}

function emitReferenceDetailResize(width, containerWidth = resolveReferenceWorkbenchWidth()) {
  emit('inline-dock-resize', buildReferenceDetailResizePayload({
    width,
    containerWidth,
  }))
}

function clampReferenceDetailWidthToList() {
  const containerWidth = resolveReferenceWorkbenchWidth()
  if (!shouldReconcileReferenceDetailWidth({
    isOpen: props.referenceDetailOpen,
    width: props.referenceDetailWidth,
    containerWidth,
  })) {
    return
  }

  emitReferenceDetailResize(props.referenceDetailWidth, containerWidth)
}

function handleReferenceDetailResize(event = {}) {
  emitReferenceDetailResize(event.width, event.containerWidth)
}

function handleReferenceDetailResizeEnd() {
  emit('inline-dock-resize-end')
}

function handleReferenceDetailResizeSnap(event = {}) {
  emit('inline-dock-resize-snap', buildReferenceDetailResizeConstraints({
    containerWidth: event.containerWidth || resolveReferenceWorkbenchWidth(),
  }))
}

watch(
  () => props.referenceDetailOpen,
  (isOpen) => {
    clearReferenceDockCloseResetTimer()
    if (isOpen) return

    referenceDockCloseResetTimer = window.setTimeout(() => {
      referenceDockCloseResetTimer = null
      resetReferenceDockTabs()
    }, REFERENCE_WORKBENCH_DETAIL_CLOSE_RESET_DELAY_MS)
  }
)

watch(
  [() => props.referenceDetailOpen, () => props.referenceDetailWidth],
  () => {
    void nextTick(() => {
      clampReferenceDetailWidthToList()
    })
  },
  { flush: 'post', immediate: true }
)

watch(
  () => selectedReference.value?.id || '',
  () => {
    resetReferenceDockTabs()
  }
)

watch(
  () => canPreviewSelectedReferencePdf.value,
  (canPreviewPdf) => {
    if (!canPreviewPdf && workspace.referenceDockActivePage === REFERENCE_DOCK_PDF_PAGE) {
      closeReferencePdfTab({
        key: REFERENCE_DOCK_PDF_PAGE,
        type: REFERENCE_DOCK_PDF_PAGE,
        fallbackPage: REFERENCE_DOCK_DETAILS_PAGE,
      })
    }
  },
  { immediate: true }
)

watch(
  () => hasSelectedReferenceCitations.value,
  (hasCitations) => {
    if (!hasCitations && workspace.referenceDockActivePage === REFERENCE_DOCK_CITED_IN_PAGE) {
      void workspace.setReferenceDockActivePage(REFERENCE_DOCK_DETAILS_PAGE)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearReferenceDockCloseResetTimer()
})

</script>

<style scoped>
.reference-workbench {
  display: flex;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

</style>
