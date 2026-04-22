<template>
  <div
    class="pdf-artifact-preview__surface"
    :class="{
      'is-search-open': searchUiVisible,
      'has-thumbnails-open': thumbnailsVisible,
    }"
    tabindex="0"
    data-surface-context-guard="true"
    @contextmenu.prevent="handleShellContextMenu"
    @pointerdown.capture="handleContextPointerCapture"
    @mousedown.capture="handleMouseDownCapture"
    @keydown.capture="handleKeydown"
    @dblclick.capture="handleDoubleClick"
  >
    <div class="pdf-artifact-preview__toolbar" data-no-embedpdf-interaction="true">
      <div class="pdf-artifact-preview__toolbar-main">
        <div class="pdf-artifact-preview__toolbar-main-left">
          <UiButton
            variant="ghost"
            size="sm"
            icon-only
            :active="thumbnailsVisible"
            :title="t('Toggle thumbnails')"
            :aria-label="t('Toggle thumbnails')"
            @click="toggleThumbnails"
          >
            <IconLayoutSidebarLeftExpand :size="16" :stroke-width="1.8" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            icon-only
            :active="currentSpreadMode === 'single'"
            :title="t('Single page')"
            :aria-label="t('Single page')"
            @click="setPreferredSpreadMode('single')"
          >
            <IconRectangleVertical :size="16" :stroke-width="1.8" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            icon-only
            :active="currentSpreadMode === 'double'"
            :title="t('Two-page spread')"
            :aria-label="t('Two-page spread')"
            @click="setPreferredSpreadMode('double')"
          >
            <IconColumns2 :size="16" :stroke-width="1.8" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            icon-only
            :active="searchUiVisible"
            :title="t('Search in PDF')"
            :aria-label="t('Search in PDF')"
            @click="toggleSearchUi"
          >
            <IconSearch :size="16" :stroke-width="1.8" />
          </UiButton>
        </div>

        <div class="pdf-artifact-preview__toolbar-main-middle">
          <UiButton variant="ghost" size="sm" :title="t('Zoom out')" @click="zoomBy(-1)">
            -
          </UiButton>
          <UiSelect
            shell-class="pdf-artifact-preview__toolbar-select"
            size="sm"
            :model-value="zoomMenuValue"
            :options="zoomMenuOptions"
            :aria-label="t('Current zoom')"
            @update:model-value="handleZoomMenuSelection"
          />
          <UiButton variant="ghost" size="sm" :title="t('Zoom in')" @click="zoomBy(1)">
            +
          </UiButton>
        </div>

        <div class="pdf-artifact-preview__toolbar-main-right">
          <div class="pdf-artifact-preview__toolbar-page-group">
            <input
              v-model="pageInputValue"
              class="pdf-artifact-preview__toolbar-page-input"
              :title="t('Page number')"
              :aria-label="t('Page number')"
              inputmode="numeric"
              autocomplete="off"
              @keydown.enter.prevent="submitPageNumberInput"
              @blur="submitPageNumberInput"
            />
            <span class="pdf-artifact-preview__toolbar-page-total">
              / {{ totalPageCount }}
            </span>
          </div>
        </div>

      </div>

      <div v-if="searchUiVisible" class="pdf-artifact-preview__toolbar-search">
        <div class="pdf-artifact-preview__search-row">
          <UiButton
            variant="ghost"
            size="sm"
            icon-only
            class="pdf-artifact-preview__search-step"
            :disabled="!hasSearchResults"
            :title="t('Previous result')"
            :aria-label="t('Previous result')"
            @click="navigateSearch(-1)"
          >
            <IconChevronUp :size="14" :stroke-width="1.8" />
          </UiButton>

          <label class="pdf-artifact-preview__search-shell">
            <IconSearch class="pdf-artifact-preview__search-shell-icon" :size="15" :stroke-width="1.8" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="pdf-artifact-preview__search-field"
              :placeholder="t('Search in PDF')"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @keydown.enter.prevent="handleSearchEnter"
              @keydown.escape.prevent="handleSearchEscape"
            />
            <span class="pdf-artifact-preview__search-summary">
              {{ searchSummary }}
            </span>
          </label>

          <UiButton
            variant="ghost"
            size="sm"
            icon-only
            class="pdf-artifact-preview__search-step"
            :disabled="!hasSearchResults"
            :title="t('Next result')"
            :aria-label="t('Next result')"
            @click="navigateSearch(1)"
          >
            <IconChevronDown :size="14" :stroke-width="1.8" />
          </UiButton>
        </div>

        <div class="pdf-artifact-preview__search-row pdf-artifact-preview__search-row--filters">
          <UiButton
            variant="ghost"
            size="sm"
            :active="isMatchCaseEnabled"
            :title="t('Match case')"
            @click="toggleSearchFlag(MatchFlag.MatchCase)"
          >
            Aa
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :active="isWholeWordEnabled"
            :title="t('Whole words')"
            @click="toggleSearchFlag(MatchFlag.MatchWholeWord)"
          >
            {{ t('Word') }}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :active="search.state.value.showAllResults"
            :disabled="!hasSearchResults"
            :title="t('Highlight all')"
            @click="toggleShowAllResults"
          >
            {{ t('All') }}
          </UiButton>
        </div>
      </div>
    </div>

    <div class="pdf-artifact-preview__body">
      <aside
        v-if="thumbnailsVisible"
        class="pdf-artifact-preview__thumbnails"
        data-no-embedpdf-interaction="true"
      >
        <ThumbnailsPane :document-id="documentId" class="pdf-artifact-preview__thumbnails-pane">
          <template #default="{ meta }">
            <button
              type="button"
              class="pdf-artifact-preview__thumbnail"
              :class="{ 'is-active': currentPageNumber === meta.pageIndex + 1 }"
              :style="{
                position: 'absolute',
                top: `${meta.top}px`,
                height: `${meta.wrapperHeight}px`,
                width: '100%',
              }"
              @click="scrollToThumbnailPage(meta.pageIndex + 1)"
            >
              <div
                class="pdf-artifact-preview__thumbnail-image"
                :style="{ width: `${meta.width}px`, height: `${meta.height}px` }"
              >
                <ThumbImg :document-id="documentId" :meta="meta" />
              </div>
              <span class="pdf-artifact-preview__thumbnail-label">
                {{ meta.pageIndex + 1 }}
              </span>
            </button>
          </template>
        </ThumbnailsPane>
      </aside>

      <Viewport :document-id="documentId" class="pdf-artifact-preview__viewport">
        <Scroller :document-id="documentId" v-slot="{ page }">
          <div
            :ref="(element) => setPageElement(page, element)"
            class="pdf-artifact-preview__page-shell"
            :data-page-number="page.pageNumber"
            :style="{ width: `${page.width}px`, height: `${page.height}px` }"
          >
            <PagePointerProvider
              :document-id="documentId"
              :page-index="page.pageIndex"
              class="pdf-artifact-preview__page"
            >
              <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
              <SearchLayer :document-id="documentId" :page-index="page.pageIndex" />
              <SelectionLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                :text-style="{ background: 'rgba(80, 132, 255, 0.28)' }"
                :marquee-style="{
                  background: 'rgba(80, 132, 255, 0.16)',
                  borderColor: 'rgba(80, 132, 255, 0.72)',
                  borderStyle: 'solid',
                }"
              />
            </PagePointerProvider>
          </div>
        </Scroller>
      </Viewport>
    </div>

    <SurfaceContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :groups="menuGroups"
      @close="closeSurfaceContextMenu"
      @select="handleSurfaceContextMenuSelect"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

