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
    <div class="reference-workbench__main">
      <ReferenceLibraryToolbar
        :can-export="referencesStore.references.length > 0"
        :import-in-flight="referencesStore.importInFlight"
        :is-loading="referencesStore.isLoading"
        @add="showAddDialog = true"
        @export-bibtex="handleExportBibTeX"
        @import-bibtex="handleImportBibTeX"
        @import-pdf="handleImportPdf"
      />

      <div
        v-if="referencesStore.zoteroMutationError"
        class="reference-workbench__status ui-empty-copy is-error"
      >
        {{ referencesStore.zoteroMutationError }}
      </div>

      <div v-if="referencesStore.isLoading" class="reference-workbench__empty ui-empty-copy">
        {{ t('Loading references...') }}
      </div>

      <div v-else-if="referencesStore.loadError" class="reference-workbench__empty ui-empty-copy">
        {{ referencesStore.loadError }}
      </div>

      <div v-else-if="filteredReferences.length === 0" class="reference-workbench__empty ui-empty-copy">
        {{ t('No references in this section yet.') }}
      </div>

      <ReferenceLibraryTable
        v-else
        :references="filteredReferences"
        :selected-reference-id="selectedReference?.id"
        :sort-key="sortKey"
        @open-context-menu="openReferenceContextMenu"
        @select-reference="handleReferenceRowClick"
        @toggle-author-sort="toggleAuthorSort"
        @toggle-title-sort="toggleTitleSort"
        @toggle-year-sort="toggleYearSort"
      />
    </div>

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
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import { openNativeDialog, saveNativeDialog } from '../../services/nativeDialog.js'
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
  buildReferenceContextMenuGroups,
  buildReferenceDetailResizeConstraints,
  buildReferenceDetailResizePayload,
  buildReferenceExportDefaultPath,
  normalizeReferenceFilenameSegment,
  resolveNextReferenceSortKey,
  resolveReferenceCitedInFiles,
  resolveReferenceDetailDockWidth,
  resolveReferencePdfPath,
  shouldReconcileReferenceDetailWidth,
} from '../../domains/references/referenceWorkbenchPresentation.js'
import ReferenceAddDialog from './ReferenceAddDialog.vue'
import ReferenceLibraryDetailDock from './ReferenceLibraryDetailDock.vue'
import ReferenceLibraryTable from './ReferenceLibraryTable.vue'
import ReferenceLibraryToolbar from './ReferenceLibraryToolbar.vue'
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
const toastStore = useToastStore()
const uxStatusStore = useUxStatusStore()
const showAddDialog = ref(false)
const workbenchRef = ref(null)
const referenceDetailMotionActive = ref(false)
let referenceDockCloseResetTimer = null
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

const filteredReferences = computed(() => referencesStore.filteredReferences)
const selectedReference = computed(() => referencesStore.selectedReference)
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
const availableCollections = computed(() => referencesStore.collections)

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

async function getReferenceBibTeX(reference = {}) {
  if (!reference?.id) return ''
  return referencesStore.exportBibTeXAsync([reference.id])
}

async function copyTextToClipboard(text = '', successMessage = t('Copied to clipboard')) {
  if (!text) return
  if (typeof navigator?.clipboard?.writeText !== 'function') {
    throw new Error(t('Clipboard is unavailable'))
  }

  await navigator.clipboard.writeText(text)
  toastStore.show(successMessage, {
    type: 'success',
    duration: 1800,
  })
}

async function handleRenameReferencePdf(reference = {}) {
  if (!String(reference?.pdfPath || '').trim()) {
    toastStore.show(t('No PDF attached'), {
      type: 'error',
      duration: 2800,
    })
    return
  }

  const defaultName = normalizeReferenceFilenameSegment(reference.citationKey || reference.title, 'reference')
  const nextName = window.prompt(t('Rename PDF'), defaultName)
  if (nextName == null) return

  const normalizedBaseName = normalizeReferenceFilenameSegment(nextName, defaultName)
  if (!normalizedBaseName || normalizedBaseName === defaultName) return

  try {
    await referencesStore.renameReferencePdfAsset(
      workspace.globalConfigDir,
      reference.id,
      normalizedBaseName
    )
  } catch (error) {
    toastStore.show(error?.message || t('Failed to rename PDF'), {
      type: 'error',
      duration: 3600,
    })
  }
}

async function handleRefreshReferenceMetadata(reference = {}) {
  try {
    const refreshed = await referencesStore.refreshReferenceMetadata(
      workspace.globalConfigDir,
      reference.id
    )
    if (!refreshed) {
      toastStore.show(t('No metadata match found'), {
        type: 'error',
        duration: 3200,
      })
    }
  } catch (error) {
    toastStore.show(error?.message || t('Failed to refresh metadata'), {
      type: 'error',
      duration: 3600,
    })
  }
}

