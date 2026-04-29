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
      <!-- 紧凑工具栏 (Compact Toolbar) -->
      <header class="reference-workbench__toolbar">
        <div class="reference-workbench__toolbar-group">
          <UiButton variant="secondary" size="sm" shell-class="workbench-action-btn" @click="showAddDialog = true">
            <template #leading><IconPlus :size="14" :stroke-width="2" /></template>
            {{ t('Add') }}
          </UiButton>
          <div class="workbench-toolbar-divider"></div>
          <UiButton
            variant="ghost"
            size="sm"
            shell-class="workbench-action-btn"
            :loading="referencesStore.importInFlight"
            :disabled="referencesStore.isLoading"
            @click="handleImportPdf"
          >
            <template #leading><IconFileTypePdf :size="14" :stroke-width="1.8" /></template>
            {{ t('PDF') }}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            shell-class="workbench-action-btn"
            :loading="referencesStore.importInFlight"
            :disabled="referencesStore.isLoading"
            @click="handleImportBibTeX"
          >
            <template #leading><IconFileCode :size="14" :stroke-width="1.8" /></template>
            {{ t('BibTeX') }}
          </UiButton>
        </div>

        <div class="reference-workbench__toolbar-group">
          <UiButton
            variant="ghost"
            size="sm"
            shell-class="workbench-action-btn"
            :disabled="referencesStore.references.length === 0"
            @click="handleExportBibTeX"
          >
            <template #leading><IconShare :size="14" :stroke-width="1.8" /></template>
            {{ t('Export') }}
          </UiButton>
        </div>
      </header>

      <div v-if="referencesStore.isLoading" class="reference-workbench__empty ui-empty-copy">
        {{ t('Loading references...') }}
      </div>

      <div v-else-if="referencesStore.loadError" class="reference-workbench__empty ui-empty-copy">
        {{ referencesStore.loadError }}
      </div>

      <div v-else-if="filteredReferences.length === 0" class="reference-workbench__empty ui-empty-copy">
        {{ t('No references in this section yet.') }}
      </div>

      <div v-else class="reference-workbench__content">
        <!-- 极简原生表头 (Native Table Header) -->
        <div class="reference-workbench__table-head">
          <button
            type="button"
            class="reference-workbench__head-button"
            :class="{ 'is-active': isSortActive('title') }"
            @click="toggleTitleSort"
          >
            <span>{{ t('Title') }}</span>
            <IconChevronDown
              v-if="isSortActive('title')"
              class="sort-arrow"
              :class="{ 'is-asc': sortKey === 'title-asc' }"
              :size="12"
              :stroke-width="2.5"
            />
          </button>
          <button
            type="button"
            class="reference-workbench__head-button"
            :class="{ 'is-active': isSortActive('author') }"
            @click="toggleAuthorSort"
          >
            <span>{{ t('Authors') }}</span>
            <IconChevronDown
              v-if="isSortActive('author')"
              class="sort-arrow"
              :class="{ 'is-asc': sortKey === 'author-asc' }"
              :size="12"
              :stroke-width="2.5"
            />
          </button>
          <button
            type="button"
            class="reference-workbench__head-button"
            :class="{ 'is-active': isSortActive('year') }"
            @click="toggleYearSort"
          >
            <span>{{ t('Year') }}</span>
            <IconChevronDown
              v-if="isSortActive('year')"
              class="sort-arrow"
              :class="{ 'is-asc': sortKey === 'year-asc' }"
              :size="12"
              :stroke-width="2.5"
            />
          </button>
          <div class="reference-workbench__head-label">{{ t('Source') }}</div>
        </div>

        <div
          v-for="reference in filteredReferences"
          :key="reference.id"
          class="reference-workbench__row"
          :class="{ 'is-active': reference.id === selectedReference?.id }"
          @click="handleReferenceRowClick(reference)"
          @contextmenu.prevent="openReferenceContextMenu($event, reference)"
        >
          <div class="reference-workbench__cell reference-workbench__cell--title">
            <span class="reference-workbench__title-icon" aria-hidden="true">
              <IconFileText :size="14" :stroke-width="1.8" />
            </span>
            <span class="reference-workbench__truncate">{{ reference.title }}</span>
          </div>
          <div class="reference-workbench__cell">
            <span class="reference-workbench__truncate">{{ getReferenceAuthorLabel(reference) }}</span>
          </div>
          <div class="reference-workbench__cell">
            {{ reference.year || '—' }}
          </div>
          <div class="reference-workbench__cell">
            <span class="reference-workbench__truncate">{{ reference.source || '—' }}</span>
          </div>
        </div>
      </div>
    </div>

    <InlineDockFrame
      :aria-label="t('Details')"
      :open="referenceDetailOpen"
      :width="referenceDetailDockWidth"
      :resizing="referenceDetailResizing"
      region-class="reference-workbench__detail-dock"
      resize-slot-class="reference-workbench__detail-resize-slot"
      resize-handle-class="reference-workbench__detail-resize-handle"
      :get-container-width="resolveReferenceWorkbenchWidth"
      @motion-state-change="handleReferenceDetailMotionStateChange"
      @resize="handleReferenceDetailResize"
      @resize-start="handleReferenceDetailResizeStart"
      @resize-end="handleReferenceDetailResizeEnd"
      @resize-snap="handleReferenceDetailResizeSnap"
    >
      <section
        class="reference-workbench__detail-shell inline-dock"
        :aria-label="t('Details')"
      >
        <InlineDockTabBar
          :active-key="activeReferenceDockKey"
          :aria-label="t('Details')"
          :pages="referenceDockPages"
          tabbar-class="reference-workbench__detail-tabbar"
          tabs-class="reference-workbench__detail-tabs"
          @activate="activateReferenceDockPage"
          @close="closeReferenceDockPage"
        />

        <div class="reference-workbench__detail-body inline-dock__body is-flush">
          <component
            :is="activeReferenceDockPage?.component"
            v-if="activeReferenceDockPage?.component"
            :class="activeReferenceDockPage?.componentClass"
            v-bind="activeReferenceDockPage?.componentProps || {}"
            v-on="activeReferenceDockPage?.componentEvents || {}"
          />
          <div v-else class="reference-workbench__detail-empty inline-dock__empty">
            {{ t('No PDF attached') }}
          </div>
        </div>
      </section>
    </InlineDockFrame>

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
import { 
  IconFileText, 
  IconPlus, 
  IconFileTypePdf, 
  IconFileCode, 
  IconShare,
  IconChevronDown
} from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import { openNativeDialog, saveNativeDialog } from '../../services/nativeDialog.js'
import {
  writeReferenceBibTeXExport,
  writeReferenceJsonExport,
} from '../../services/references/bibtexExport.js'
import {
  hydrateReferenceFromCsl,
  lookupByDoi,
  searchByMetadata,
} from '../../services/references/crossref.js'
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
import ReferenceAddDialog from './ReferenceAddDialog.vue'
import InlineDockFrame from '../layout/InlineDockFrame.vue'
import InlineDockTabBar from '../layout/InlineDockTabBar.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import UiButton from '../shared/ui/UiButton.vue'
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
const REFERENCE_DETAIL_MIN_WIDTH = 420
const REFERENCE_LIST_MIN_WIDTH = 520
const REFERENCE_DETAIL_MAX_CONTAINER_RATIO = 0.52
const REFERENCE_DOCK_CLOSE_RESET_DELAY_MS = 680
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
const selectedReferencePdfPath = computed(() => String(selectedReference.value?.pdfPath || '').trim())
const selectedReferenceCitationKey = computed(() =>
  String(selectedReference.value?.citationKey || '').trim()
)
const selectedReferenceCitedInFiles = computed(() => {
  if (!selectedReferenceCitationKey.value) return []
  const files = referencesStore.citedIn[selectedReferenceCitationKey.value]
  return Array.isArray(files) ? files : []
})
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
const referenceDetailDockWidth = computed(() =>
  Math.max(REFERENCE_DETAIL_MIN_WIDTH, Number(props.referenceDetailWidth) || 0)
)
const referenceDetailLayoutLocked = computed(() =>
  props.referenceDetailResizing || referenceDetailMotionActive.value
)
const sortKey = computed({
  get: () => referencesStore.sortKey,
  set: (value) => referencesStore.setSortKey(value),
})
const availableCollections = computed(() => referencesStore.collections)