import { MatchFlag } from '@embedpdf/models'
import { writeText as writeClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import {
  IconColumns2,
  IconChevronDown,
  IconChevronUp,
  IconLayoutSidebarLeftExpand,
  IconRectangleVertical,
  IconSearch,
} from '@tabler/icons-vue'
import { useExport } from '@embedpdf/plugin-export/vue'
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue'
import { RenderLayer } from '@embedpdf/plugin-render/vue'
import { SearchLayer, useSearch } from '@embedpdf/plugin-search/vue'
import { Scroller, useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/vue'
import { SelectionLayer, useSelectionCapability } from '@embedpdf/plugin-selection/vue'
import { SpreadMode, useSpread } from '@embedpdf/plugin-spread/vue'
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/vue'
import { Viewport, useViewportCapability } from '@embedpdf/plugin-viewport/vue'
import { ZoomMode, useZoom } from '@embedpdf/plugin-zoom/vue'

import { useI18n } from '../../i18n'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import { encodePdfArrayBufferToBase64 } from '../../services/pdf/embedPdfAdapter.js'
import { writePdfArtifactBase64 } from '../../services/pdf/artifactPreview.js'
import {
  normalizeWorkspacePdfViewerLastScale,
  normalizeWorkspacePdfViewerSpreadMode,
  normalizeWorkspacePdfViewerZoomMode,
} from '../../services/workspacePreferences.js'
import { useToastStore } from '../../stores/toast.js'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { basenamePath } from '../../utils/path.js'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const props = defineProps({
  documentId: { type: String, required: true },
  artifactPath: { type: String, required: true },
  kind: { type: String, default: 'pdf' },
  pdfViewerZoomMode: { type: String, default: 'page-width' },
  pdfViewerSpreadMode: { type: String, default: 'single' },
  pdfViewerLastScale: { type: String, default: '' },
  forwardSyncPoint: { type: Object, default: null },
  restoreState: { type: Object, default: null },
})

const emit = defineEmits([
  'open-external',
  'reverse-sync-request',
  'forward-sync-point-consumed',
  'reload-requested',
  'view-state-change',
  'restore-state-consumed',
])

const SEARCH_DEBOUNCE_MS = 140
const ZOOM_MENU_PRESET_VALUES = ['0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4']

const { t } = useI18n()
const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const zoom = useZoom(() => props.documentId)
const spread = useSpread(() => props.documentId)
const scroll = useScroll(() => props.documentId)
const search = useSearch(() => props.documentId)
const exportScope = useExport(() => props.documentId)
const { provides: selectionCapability } = useSelectionCapability()
const { provides: scrollCapability } = useScrollCapability()
const { provides: viewportCapability } = useViewportCapability()
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

const pageBindings = new Map()
const pendingRestoreState = ref(null)
const pendingForwardSyncPoint = ref(null)
const initialLayoutHandled = ref(false)
const saveInProgress = ref(false)
const selectedText = ref('')
const selectionActive = ref(false)
const contextMenuSelectionText = ref('')
const searchUiVisible = ref(false)
const thumbnailsVisible = ref(false)
const searchQuery = ref('')
const pageInputValue = ref('1')
const searchInputRef = ref(null)
const currentContextMenuReverseSyncDetail = ref(null)

let scheduledViewStateFrame = 0
let restoreRevision = 0
let searchDebounceTimer = 0
let suppressSearchWatch = false

const hasSearchResults = computed(() => Number(search.state.value?.total || 0) > 0)
const isMatchCaseEnabled = computed(() =>
  Array.isArray(search.state.value?.flags)
    && search.state.value.flags.includes(MatchFlag.MatchCase)
)
const isWholeWordEnabled = computed(() =>
  Array.isArray(search.state.value?.flags)
    && search.state.value.flags.includes(MatchFlag.MatchWholeWord)
)
const currentSpreadMode = computed(() =>
  spread.spreadMode.value === SpreadMode.Odd ? 'double' : 'single'
)
const currentPageNumber = computed(() => Math.max(1, Number(scroll.state.value?.currentPage || 1)))
const totalPageCount = computed(() => Math.max(1, Number(scroll.state.value?.totalPages || 1)))
const zoomDisplayLabel = computed(() => {
  const scaleValue = resolveScaleValueFromZoomState()
  if (scaleValue === 'page-fit') return t('Fit')
  if (scaleValue === 'page-width') return t('Width')
  if (scaleValue === 'auto') return t('Auto')

  const numericScale = Number(scaleValue)
  if (!Number.isFinite(numericScale) || numericScale <= 0) return '100%'
  return `${Math.round(numericScale * 100)}%`
})
const zoomMenuValue = computed(() => {
  const scaleValue = resolveScaleValueFromZoomState()
  if (scaleValue === 'page-fit' || scaleValue === 'page-width') return scaleValue

  const normalizedScale = normalizeWorkspacePdfViewerLastScale(scaleValue)
  if (normalizedScale) return normalizedScale
  return '1'
})
const zoomMenuOptions = computed(() => {
  const options = [
    { value: 'page-width', label: t('Width'), triggerLabel: t('Width') },
    { value: 'page-fit', label: t('Fit'), triggerLabel: t('Fit') },
  ]

  const isPresetScale = ZOOM_MENU_PRESET_VALUES.includes(zoomMenuValue.value)
  const isBuiltinMode = zoomMenuValue.value === 'page-width' || zoomMenuValue.value === 'page-fit'

  if (!isPresetScale && !isBuiltinMode) {
    options.push({
      value: zoomMenuValue.value,
      label: zoomDisplayLabel.value,
      triggerLabel: zoomDisplayLabel.value,
    })
  }

  return options.concat(
    ZOOM_MENU_PRESET_VALUES.map((value) => {
      const percentage = Math.round(Number(value) * 100)
      return {
        value,
        label: `${percentage}%`,
        triggerLabel: `${percentage}%`,
      }
    })
  )
})
const searchSummary = computed(() => {
  if (search.state.value?.loading) return t('Searching...')
  const total = Number(search.state.value?.total || 0)
  if (total < 1) return t('No results')
  const activeIndex = Number(search.state.value?.activeResultIndex ?? -1)
  return `${activeIndex + 1} / ${total}`
})
const contextMenuCopyText = computed(() =>
  normalizeSelectedText(selectedText.value || contextMenuSelectionText.value)
)
const hasCopyableSelection = computed(() => {
  const selectionState = selectionCapability.value?.forDocument(props.documentId)?.getState?.()
  return Boolean(contextMenuCopyText.value || selectionActive.value || selectionState?.selection)
})

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function normalizeSelectedText(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || ''))
      .join('\n')
      .trim()
  }

  return String(value || '').trim()
}