async function handleExportReferenceBibTeX(reference = {}) {
  if (!reference?.id) return

  const target = await saveNativeDialog({
    title: t('Export BibTeX'),
    defaultPath: buildReferenceExportDefaultPath(reference, { extension: 'bib' }),
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!target) return

  try {
    await referencesStore.writeBibTeXExportFile(String(target), [reference.id])
    uxStatusStore.success(t('Exported BibTeX'), { duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to export BibTeX'), {
      type: 'error',
      duration: 5000,
    })
  }
}

async function handleDetailedExport(reference = {}) {
  const target = await saveNativeDialog({
    title: t('Detailed Export'),
    defaultPath: buildReferenceExportDefaultPath(reference, { extension: 'json' }),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (!target) return

  try {
    await referencesStore.writeReferenceJsonExportFile(String(target), reference.id)
    uxStatusStore.success(t('Detailed export saved'), { duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to export reference details'), {
      type: 'error',
      duration: 5000,
    })
  }
}

async function handleCopyReferenceBibTeX(reference = {}) {
  try {
    await copyTextToClipboard(await getReferenceBibTeX(reference), t('Copied to clipboard'))
  } catch (error) {
    toastStore.show(error?.message || t('Failed to copy citation'), {
      type: 'error',
      duration: 3200,
    })
  }
}

function openReferenceContextMenu(event, reference) {
  referencesStore.selectReference(reference.id)

  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: bindReferenceContextMenuActions(
      buildReferenceContextMenuGroups({
        reference,
        collections: availableCollections.value,
        translate: t,
      }),
      reference
    ),
  })
}

function bindReferenceContextMenuActions(groups = [], reference = {}) {
  const bindItem = (item = {}) => {
    const nextItem = { ...item }
    if (nextItem.actionId && nextItem.actionId !== 'noop') {
      nextItem.action = () => handleReferenceContextMenuAction(nextItem, reference)
    }
    if (Array.isArray(nextItem.children)) {
      nextItem.children = nextItem.children.map(bindItem)
    }
    return nextItem
  }

  return (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    items: Array.isArray(group?.items) ? group.items.map(bindItem) : [],
  }))
}

function handleReferenceContextMenuAction(item = {}, reference = {}) {
  const referenceId = String(item.referenceId || reference?.id || '').trim()
  if (!referenceId) return

  if (item.actionId === 'rename-pdf') {
    return handleRenameReferencePdf(reference)
  }
  if (item.actionId === 'refresh-metadata') {
    return handleRefreshReferenceMetadata(reference)
  }
  if (item.actionId === 'toggle-collection') {
    return referencesStore.toggleReferenceCollection(
      workspace.globalConfigDir,
      referenceId,
      item.collectionKey
    )
  }
  if (item.actionId === 'export-bibtex') {
    return handleExportReferenceBibTeX(reference)
  }
  if (item.actionId === 'export-detailed') {
    return handleDetailedExport(reference)
  }
  if (item.actionId === 'copy-bibtex') {
    return handleCopyReferenceBibTeX(reference)
  }
  if (item.actionId === 'delete') {
    return referencesStore.removeReference(workspace.globalConfigDir, referenceId)
  }
}

function handleManualImport(importedCount = 0) {
  if (importedCount > 0) {
    uxStatusStore.success(t('Imported {count} references', { count: importedCount }), {
      duration: 2200,
    })
  }
}

async function handleImportBibTeX() {
  const selected = await openNativeDialog({
    multiple: false,
    title: t('Import BibTeX'),
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!selected || Array.isArray(selected)) return

  const statusId = uxStatusStore.show(t('Importing BibTeX...'), {
    type: 'info',
    duration: 0,
  })

  try {
    const importResult = await referencesStore.importReferenceFile(
      workspace.globalConfigDir,
      String(selected),
      'bibtex'
    )
    const importedCount = Number(importResult?.importedCount || 0)

    uxStatusStore.success(
      importedCount > 0
        ? t('Imported {count} references', { count: importedCount })
        : t('No new references were added'),
      { duration: 2200 }
    )
  } catch (error) {
    const message = error?.message || String(error || 'Failed to import BibTeX')
    uxStatusStore.error(t('Failed to import BibTeX'), { duration: 3200 })
    toastStore.show(message, { type: 'error', duration: 5000 })
  } finally {
    uxStatusStore.clear(statusId)
  }
}

async function handleImportPdf() {
  const selected = await openNativeDialog({
    multiple: false,
    title: t('Import PDF'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (!selected || Array.isArray(selected)) return

  const statusId = uxStatusStore.show(t('Importing PDF...'), {
    type: 'info',
    duration: 0,
  })

  try {
    const importedReference = await referencesStore.importReferencePdf(
      workspace.globalConfigDir,
      String(selected)
    )
    uxStatusStore.success(
      importedReference ? t('Imported PDF into reference library') : t('No new references were added'),
      { duration: 2200 }
    )
  } catch (error) {
    const message = error?.message || String(error || 'Failed to import PDF')
    uxStatusStore.error(t('Failed to import PDF'), { duration: 3200 })
    toastStore.show(message, { type: 'error', duration: 5000 })
  } finally {
    uxStatusStore.clear(statusId)
  }
}

async function handleExportBibTeX() {
  const references = filteredReferences.value
  if (!references.length) return
  const target = await saveNativeDialog({
    title: t('Export BibTeX'),
    defaultPath: 'references.bib',
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!target) return

  try {
    await referencesStore.writeBibTeXExportFile(
      String(target),
      references.map((reference) => reference.id)
    )
    uxStatusStore.success(t('Exported BibTeX'), { duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to export BibTeX'), {
      type: 'error',
      duration: 5000,
    })
  }
}

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

.reference-workbench__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.reference-workbench__empty {
  padding: 24px;
  text-align: center;
}

.reference-workbench__status {
  padding: 10px 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.reference-workbench__status.is-error {
  color: var(--error);
}
</style>