function getReferenceAuthorLabel(reference) {
  const authors = Array.isArray(reference?.authors) ? reference.authors : []
  if (!authors.length) return '—'
  if (authors.length === 1) return authors[0]
  return `${authors[0]} et al.`
}

function isSortActive(group) {
  return sortKey.value.startsWith(`${group}-`)
}

function toggleTitleSort() {
  referencesStore.setSortKey(sortKey.value === 'title-asc' ? 'title-desc' : 'title-asc')
}

function toggleAuthorSort() {
  referencesStore.setSortKey(sortKey.value === 'author-asc' ? 'author-desc' : 'author-asc')
}

function toggleYearSort() {
  referencesStore.setSortKey(sortKey.value === 'year-desc' ? 'year-asc' : 'year-desc')
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

function resolveReferenceDetailMaxWidth(containerWidth = resolveReferenceWorkbenchWidth()) {
  const normalizedContainerWidth = Number(containerWidth)
  if (!Number.isFinite(normalizedContainerWidth) || normalizedContainerWidth <= 0) {
    return Number.MAX_SAFE_INTEGER
  }

  const maxByListWidth = Math.floor(normalizedContainerWidth - REFERENCE_LIST_MIN_WIDTH)
  const maxByRatio = Math.floor(normalizedContainerWidth * REFERENCE_DETAIL_MAX_CONTAINER_RATIO)
  return Math.max(REFERENCE_DETAIL_MIN_WIDTH, Math.min(maxByListWidth, maxByRatio))
}

function emitReferenceDetailResize(width, containerWidth = resolveReferenceWorkbenchWidth()) {
  emit('inline-dock-resize', {
    width,
    containerWidth,
    minDockWidth: REFERENCE_DETAIL_MIN_WIDTH,
    minMainWidth: REFERENCE_LIST_MIN_WIDTH,
    maxContainerRatio: REFERENCE_DETAIL_MAX_CONTAINER_RATIO,
  })
}

function clampReferenceDetailWidthToList() {
  if (!props.referenceDetailOpen) return

  const containerWidth = resolveReferenceWorkbenchWidth()
  const maxWidth = resolveReferenceDetailMaxWidth(containerWidth)
  if (
    props.referenceDetailWidth >= REFERENCE_DETAIL_MIN_WIDTH &&
    props.referenceDetailWidth <= maxWidth
  ) {
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
  emit('inline-dock-resize-snap', {
    containerWidth: event.containerWidth || resolveReferenceWorkbenchWidth(),
    minDockWidth: REFERENCE_DETAIL_MIN_WIDTH,
    minMainWidth: REFERENCE_LIST_MIN_WIDTH,
    maxContainerRatio: REFERENCE_DETAIL_MAX_CONTAINER_RATIO,
  })
}

watch(
  () => props.referenceDetailOpen,
  (isOpen) => {
    clearReferenceDockCloseResetTimer()
    if (isOpen) return

    referenceDockCloseResetTimer = window.setTimeout(() => {
      referenceDockCloseResetTimer = null
      resetReferenceDockTabs()
    }, REFERENCE_DOCK_CLOSE_RESET_DELAY_MS)
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

function referenceIsInCollection(reference = {}, collectionKey = '') {
  const collection = availableCollections.value.find((item) => item.key === collectionKey)
  if (!collection) return false

  const memberships = Array.isArray(reference.collections) ? reference.collections : []
  const normalizedKey = String(collection.key || '').trim().toLowerCase()
  const normalizedLabel = String(collection.label || '').trim().toLowerCase()
  return memberships.some((value) => {
    const normalizedValue = String(value || '').trim().toLowerCase()
    return normalizedValue === normalizedKey || normalizedValue === normalizedLabel
  })
}

function normalizeFilenameSegment(value = '', fallback = 'reference') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

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

  const defaultName = normalizeFilenameSegment(reference.citationKey || reference.title, 'reference')
  const nextName = window.prompt(t('Rename PDF'), defaultName)
  if (nextName == null) return

  const normalizedBaseName = normalizeFilenameSegment(nextName, defaultName)
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
    let csl = null
    const identifier = String(reference.identifier || '').trim()

    if (/^10\.\d{4,9}\//i.test(identifier)) {
      csl = await lookupByDoi(identifier)
    }

    if (!csl) {
      const match = await searchByMetadata(
        reference.title,
        Array.isArray(reference.authors) ? reference.authors[0] || '' : '',
        reference.year
      )
      csl = match?.csl || null
    }

    if (!csl) {
      toastStore.show(t('No metadata match found'), {
        type: 'error',
        duration: 3200,
      })
      return
    }

    const refreshed = await hydrateReferenceFromCsl(csl, {
      id: reference.id,
      citationKey: reference.citationKey,
      pdfPath: reference.pdfPath,
      fulltextPath: reference.fulltextPath,
      collections: reference.collections,
      tags: reference.tags,
      notes: reference.notes,
      annotations: reference.annotations,
      rating: reference.rating,
      hasPdf: reference.hasPdf,
      hasFullText: reference.hasFullText,
    })

    await referencesStore.updateReference(workspace.globalConfigDir, reference.id, {
      ...refreshed,
      _source: reference._source,
      _zoteroKey: reference._zoteroKey,
      _zoteroLibrary: reference._zoteroLibrary,
      _importMethod: reference._importMethod,
      _pushedByApp: reference._pushedByApp,
      _appPushPending: reference._appPushPending,
    })
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
    defaultPath: `${normalizeFilenameSegment(reference.citationKey || reference.title, 'reference')}.bib`,
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!target) return

  try {
    await writeReferenceBibTeXExport(String(target), [reference])
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
    defaultPath: `${normalizeFilenameSegment(reference.citationKey || reference.title, 'reference')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (!target) return

  try {
    await writeReferenceJsonExport(String(target), reference)
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

  const groups = [
    {
      key: 'reference-maintenance',
      items: [
        {
          key: `rename-pdf:${reference.id}`,
          label: t('Rename PDF'),
          disabled: !String(reference.pdfPath || '').trim(),
          action: () => handleRenameReferencePdf(reference),
        },
        {
          key: `refresh-metadata:${reference.id}`,
          label: t('Refresh Metadata'),
          action: () => handleRefreshReferenceMetadata(reference),
        },
      ],
    },
    {
      key: 'reference-collections',
      items: [
        {
          key: `collections:${reference.id}`,
          label: t('Collections'),
          children: availableCollections.value.length
            ? availableCollections.value.map((collection) => ({
                key: `collection:${reference.id}:${collection.key}`,
                label: collection.label,
                checked: referenceIsInCollection(reference, collection.key),
                action: () =>
                  referencesStore.toggleReferenceCollection(
                    workspace.globalConfigDir,
                    reference.id,
                    collection.key
                  ),
              }))
            : [
                {
                  key: `collections-empty:${reference.id}`,
                  label: t('No collections yet'),
                  disabled: true,
                },
              ],
        },
      ],
    },
    {
      key: 'reference-exports',
      items: [
        {
          key: `export-bibtex:${reference.id}`,
          label: t('Export BibTeX...'),
          action: () => handleExportReferenceBibTeX(reference),
        },
        {
          key: `export-detailed:${reference.id}`,
          label: t('Detailed Export...'),
          action: () => handleDetailedExport(reference),
        },
        {
          key: `copy-bibtex:${reference.id}`,
          label: t('Copy BibTeX'),
          action: () => handleCopyReferenceBibTeX(reference),
        },
      ],
    },
    {
      key: 'reference-actions',
      items: [
        {
          key: `delete:${reference.id}`,
          label: t('Delete'),
          danger: true,
          action: () => referencesStore.removeReference(workspace.globalConfigDir, reference.id),
        },
      ],
    },
  ]

  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups,
  })
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
    await writeReferenceBibTeXExport(String(target), references)
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

.reference-workbench__detail-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.reference-workbench__detail-shell {
  --inline-dock-toolbar-height: 28px;
  --inline-dock-control-height: 24px;
  width: 100%;
}

:deep(.reference-workbench__detail-tabbar) {
  padding: 0 8px;
}

:deep(.reference-workbench__detail-tabs) {
  flex: 0 0 auto;
  gap: 4px;
}

:deep(.reference-workbench__detail-tab--icon) {
  flex: 0 0 26px;
  justify-content: center;
  width: 26px;
  min-width: 26px;
  max-width: 26px;
  height: 24px;
  padding: 0;
  border-radius: 5px;
}

:deep(.reference-workbench__detail-tab--icon .reference-workbench__detail-tab-label) {
  flex: 0 0 auto;
  justify-content: center;
  gap: 0;
}

:deep(.reference-workbench__detail-tab--details.inline-dock__tab:hover .reference-workbench__detail-tab-icon),
:deep(.reference-workbench__detail-tab--details.inline-dock__tab:focus-within .reference-workbench__detail-tab-icon) {
  opacity: 1;
  transform: none;
}

:deep(.reference-workbench__detail-tab--icon .reference-workbench__detail-tab-close) {
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%) scale(0.94);
}

:deep(.reference-workbench__detail-tab--icon:hover .reference-workbench__detail-tab-close),
:deep(.reference-workbench__detail-tab--icon:focus-within .reference-workbench__detail-tab-close) {
  transform: translate(-50%, -50%) scale(1);
}

:deep(.reference-workbench__detail-tab--pdf:not(.is-active).inline-dock__tab:hover .reference-workbench__detail-tab-icon),
:deep(.reference-workbench__detail-tab--pdf:not(.is-active).inline-dock__tab:focus-within .reference-workbench__detail-tab-icon) {
  opacity: 1;
  transform: none;
}

/* =========================================================================
   紧凑原生工具栏 (Compact Toolbar)
========================================================================= */
.reference-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  gap: 12px;
  height: 31px;
  min-height: 31px;
  padding: 0 12px;
  border-bottom: 1px solid var(--workbench-divider-soft);
  background: var(--shell-editor-surface);
  overflow: hidden;
}

.reference-workbench__toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.workbench-toolbar-divider {
  width: 1px;
  height: 14px;
  background: color-mix(in srgb, var(--border) 40%, transparent);
  margin: 0 4px;
}

/* 工具栏原生化按钮，不再像文字链接 */
:deep(.workbench-action-btn) {
  min-height: 24px;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 5px;
  color: var(--text-secondary);
}

:deep(.workbench-action-btn .ui-button-leading svg) {
  opacity: 0.8;
}

:deep(.workbench-action-btn.ui-button--secondary) {
  background: color-mix(in srgb, var(--surface-hover) 36%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
  box-shadow: none;
}

:deep(.workbench-action-btn.ui-button--ghost:hover) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* =========================================================================
   内容区与表头 (Content & Header)
========================================================================= */
.reference-workbench__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 0 20px;
}

.reference-workbench__table-head,
.reference-workbench__row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1.35fr) 64px minmax(0, 1.4fr);
  align-items: center;
  gap: 14px;
  min-width: 0;
}

/* 极致纤薄的表头 */
.reference-workbench__table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 28px;
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: var(--panel-surface);
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  backdrop-filter: blur(20px);
}

.reference-workbench__head-label {
  user-select: none;
}

.reference-workbench__head-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.reference-workbench__head-button:hover {
  color: var(--text-secondary);
}

.reference-workbench__head-button.is-active {
  color: var(--text-primary);
}

/* 纤细的原生箭头，替代臃肿的色块底 */
.sort-arrow {
  color: var(--text-primary);
  opacity: 0.8;
  transition: transform 0.2s ease;
}

.sort-arrow.is-asc {
  transform: rotate(180deg);
}

/* =========================================================================
   文献行 (Rows)
========================================================================= */
.reference-workbench__row {
  min-height: 28px; /* 进一步压低高度，呈现高密度信息 */
  padding: 0 16px;
  border-radius: 4px;
  margin: 1px 0;
  cursor: pointer;
  transition: none; /* 原生无动画 */
}

.reference-workbench__row:hover {
  background: var(--sidebar-item-hover);
}

.reference-workbench__row.is-active {
  background: var(--list-active-bg);
  color: var(--list-active-fg) !important;
  box-shadow: none;
}

.reference-workbench__row.is-active .reference-workbench__cell,
.reference-workbench__row.is-active .reference-workbench__title-icon {
  color: var(--list-active-fg) !important;
}

.reference-workbench__cell {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.reference-workbench__cell--title {
  gap: 8px;
  font-weight: 500;
}

.reference-workbench__title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
}

.reference-workbench__truncate {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-workbench__empty {
  padding: 24px;
  text-align: center;
}

@media (max-width: 1200px) {
  .reference-workbench__table-head,
  .reference-workbench__row {
    grid-template-columns: minmax(0, 2.5fr) minmax(0, 1.2fr) 62px minmax(0, 1.2fr);
    gap: 12px;
  }
}

@media (max-width: 920px) {
  .reference-workbench__toolbar {
    height: 31px;
    min-height: 31px;
    flex-wrap: nowrap;
    padding-top: 0;
    padding-bottom: 0;
  }
}
</style>