function readDomSelectedText() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''
  return normalizeSelectedText(
    window.getSelection?.()?.toString?.() || document.getSelection?.()?.toString?.() || ''
  )
}

function isContextMenuTriggerEvent(event) {
  const button = Number(event?.button)
  return button === 2 || (button === 0 && Boolean(event?.ctrlKey))
}

function setPageElement(page, element) {
  const numericPageNumber = Number(page?.pageNumber || 0)
  if (!Number.isInteger(numericPageNumber) || numericPageNumber < 1) return
  if (element) {
    pageBindings.set(numericPageNumber, { element, page })
    return
  }
  pageBindings.delete(numericPageNumber)
}

function resolvePageBinding(pageNumber) {
  const numericPageNumber = Number(pageNumber || 0)
  if (!Number.isInteger(numericPageNumber) || numericPageNumber < 1) return null
  return pageBindings.get(numericPageNumber) || null
}

function resolveMouseClientPoint(event) {
  const clientX = Number(event?.clientX)
  const clientY = Number(event?.clientY)
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return { clientX, clientY }
  }

  const pageX = Number(event?.pageX)
  const pageY = Number(event?.pageY)
  if (Number.isFinite(pageX) && Number.isFinite(pageY)) {
    return { clientX: pageX, clientY: pageY }
  }

  return null
}

function resolveScaleValueFromZoomState(state = zoom.state.value) {
  const zoomLevel = state?.zoomLevel
  if (zoomLevel === ZoomMode.FitPage) return 'page-fit'
  if (zoomLevel === ZoomMode.FitWidth) return 'page-width'
  if (zoomLevel === ZoomMode.Automatic) return 'auto'

  const currentZoomLevel = Number(state?.currentZoomLevel || 0)
  if (!Number.isFinite(currentZoomLevel) || currentZoomLevel <= 0) return ''
  return String(Math.round(currentZoomLevel * 10000) / 10000)
}

function resolvePreferredSpreadMode() {
  return normalizeWorkspacePdfViewerSpreadMode(props.pdfViewerSpreadMode) === 'double'
    ? SpreadMode.Odd
    : SpreadMode.None
}

function resolvePreferredZoomValue() {
  const normalizedZoomMode = normalizeWorkspacePdfViewerZoomMode(props.pdfViewerZoomMode)
  if (normalizedZoomMode === 'page-fit') return 'page-fit'
  if (normalizedZoomMode === 'remember-last') {
    return normalizeWorkspacePdfViewerLastScale(props.pdfViewerLastScale) || 'page-width'
  }
  return 'page-width'
}

function applyZoomValue(scaleValue) {
  const zoomScope = zoom.provides.value
  if (!zoomScope || !scaleValue) return false

  if (scaleValue === 'page-fit') {
    zoomScope.requestZoom(ZoomMode.FitPage)
    return true
  }

  if (scaleValue === 'page-width') {
    zoomScope.requestZoom(ZoomMode.FitWidth)
    return true
  }

  if (scaleValue === 'auto') {
    zoomScope.requestZoom(ZoomMode.Automatic)
    return true
  }

  const numericScale = Number(scaleValue)
  if (!Number.isFinite(numericScale) || numericScale <= 0) return false
  zoomScope.requestZoom(numericScale)
  return true
}

function applyViewerPreferences() {
  spread.provides.value?.setSpreadMode(resolvePreferredSpreadMode())
  applyZoomValue(resolvePreferredZoomValue())
}

function captureCurrentViewState() {
  const viewportScope = viewportCapability.value?.forDocument(props.documentId)
  if (!viewportScope) return null

  const pageNumber = Math.max(1, Number(scroll.state.value?.currentPage || 1))
  const scaleValue = normalizeWorkspacePdfViewerLastScale(resolveScaleValueFromZoomState())
  const viewportMetrics = viewportScope.getMetrics()
  const pageElement = resolvePageBinding(pageNumber)?.element
  const pageHeight = Number(pageElement?.offsetHeight || 0)
  const pageTop = Number(pageElement?.offsetTop || 0)
  const pageScrollRatio =
    Number.isFinite(pageHeight) && pageHeight > 0
      ? clamp((Number(viewportMetrics?.scrollTop || 0) - pageTop) / pageHeight, 0, 1)
      : null

  return {
    pageNumber,
    scaleValue,
    pageScrollRatio,
    scrollLeft: Number(viewportMetrics?.scrollLeft || 0),
  }
}

function emitCurrentViewState() {
  scheduledViewStateFrame = 0
  const nextState = captureCurrentViewState()
  if (!nextState) return
  emit('view-state-change', nextState)
}

function scheduleViewStateEmission() {
  if (typeof window === 'undefined') {
    emitCurrentViewState()
    return
  }
  if (scheduledViewStateFrame) return
  scheduledViewStateFrame = window.requestAnimationFrame(() => {
    emitCurrentViewState()
  })
}

function focusSearchInput(selectAll = false) {
  void nextTick(() => {
    if (selectAll) {
      searchInputRef.value?.select?.()
      return
    }
    searchInputRef.value?.focus?.()
  })
}

function openSearchUi(options = {}) {
  searchUiVisible.value = true
  focusSearchInput(options.selectAll === true)
}

function toggleSearchUi() {
  if (searchUiVisible.value) {
    closeSearchUi()
    return
  }
  openSearchUi({ selectAll: true })
}

function toggleThumbnails() {
  thumbnailsVisible.value = !thumbnailsVisible.value
}

function clearSearchDebounceTimer() {
  if (!searchDebounceTimer || typeof window === 'undefined') return
  window.clearTimeout(searchDebounceTimer)
  searchDebounceTimer = 0
}

function closeSearchUi() {
  clearSearchDebounceTimer()
  searchUiVisible.value = false
  suppressSearchWatch = true
  searchQuery.value = ''
  search.provides.value?.stopSearch?.()
}

function scheduleSearchExecution(query = searchQuery.value) {
  clearSearchDebounceTimer()

  if (typeof window === 'undefined') {
    void executeSearch(query)
    return
  }

  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = 0
    void executeSearch(query)
  }, SEARCH_DEBOUNCE_MS)
}

async function executeSearch(query = searchQuery.value) {
  const searchScope = search.provides.value
  if (!searchScope) return

  try {
    await searchScope.searchAllPages(String(query || '')).toPromise()
  } catch (error) {
    if (String(error?.reason?.code || error?.code || '').trim().toLowerCase() === 'cancelled') {
      return
    }

    toastStore.showOnce(
      `embedpdf-search:${props.documentId}`,
      error?.message || t('Preview failed'),
      { type: 'error', duration: 3200 }
    )
  }
}

function toggleSearchFlag(flag) {
  const searchScope = search.provides.value
  if (!searchScope) return

  const nextFlags = new Set(search.state.value?.flags || [])
  if (nextFlags.has(flag)) {
    nextFlags.delete(flag)
  } else {
    nextFlags.add(flag)
  }

  searchScope.setFlags(Array.from(nextFlags))
}

function toggleShowAllResults() {
  const searchScope = search.provides.value
  if (!searchScope) return
  searchScope.setShowAllResults(!search.state.value?.showAllResults)
}

function zoomBy(direction = 1) {
  const currentZoomLevel = Number(zoom.state.value?.currentZoomLevel || 1)
  const safeCurrentZoomLevel =
    Number.isFinite(currentZoomLevel) && currentZoomLevel > 0 ? currentZoomLevel : 1
  const multiplier = direction > 0 ? 1.1 : 0.9
  const nextZoomLevel = clamp(safeCurrentZoomLevel * multiplier, 0.25, 5)

  zoom.provides.value?.requestZoom(nextZoomLevel)
  void workspace.setPdfViewerZoomMode('remember-last').catch(() => {})
}

function setPreferredZoomMode(mode = 'page-width') {
  const normalizedMode = mode === 'page-fit' ? 'page-fit' : 'page-width'
  applyZoomValue(normalizedMode)
  void workspace.setPdfViewerZoomMode(normalizedMode).catch(() => {})
}

function handleZoomMenuSelection(value = 'page-width') {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) return

  if (normalizedValue === 'page-fit' || normalizedValue === 'page-width') {
    setPreferredZoomMode(normalizedValue)
    return
  }

  if (!applyZoomValue(normalizedValue)) return
  void workspace.setPdfViewerZoomMode('remember-last').catch(() => {})
}

function setPreferredSpreadMode(mode = 'single') {
  const normalizedMode = mode === 'double' ? 'double' : 'single'
  spread.provides.value?.setSpreadMode(
    normalizedMode === 'double' ? SpreadMode.Odd : SpreadMode.None
  )
  void workspace.setPdfViewerSpreadMode(normalizedMode).catch(() => {})
}

function scrollToThumbnailPage(pageNumber = 1) {
  scroll.provides.value?.scrollToPage({
    pageNumber: Math.max(1, Number(pageNumber || 1)),
    behavior: 'smooth',
    alignY: 8,
  })
}

function submitPageNumberInput() {
  const numericPageNumber = Math.round(Number(pageInputValue.value || 0))
  const nextPageNumber = clamp(
    Number.isFinite(numericPageNumber) ? numericPageNumber : currentPageNumber.value,
    1,
    totalPageCount.value
  )
  pageInputValue.value = String(nextPageNumber)
  scrollToThumbnailPage(nextPageNumber)
}

function navigateSearch(direction = 1) {
  const searchScope = search.provides.value
  if (!searchScope) return

  if (!hasSearchResults.value) {
    if (String(searchQuery.value || '').trim()) {
      void executeSearch(searchQuery.value)
    }
    return
  }

  if (direction < 0) {
    searchScope.previousResult()
    return
  }

  searchScope.nextResult()
}

function handleSearchEnter(event) {
  navigateSearch(event?.shiftKey ? -1 : 1)
}

function handleSearchEscape() {
  if (String(searchQuery.value || '').trim()) {
    suppressSearchWatch = true
    searchQuery.value = ''
    search.provides.value?.stopSearch?.()
    focusSearchInput(false)
    return
  }

  closeSearchUi()
}

async function copyTextToClipboard(text = '') {
  if (!text) return

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  try {
    await writeClipboardText(text)
    return
  } catch {
    // Fall through to execCommand fallback.
  }

  if (typeof document === 'undefined') {
    throw new Error(t('Clipboard is unavailable'))
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

async function readSelectedText() {
  const selectionScope = selectionCapability.value?.forDocument(props.documentId)
  if (!selectionScope) return ''

  try {
    const lines = await selectionScope.getSelectedText().toPromise()
    return normalizeSelectedText(lines)
  } catch {
    return ''
  }
}

async function refreshSelectedText() {
  const selectionScope = selectionCapability.value?.forDocument(props.documentId)
  if (!selectionScope) {
    selectedText.value = ''
    selectionActive.value = false
    return
  }

  const state = selectionScope.getState()
  selectionActive.value = Boolean(state?.active)
  if (!state?.active) {
    selectedText.value = ''
    return
  }

  selectedText.value = await readSelectedText()
}

async function copySelectedText(preferredText = '') {
  const nextText = (await readSelectedText())
    || normalizeSelectedText(preferredText)
    || selectedText.value
    || contextMenuSelectionText.value
  if (!nextText) return

  try {
    await copyTextToClipboard(nextText)
    selectedText.value = nextText
  } catch (error) {
    toastStore.showOnce(
      `embedpdf-copy:${props.documentId}`,
      error?.message || t('Clipboard is unavailable'),
      { type: 'error', duration: 3200 }
    )
  }
}

function buildSurfaceMenuGroups() {
  const revealDetail = currentContextMenuReverseSyncDetail.value
  const copyText = contextMenuCopyText.value
  const canCopy = hasCopyableSelection.value

  return [
    {
      key: 'embedpdf-surface-actions',
      items: [
        {
          key: 'copy',
          label: t('Copy'),
          disabled: !canCopy,
          action: () => {
            void copySelectedText(copyText)
          },
        },
        {
          key: 'save-pdf',
          label: t('Save'),
          disabled: saveInProgress.value || !exportScope.provides.value,
          action: () => {
            void savePdfToDisk()
          },
        },
        {
          key: 'reload-pdf',
          label: t('Reload PDF'),
          action: () => {
            emit('reload-requested')
          },
        },
        {
          key: 'open-pdf',
          label: t('Open PDF'),
          action: () => {
            emit('open-external')
          },
        },
        ...(revealDetail
          ? [
              {
                key: 'reveal-source',
                label: t('Reveal Source'),
                action: () => {
                  emit('reverse-sync-request', revealDetail)
                },
              },
            ]
          : []),
      ],
    },
  ]
}

async function handleShellContextMenu(event) {
  currentContextMenuReverseSyncDetail.value = resolveReverseSyncDetail(event)
  contextMenuSelectionText.value = readDomSelectedText() || selectedText.value
  await refreshSelectedText()
  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: buildSurfaceMenuGroups(),
  })
}

function handleContextPointerCapture(event) {
  if (!isContextMenuTriggerEvent(event)) return

  const snapshot = readDomSelectedText()
  const selectionState = selectionCapability.value?.forDocument(props.documentId)?.getState?.()
  const hasSelection = Boolean(
    snapshot
    || contextMenuSelectionText.value
    || selectedText.value
    || selectionActive.value
    || selectionState?.selection
  )
  if (!hasSelection) return

  contextMenuSelectionText.value = snapshot || selectedText.value || contextMenuSelectionText.value
  event.stopPropagation()
  event.stopImmediatePropagation?.()
}

function handleMouseDownCapture(event) {
  handleContextPointerCapture(event)
}

function handleKeydown(event) {
  const key = String(event.key || '').toLowerCase()

  if ((event.metaKey || event.ctrlKey) && key === 's') {
    event.preventDefault()
    event.stopPropagation()
    void savePdfToDisk()
    return
  }

  if ((event.metaKey || event.ctrlKey) && key === 'f') {
    event.preventDefault()
    event.stopPropagation()
    openSearchUi({ selectAll: true })
    return
  }

  if ((event.metaKey || event.ctrlKey) && key === 'c' && selectedText.value) {
    event.preventDefault()
    event.stopPropagation()
    void copySelectedText()
    return
  }

  if (event.key === 'Escape') {
    if (menuVisible.value) {
      closeSurfaceContextMenu()
      return
    }

    if (searchUiVisible.value) {
      event.preventDefault()
      event.stopPropagation()
      handleSearchEscape()
      return
    }

    if (selectionActive.value) {
      selectionCapability.value?.clear(props.documentId)
    }
  }
}

function scrollToPdfPoint(point = {}) {
  const scrollScope = scroll.provides.value
  if (!scrollScope) return false

  const pageNumber = Number(point.page || 0)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return false

  const pageBinding = resolvePageBinding(pageNumber)
  const pageHeight = Number(pageBinding?.page?.height || 0)
  const x = Number(point.x)
  const y = Number(point.y)

  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(pageHeight) && pageHeight > 0) {
    scrollScope.scrollToPage({
      pageNumber,
      pageCoordinates: {
        x: Math.max(0, x),
        y: Math.max(0, pageHeight - y),
      },
      behavior: 'instant',
      alignY: 35,
    })
    scheduleViewStateEmission()
    return true
  }

  scrollScope.scrollToPage({
    pageNumber,
    behavior: 'instant',
    alignY: 35,
  })
  scheduleViewStateEmission()
  return true
}

function scrollToSearchResult(index) {
  const result = search.state.value?.results?.[index]
  const scrollScope = scroll.provides.value
  if (!result || !scrollScope) return false

  const pageNumber = Number(result.pageIndex ?? -1) + 1
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return false

  const firstRect = Array.isArray(result.rects) ? result.rects[0] : null
  if (firstRect) {
    scrollScope.scrollToPage({
      pageNumber,
      pageCoordinates: {
        x: Math.max(0, Number(firstRect.origin?.x || 0)),
        y: Math.max(0, Number(firstRect.origin?.y || 0)),
      },
      behavior: 'smooth',
      alignY: 22,
    })
  } else {
    scrollScope.scrollToPage({
      pageNumber,
      behavior: 'smooth',
      alignY: 22,
    })
  }

  scheduleViewStateEmission()
  return true
}

async function savePdfToDisk() {
  if (saveInProgress.value) return
  const task = exportScope.provides.value?.saveAsCopy()
  if (!task) return

  saveInProgress.value = true
  try {
    const arrayBuffer = await task.toPromise()
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error(t('Preview failed'))
    }

    await writePdfArtifactBase64(
      props.artifactPath,
      encodePdfArrayBufferToBase64(arrayBuffer)
    )

    toastStore.show(`"${basenamePath(props.artifactPath) || 'PDF'}" ${t('Saved')}`, {
      type: 'success',
      duration: 2200,
    })
  } catch (error) {
    toastStore.showOnce(
      `embedpdf-save:${props.artifactPath}`,
      error?.message || t('Preview failed'),
      { type: 'error', duration: 3200 }
    )
  } finally {
    saveInProgress.value = false
  }
}

function resolveReverseSyncDetail(event) {
  if (props.kind !== 'latex') return null

  const pageElement = event?.target?.closest?.('.pdf-artifact-preview__page-shell')
  const pageNumber = Number(pageElement?.dataset?.pageNumber || 0)
  const pointer = resolveMouseClientPoint(event)
  const pageBinding = resolvePageBinding(pageNumber)
  const pageRect = pageBinding?.element?.getBoundingClientRect?.()
  const pageWidth = Number(pageBinding?.page?.width || 0)
  const pageHeight = Number(pageBinding?.page?.height || 0)

  if (
    !pageElement
    || !Number.isInteger(pageNumber)
    || pageNumber < 1
    || !pointer
    || !pageRect
    || !Number.isFinite(pageRect.width)
    || !Number.isFinite(pageRect.height)
    || pageRect.width <= 0
    || pageRect.height <= 0
    || !Number.isFinite(pageWidth)
    || !Number.isFinite(pageHeight)
    || pageWidth <= 0
    || pageHeight <= 0
  ) {
    return null
  }

  const localX = clamp(pointer.clientX - pageRect.left, 0, pageRect.width)
  const localY = clamp(pointer.clientY - pageRect.top, 0, pageRect.height)
  const pdfX = (localX / pageRect.width) * pageWidth
  const pdfY = pageHeight - (localY / pageRect.height) * pageHeight

  return {
    page: pageNumber,
    pos: [pdfX, pdfY],
    textBeforeSelection: '',
    textAfterSelection: '',
  }
}

async function handleDoubleClick(event) {
  if (props.kind !== 'latex') return

  await nextTick()
  if (typeof window !== 'undefined') {
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
  }

  if (!event?.altKey && selectionActive.value) return

  const detail = resolveReverseSyncDetail(event)
  if (!detail) return
  emit('reverse-sync-request', detail)
}

async function restoreViewState(state) {
  const currentRevision = ++restoreRevision
  if (!state) return false

  const scrollScope = scroll.provides.value
  const viewportScope = viewportCapability.value?.forDocument(props.documentId)
  if (!scrollScope || !viewportScope) return false

  spread.provides.value?.setSpreadMode(resolvePreferredSpreadMode())
  applyZoomValue(String(state.scaleValue || '').trim() || resolvePreferredZoomValue())

  await nextTick()
  if (currentRevision !== restoreRevision) return false

  if (typeof window !== 'undefined') {
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
  }

  if (currentRevision !== restoreRevision) return false

  const pageNumber = Math.max(1, Number(state.pageNumber || 1))
  scrollScope.scrollToPage({
    pageNumber,
    behavior: 'instant',
  })

  await nextTick()
  if (currentRevision !== restoreRevision) return false

  if (typeof window !== 'undefined') {
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
  }

  if (currentRevision !== restoreRevision) return false

  const pageElement = resolvePageBinding(pageNumber)?.element
  const pageTop = Number(pageElement?.offsetTop || 0)
  const pageHeight = Number(pageElement?.offsetHeight || 0)
  const pageScrollRatio = Number(state.pageScrollRatio)
  const scrollLeft = Number(state.scrollLeft)
  const nextScrollTop =
    Number.isFinite(pageScrollRatio) && Number.isFinite(pageHeight) && pageHeight > 0
      ? pageTop + pageHeight * clamp(pageScrollRatio, 0, 1)
      : viewportScope.getMetrics().scrollTop

  viewportScope.scrollTo({
    x: Number.isFinite(scrollLeft) ? scrollLeft : 0,
    y: nextScrollTop,
    behavior: 'instant',
  })

  await nextTick()
  if (currentRevision !== restoreRevision) return false

  scheduleViewStateEmission()
  initialLayoutHandled.value = true
  emit('restore-state-consumed')
  return true
}

watch(
  () => props.restoreState,
  (nextState) => {
    pendingRestoreState.value = nextState ? { ...nextState } : null
  },
  { immediate: true }
)

watch(
  () => props.forwardSyncPoint,
  (nextPoint) => {
    pendingForwardSyncPoint.value = nextPoint ? { ...nextPoint } : null
  },
  { immediate: true }
)

watch(
  () => [props.pdfViewerZoomMode, props.pdfViewerSpreadMode, props.pdfViewerLastScale],
  () => {
    if (pendingRestoreState.value) return
    applyViewerPreferences()
    scheduleViewStateEmission()
  }
)

watch(
  () => resolveScaleValueFromZoomState(),
  (nextScaleValue) => {
    const normalizedScaleValue = normalizeWorkspacePdfViewerLastScale(nextScaleValue)
    if (normalizedScaleValue && workspace.pdfViewerLastScale !== normalizedScaleValue) {
      void workspace.setPdfViewerLastScale(normalizedScaleValue).catch(() => {})
    }
    scheduleViewStateEmission()
  }
)

watch(
  () => scroll.state.value?.currentPage,
  () => {
    pageInputValue.value = String(currentPageNumber.value)
    scheduleViewStateEmission()
  }
)

watch(
  () => spread.spreadMode.value,
  () => {
    scheduleViewStateEmission()
  }
)

watch(
  () => props.documentId,
  () => {
    pageBindings.clear()
    pendingForwardSyncPoint.value = null
    currentContextMenuReverseSyncDetail.value = null
    initialLayoutHandled.value = false
    selectionActive.value = false
    selectedText.value = ''
    suppressSearchWatch = true
    searchQuery.value = ''
    searchUiVisible.value = false
    scheduleViewStateEmission()
  }
)

watch(
  () => search.state.value?.query,
  (nextQuery) => {
    const normalizedQuery = String(nextQuery || '')
    if (normalizedQuery === searchQuery.value) return
    suppressSearchWatch = true
    searchQuery.value = normalizedQuery
  },
  { immediate: true }
)

watch(
  () => searchQuery.value,
  (nextQuery) => {
    if (suppressSearchWatch) {
      suppressSearchWatch = false
      return
    }

    if (!searchUiVisible.value && !String(nextQuery || '').trim()) return
    scheduleSearchExecution(nextQuery)
  }
)

watch(
  () => search.state.value?.activeResultIndex,
  (nextIndex) => {
    if (!Number.isInteger(nextIndex) || nextIndex < 0) return
    void nextTick(() => {
      scrollToSearchResult(nextIndex)
    })
  }
)

watch(
  () => menuVisible.value,
  (visible) => {
    if (visible) return
    contextMenuSelectionText.value = ''
    currentContextMenuReverseSyncDetail.value = null
  }
)

watch(
  [selectionCapability, () => props.documentId],
  ([capability, documentId], _, onCleanup) => {
    if (!capability || !documentId) {
      selectionActive.value = false
      selectedText.value = ''
      return
    }

    const selectionScope = capability.forDocument(documentId)
    selectionActive.value = Boolean(selectionScope.getState()?.active)

    const syncSelection = () => {
      void refreshSelectedText()
    }

    syncSelection()

    const unsubscribeSelection = selectionScope.onSelectionChange(() => {
      syncSelection()
    })
    const unsubscribeText = selectionScope.onTextRetrieved((text) => {
      selectedText.value = normalizeSelectedText(text)
      selectionActive.value = Boolean(selectedText.value)
    })

    onCleanup(() => {
      unsubscribeSelection?.()
      unsubscribeText?.()
    })
  },
  { immediate: true }
)

watch(
  [scrollCapability, () => props.documentId],
  ([capability, documentId], _, onCleanup) => {
    if (!capability || !documentId) return

    const unsubscribeLayoutReady = capability.onLayoutReady((event) => {
      if (event.documentId !== documentId) return

      if (pendingRestoreState.value) {
        void restoreViewState(pendingRestoreState.value)
        return
      }

      if (pendingForwardSyncPoint.value && scrollToPdfPoint(pendingForwardSyncPoint.value)) {
        pendingForwardSyncPoint.value = null
        emit('forward-sync-point-consumed')
      }

      if (!initialLayoutHandled.value) {
        applyViewerPreferences()
        initialLayoutHandled.value = true
      }
      scheduleViewStateEmission()
    })

    const unsubscribeScroll = capability.onScroll((event) => {
      if (event.documentId !== documentId) return
      scheduleViewStateEmission()
    })

    onCleanup(() => {
      unsubscribeLayoutReady?.()
      unsubscribeScroll?.()
    })
  },
  { immediate: true }
)

watch(
  () => pendingForwardSyncPoint.value,
  (nextPoint) => {
    if (!nextPoint || !initialLayoutHandled.value) return
    if (scrollToPdfPoint(nextPoint)) {
      pendingForwardSyncPoint.value = null
      emit('forward-sync-point-consumed')
    }
  }
)

onUnmounted(() => {
  pageBindings.clear()
  clearSearchDebounceTimer()

  if (scheduledViewStateFrame && typeof window !== 'undefined') {
    window.cancelAnimationFrame(scheduledViewStateFrame)
    scheduledViewStateFrame = 0
  }
})
</script>

<style scoped>
.pdf-artifact-preview__surface {
  position: relative;
  width: 100%;
  height: 100%;
  outline: none;
}

.pdf-artifact-preview__toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 30px;
  padding: 0 6px;
  box-sizing: border-box;
  font: message-box;
  background: color-mix(
    in srgb,
    var(--shell-preview-surface, var(--embedpdf-surface)) 92%,
    var(--surface-base, var(--embedpdf-page))
  );
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 24%, transparent);
  backdrop-filter: saturate(1.02) blur(10px);
}

.pdf-artifact-preview__toolbar-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 30px;
}

.pdf-artifact-preview__toolbar-main-left,
.pdf-artifact-preview__toolbar-main-middle,
.pdf-artifact-preview__toolbar-main-right,
.pdf-artifact-preview__toolbar-search,
.pdf-artifact-preview__toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pdf-artifact-preview__toolbar-main-left {
  flex: 1 1 0;
  justify-content: flex-start;
}

.pdf-artifact-preview__toolbar-main-middle {
  flex: 0 0 auto;
  justify-content: center;
}

.pdf-artifact-preview__toolbar-main-right {
  flex: 1 1 0;
  justify-content: flex-end;
}

.pdf-artifact-preview__toolbar-page-group,
.pdf-artifact-preview__toolbar-icon-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pdf-artifact-preview__toolbar-page-group {
  gap: 4px;
  margin-inline-end: 2px;
}

.pdf-artifact-preview__toolbar-page-input {
  width: 38px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 24%, transparent);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  outline: 0;
}

.pdf-artifact-preview__toolbar-page-input:focus {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 44%, transparent);
}

.pdf-artifact-preview__toolbar-page-total {
  min-width: 28px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.pdf-artifact-preview__toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-wrap: wrap;
}

.pdf-artifact-preview__body {
  position: relative;
  width: 100%;
  height: 100%;
}

.pdf-artifact-preview__thumbnails {
  position: absolute;
  top: 30px;
  left: 0;
  bottom: 0;
  z-index: 14;
  width: 132px;
  min-width: 132px;
  max-width: 132px;
  height: auto;
  padding-top: 8px;
  box-sizing: border-box;
  border-inline-end: 1px solid color-mix(in srgb, var(--border-subtle) 18%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 94%, var(--surface-base));
  box-shadow: 8px 0 24px rgb(0 0 0 / 0.08);
  backdrop-filter: saturate(1.02) blur(10px);
}

.pdf-artifact-preview__thumbnails-pane {
  height: 100%;
}

.pdf-artifact-preview__thumbnail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.pdf-artifact-preview__thumbnail-image {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid color-mix(in srgb, var(--border-subtle) 40%, transparent);
  background: var(--embedpdf-page);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.06);
  overflow: hidden;
}

.pdf-artifact-preview__thumbnail.is-active .pdf-artifact-preview__thumbnail-image {
  border-color: color-mix(in srgb, var(--focus-ring) 52%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 20%, transparent);
}

.pdf-artifact-preview__thumbnail-label {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.pdf-artifact-preview__thumbnail.is-active .pdf-artifact-preview__thumbnail-label {
  color: var(--text-primary);
}

.pdf-artifact-preview__viewport {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  padding-top: 30px;
  box-sizing: border-box;
  background: var(--embedpdf-surface);
}

.pdf-artifact-preview__page-shell {
  position: relative;
  margin: 12px auto;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  background: var(--embedpdf-page);
}

.pdf-artifact-preview__page {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--embedpdf-page);
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.pdf-artifact-preview__page canvas,
.pdf-artifact-preview__page img {
  -webkit-user-drag: none;
  user-select: none;
}

.pdf-artifact-preview__toolbar-search {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 16;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  min-width: 332px;
  max-width: min(430px, calc(100vw - 40px));
  padding: 6px 8px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 28%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 68%, transparent);
  box-shadow:
    0 16px 34px color-mix(in srgb, black 12%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 16%, transparent);
  backdrop-filter: saturate(1.08) blur(18px);
}

.pdf-artifact-preview__search-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pdf-artifact-preview__search-row--filters {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.pdf-artifact-preview__search-shell {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 24%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-base) 60%, transparent),
      color-mix(in srgb, var(--surface-base) 42%, transparent)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 6px 16px color-mix(in srgb, black 6%, transparent);
}

.pdf-artifact-preview__search-shell:focus-within {
  border-color: color-mix(in srgb, var(--focus-ring) 42%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--focus-ring) 24%, transparent),
    0 8px 18px color-mix(in srgb, black 8%, transparent);
}

.pdf-artifact-preview__search-shell-icon {
  color: var(--text-muted);
}

.pdf-artifact-preview__search-field {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  outline: 0;
}

.pdf-artifact-preview__search-field::placeholder {
  color: color-mix(in srgb, var(--text-muted) 76%, transparent);
}

.pdf-artifact-preview__search-summary {
  max-width: 104px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pdf-artifact-preview__search-step {
  width: 24px;
  min-width: 24px;
}

.pdf-artifact-preview__search-row--filters :deep(.ui-button) {
  justify-content: center;
  width: 100%;
  height: 22px;
  border-radius: 8px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-base) 22%, transparent);
}

.pdf-artifact-preview__search-row--filters :deep(.ui-button:hover:not(:disabled)),
.pdf-artifact-preview__search-row--filters :deep(.ui-button.is-active) {
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent);
  color: var(--text-primary);
}

:deep(.pdf-artifact-preview__toolbar .ui-button) {
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

:deep(.pdf-artifact-preview__toolbar .ui-button:hover:not(:disabled)),
:deep(.pdf-artifact-preview__toolbar .ui-button.is-active) {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
  color: var(--text-primary);
}

:deep(.pdf-artifact-preview__toolbar .ui-button.is-icon-only) {
  width: 28px;
  padding: 0;
}

:deep(.pdf-artifact-preview__toolbar .pdf-artifact-preview__toolbar-select) {
  width: auto;
  min-width: 58px;
}

:deep(.pdf-artifact-preview__toolbar .pdf-artifact-preview__toolbar-select .ui-select-trigger) {
  height: 28px;
  padding: 0 18px 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  box-shadow: none;
}

:deep(.pdf-artifact-preview__toolbar .pdf-artifact-preview__toolbar-select .ui-select-trigger:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
}

:deep(.pdf-artifact-preview__toolbar .pdf-artifact-preview__toolbar-select .ui-select-trigger:focus-visible) {
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 44%, transparent);
}

:deep(.pdf-artifact-preview__toolbar .pdf-artifact-preview__toolbar-select .ui-select-caret) {
  right: 4px;
}

@media (max-width: 720px) {
  .pdf-artifact-preview__toolbar-main {
    min-height: 54px;
    align-items: flex-start;
    flex-direction: column;
    justify-content: flex-start;
    gap: 2px;
  }

  .pdf-artifact-preview__toolbar-main-left,
  .pdf-artifact-preview__toolbar-main-middle,
  .pdf-artifact-preview__toolbar-main-right {
    width: 100%;
    justify-content: flex-start;
  }

  .pdf-artifact-preview__thumbnails {
    top: 56px;
    width: 108px;
    min-width: 108px;
    max-width: 108px;
    padding-top: 8px;
  }

  .pdf-artifact-preview__viewport {
    padding-top: 56px;
  }

  .pdf-artifact-preview__toolbar-search {
    left: 8px;
    right: 8px;
    transform: none;
    min-width: 0;
    max-width: none;
  }

  .pdf-artifact-preview__search-row {
    grid-template-columns: 24px minmax(0, 1fr) 24px;
    gap: 5px;
  }

  .pdf-artifact-preview__search-row--filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pdf-artifact-preview__search-shell {
    grid-template-columns: 16px minmax(0, 1fr);
  }

  .pdf-artifact-preview__search-summary {
    display: none;
  }
}
</style>
