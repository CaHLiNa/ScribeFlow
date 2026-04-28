<template>
  <div
    ref="surfaceRef"
    class="pdf-artifact-preview__surface"
    :style="surfaceStyle"
    :class="{
      'is-dark-page-theme': shouldUseDarkPageTheme,
      'is-search-open': searchUiVisible,
      'has-thumbnails-open': thumbnailsVisible,
    }"
    tabindex="0"
    data-surface-context-guard="true"
    @contextmenu.prevent="handleShellContextMenu"
    @pointerdown.capture="handleContextPointerCapture"
    @mousedown.capture="handleMouseDownCapture"
    @keydown.capture="handleKeydown"
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
              <PdfEmbedPageSyncBridge
                :document-id="documentId"
                :page-index="page.pageIndex"
                @page-double-click="handlePageDoubleClick(page, $event)"
              />
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
              <div
                v-for="overlay in resolveForwardSyncOverlays(page.pageNumber)"
                :key="overlay.key"
                class="pdf-artifact-preview__forward-sync-highlight"
                :style="overlay.style"
              ></div>
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
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'

import { useDocumentState } from '@embedpdf/core/vue'
import { MatchFlag, Rotation, transformRect } from '@embedpdf/models'
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
import { PagePointerProvider, usePointerHandlers } from '@embedpdf/plugin-interaction-manager/vue'
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
  resolvedTheme: { type: String, default: 'dark' },
  pdfViewerPageThemeMode: { type: String, default: 'theme' },
  forwardSyncRequest: { type: Object, default: null },
  pdfViewerZoomMode: { type: String, default: 'page-width' },
  pdfViewerSpreadMode: { type: String, default: 'single' },
  pdfViewerLastScale: { type: String, default: '' },
  restoreState: { type: Object, default: null },
})

const emit = defineEmits([
  'open-external',
  'reverse-sync-request',
  'reload-requested',
  'view-state-change',
  'restore-state-consumed',
])

const SEARCH_DEBOUNCE_MS = 140
const ZOOM_MENU_PRESET_VALUES = ['0.5', '0.75', '1', '1.25', '1.5', '2']

const { t } = useI18n()
const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const documentState = useDocumentState(() => props.documentId)
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
const surfaceRef = ref(null)
const pendingRestoreState = ref(null)
const initialLayoutHandled = ref(false)
const layoutNudge = ref(0)
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
const forwardSyncOverlays = ref([])
const queuedForwardSyncRequest = ref(null)
const shouldUseDarkPageTheme = computed(() =>
  String(props.pdfViewerPageThemeMode || '').trim().toLowerCase() !== 'light'
  && String(props.resolvedTheme || '').trim().toLowerCase() === 'dark'
)
const surfaceStyle = computed(() => ({
  '--pdf-layout-nudge': `${layoutNudge.value}px`,
}))

const PdfEmbedPageSyncBridge = defineComponent({
  name: 'PdfEmbedPageSyncBridge',
  props: {
    documentId: { type: String, required: true },
    pageIndex: { type: Number, required: true },
  },
  emits: ['page-double-click'],
  setup(syncProps, { emit: syncEmit }) {
    const { register } = usePointerHandlers({
      documentId: () => syncProps.documentId,
      pageIndex: () => syncProps.pageIndex,
    })

    watchEffect((onCleanup) => {
      const unregister = register({
        onDoubleClick: (pos, event) => {
          syncEmit('page-double-click', { pos, event })
        },
      })

      onCleanup(() => {
        unregister?.()
      })
    })

    return () => null
  },
})

let scheduledViewStateFrame = 0
let restoreRevision = 0
let searchDebounceTimer = 0
let suppressSearchWatch = false
let forwardSyncHighlightTimer = 0
let lastHandledForwardSyncRequestId = 0
let scheduledLayoutNudgeFrame = 0
let layoutNudgeResetFrame = 0

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

function captureSelectionTextContext() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { textBeforeSelection: '', textAfterSelection: '' }
  }

  const selection = window.getSelection?.() || document.getSelection?.()
  if (!selection?.anchorNode || selection.anchorNode.nodeType !== Node.TEXT_NODE) {
    return { textBeforeSelection: '', textAfterSelection: '' }
  }

  const text = String(selection.anchorNode.textContent || '')
  const offset = clamp(Number(selection.anchorOffset || 0), 0, text.length)
  return {
    textBeforeSelection: text.slice(0, offset),
    textAfterSelection: text.slice(offset),
  }
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

function resolveDocumentPageMeta(pageNumber) {
  const numericPageNumber = Number(pageNumber || 0)
  if (!Number.isInteger(numericPageNumber) || numericPageNumber < 1) return null

  const spreads = scroll.provides.value?.getSpreadPagesWithRotatedSize?.() || []
  for (const spreadPages of spreads) {
    const page = spreadPages.find((entry) => Number(entry?.index) + 1 === numericPageNumber)
    if (page) return page
  }
  return null
}

function clearForwardSyncHighlight() {
  forwardSyncOverlays.value = []
  queuedForwardSyncRequest.value = null
  if (forwardSyncHighlightTimer && typeof window !== 'undefined') {
    window.clearTimeout(forwardSyncHighlightTimer)
    forwardSyncHighlightTimer = 0
  }
}

function scheduleForwardSyncHighlightClear() {
  if (typeof window === 'undefined') return
  if (forwardSyncHighlightTimer) {
    window.clearTimeout(forwardSyncHighlightTimer)
  }
  forwardSyncHighlightTimer = window.setTimeout(() => {
    forwardSyncHighlightTimer = 0
    forwardSyncOverlays.value = []
  }, 1800)
}

function resolveForwardSyncPageCoordinates(record = {}, pageMeta = null) {
  const pageHeight = Number(pageMeta?.size?.height || 0)
  const pageX = Number(record.x)
  const pageY = Number(record.y)
  if (!Number.isFinite(pageHeight) || pageHeight <= 0 || !Number.isFinite(pageX) || !Number.isFinite(pageY)) {
    return null
  }

  return {
    x: Math.max(0, pageX),
    y: Math.min(pageHeight, Math.max(0, pageY)),
  }
}

function buildForwardSyncRect(record = {}, pageMeta = null) {
  const pageHeight = Number(pageMeta?.size?.height || 0)
  const h = Number(record.h)
  const v = Number(record.v)
  const width = Number(record.W)
  const height = Number(record.H)
  if (
    !Number.isFinite(pageHeight)
    || pageHeight <= 0
    || !Number.isFinite(h)
    || !Number.isFinite(v)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
  ) {
    return null
  }

  return {
    origin: {
      x: Math.max(0, h),
      y: Math.min(pageHeight, Math.max(0, v - height)),
    },
    size: {
      width: Math.max(0, width),
      height: Math.max(0, height),
    },
  }
}

function buildForwardSyncPointFallbackRect(record = {}, pageMeta = null) {
  const pageHeight = Number(pageMeta?.size?.height || 0)
  const x = Number(record.x)
  const y = Number(record.y)
  if (
    !Number.isFinite(pageHeight)
    || pageHeight <= 0
    || !Number.isFinite(x)
    || !Number.isFinite(y)
  ) {
    return null
  }

  const highlightWidth = 42
  const highlightHeight = 18
  return {
    origin: {
      x: Math.max(0, x - highlightWidth * 0.25),
      y: Math.min(pageHeight, Math.max(0, y - highlightHeight * 0.5)),
    },
    size: {
      width: highlightWidth,
      height: highlightHeight,
    },
  }
}

function expandForwardSyncOverlayRect(entry = {}) {
  const left = Number(entry.left || 0)
  const top = Number(entry.top || 0)
  const width = Number(entry.width || 0)
  const height = Number(entry.height || 0)

  const paddingX = Math.min(10, Math.max(3, width * 0.08))
  const paddingY = Math.min(4, Math.max(1.5, height * 0.08))

  return {
    ...entry,
    left: Math.max(0, left - paddingX),
    top: Math.max(0, top - paddingY),
    width: width + paddingX * 2,
    height: height + paddingY * 2,
  }
}

function shouldMergeForwardSyncOverlays(base = {}, candidate = {}) {
  const baseTop = Number(base.top || 0)
  const baseBottom = baseTop + Number(base.height || 0)
  const baseLeft = Number(base.left || 0)
  const baseRight = baseLeft + Number(base.width || 0)

  const candidateTop = Number(candidate.top || 0)
  const candidateBottom = candidateTop + Number(candidate.height || 0)
  const candidateLeft = Number(candidate.left || 0)
  const candidateRight = candidateLeft + Number(candidate.width || 0)

  const verticalOverlap = Math.min(baseBottom, candidateBottom) - Math.max(baseTop, candidateTop)
  const minHeight = Math.min(Number(base.height || 0), Number(candidate.height || 0))
  const verticalCenterDistance = Math.abs(
    (baseTop + baseBottom) * 0.5 - (candidateTop + candidateBottom) * 0.5,
  )
  const horizontalGap = Math.max(0, candidateLeft - baseRight, baseLeft - candidateRight)

  return (
    verticalOverlap >= Math.max(2, minHeight * 0.28)
    || verticalCenterDistance <= Math.max(6, minHeight * 0.42)
  ) && horizontalGap <= 28
}

function mergeForwardSyncOverlayEntries(entries = []) {
  const groupedByPage = new Map()
  for (const entry of entries) {
    const pageEntries = groupedByPage.get(entry.pageNumber) || []
    pageEntries.push(expandForwardSyncOverlayRect(entry))
    groupedByPage.set(entry.pageNumber, pageEntries)
  }

  const merged = []
  for (const [pageNumber, pageEntries] of groupedByPage.entries()) {
    const sortedEntries = [...pageEntries].sort((left, right) => {
      const topDelta = Number(left.top || 0) - Number(right.top || 0)
      if (Math.abs(topDelta) > 3) return topDelta
      return Number(left.left || 0) - Number(right.left || 0)
    })

    const mergedPageEntries = []
    for (const entry of sortedEntries) {
      const previousEntry = mergedPageEntries[mergedPageEntries.length - 1]
      if (!previousEntry || !shouldMergeForwardSyncOverlays(previousEntry, entry)) {
        mergedPageEntries.push({ ...entry })
        continue
      }

      const nextLeft = Math.min(previousEntry.left, entry.left)
      const nextTop = Math.min(previousEntry.top, entry.top)
      const nextRight = Math.max(previousEntry.left + previousEntry.width, entry.left + entry.width)
      const nextBottom = Math.max(previousEntry.top + previousEntry.height, entry.top + entry.height)

      previousEntry.left = nextLeft
      previousEntry.top = nextTop
      previousEntry.width = nextRight - nextLeft
      previousEntry.height = nextBottom - nextTop
    }

    merged.push(
      ...mergedPageEntries.map((entry, index) => ({
        key: `${pageNumber}:${index}:${Math.round(entry.left)}:${Math.round(entry.top)}`,
        pageNumber,
        style: {
          left: `${Math.max(0, entry.left)}px`,
          top: `${Math.max(0, entry.top)}px`,
          width: `${Math.max(8, entry.width)}px`,
          height: `${Math.max(8, entry.height)}px`,
        },
      })),
    )
  }

  return merged
}

function resolveForwardSyncRecordVerticalAnchor(record = {}) {
  const v = Number(record.v)
  if (Number.isFinite(v)) return v
  const y = Number(record.y)
  if (Number.isFinite(y)) return y
  return 0
}

function selectBoundaryForwardSyncRecords(records = [], sourceLocation = {}) {
  const semanticOrigin = String(sourceLocation?.semanticOrigin || '').trim()
  if (!Array.isArray(records) || records.length === 0) return []
  if (semanticOrigin !== 'environment-begin' && semanticOrigin !== 'environment-end') {
    return records
  }

  const sortedRecords = [...records].sort((left, right) => {
    const pageDelta = Number(left?.page || 0) - Number(right?.page || 0)
    if (pageDelta !== 0) return pageDelta
    return resolveForwardSyncRecordVerticalAnchor(left) - resolveForwardSyncRecordVerticalAnchor(right)
  })

  const clusters = []
  for (const record of sortedRecords) {
    const page = Number(record?.page || 0)
    const anchor = resolveForwardSyncRecordVerticalAnchor(record)
    const previousCluster = clusters[clusters.length - 1]

    if (
      !previousCluster
      || previousCluster.page !== page
      || Math.abs(anchor - previousCluster.maxAnchor) > 18
    ) {
      clusters.push({
        page,
        minAnchor: anchor,
        maxAnchor: anchor,
        records: [record],
      })
      continue
    }

    previousCluster.records.push(record)
    previousCluster.minAnchor = Math.min(previousCluster.minAnchor, anchor)
    previousCluster.maxAnchor = Math.max(previousCluster.maxAnchor, anchor)
  }

  if (clusters.length === 0) return records
  return semanticOrigin === 'environment-end'
    ? clusters[clusters.length - 1].records
    : clusters[0].records
}

function buildForwardSyncOverlayEntries(request = null) {
  const requestId = Number(request?.requestId || 0)
  const records = selectBoundaryForwardSyncRecords(
    Array.isArray(request?.target?.records) ? request.target.records : [],
    request?.target?.sourceLocation || {},
  )
  if (!Number.isInteger(requestId) || requestId < 1 || records.length === 0) return []

  const rawEntries = records
    .map((record, index) => {
      const pageNumber = Number(record?.page || 0)
      const pageMeta = resolveDocumentPageMeta(pageNumber)
      const pageBinding = resolvePageBinding(pageNumber)
      const rect = buildForwardSyncRect(record, pageMeta)
        || buildForwardSyncPointFallbackRect(record, pageMeta)
      if (!pageMeta || !pageBinding || !rect) return null

      const pageElement = pageBinding.element
      const renderedPageWidth = Number(pageElement?.offsetWidth || pageBinding.page?.width || 0)
      const renderedPageHeight = Number(pageElement?.offsetHeight || pageBinding.page?.height || 0)
      const rotatedPageSize = pageMeta.rotatedSize || pageMeta.size
      const basePageWidth = Number(rotatedPageSize?.width || pageMeta.size?.width || 0)
      const basePageHeight = Number(rotatedPageSize?.height || pageMeta.size?.height || 0)
      if (
        !Number.isFinite(renderedPageWidth)
        || !Number.isFinite(renderedPageHeight)
        || renderedPageWidth <= 0
        || renderedPageHeight <= 0
        || !Number.isFinite(basePageWidth)
        || !Number.isFinite(basePageHeight)
        || basePageWidth <= 0
        || basePageHeight <= 0
      ) {
        return null
      }

      const rotation = Number(pageMeta.rotation)
      const normalizedRotation = [Rotation.Degree0, Rotation.Degree90, Rotation.Degree180, Rotation.Degree270].includes(rotation)
        ? rotation
        : Rotation.Degree0
      const scale = renderedPageWidth / basePageWidth
      const rotatedRect = transformRect(
        pageMeta.size,
        rect,
        normalizedRotation,
        scale,
      )

      return {
        key: `${requestId}:${index}`,
        pageNumber,
        left: Math.max(0, rotatedRect.origin.x),
        top: Math.max(0, rotatedRect.origin.y),
        width: Math.max(4, rotatedRect.size.width),
        height: Math.max(4, rotatedRect.size.height),
      }
    })
    .filter(Boolean)

  return mergeForwardSyncOverlayEntries(rawEntries)
}

function resolveForwardSyncOverlays(pageNumber) {
  const numericPageNumber = Number(pageNumber || 0)
  return forwardSyncOverlays.value.filter((overlay) => overlay.pageNumber === numericPageNumber)
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

function clearScheduledLayoutNudge() {
  if (typeof window === 'undefined') return
  if (scheduledLayoutNudgeFrame) {
    window.cancelAnimationFrame(scheduledLayoutNudgeFrame)
    scheduledLayoutNudgeFrame = 0
  }
  if (layoutNudgeResetFrame) {
    window.cancelAnimationFrame(layoutNudgeResetFrame)
    layoutNudgeResetFrame = 0
  }
  layoutNudge.value = 0
}

function scheduleInitialLayoutNudge() {
  if (typeof window === 'undefined') return
  if (initialLayoutHandled.value || pageBindings.size > 0) return

  clearScheduledLayoutNudge()
  scheduledLayoutNudgeFrame = window.requestAnimationFrame(() => {
    scheduledLayoutNudgeFrame = window.requestAnimationFrame(() => {
      scheduledLayoutNudgeFrame = 0
      if (initialLayoutHandled.value || pageBindings.size > 0) return
      layoutNudge.value = 1
      layoutNudgeResetFrame = window.requestAnimationFrame(() => {
        layoutNudgeResetFrame = 0
        layoutNudge.value = 0
      })
    })
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
  const nextZoomLevel = clamp(safeCurrentZoomLevel * multiplier, 0.25, 2)

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

function resolveReverseSyncDetail(pageLayout, pos) {
  if (props.kind !== 'latex') return null

  const pageNumber = Number(pageLayout?.pageNumber || 0)
  const pdfX = Number(pos?.x)
  const pdfY = Number(pos?.y)

  if (
    !Number.isInteger(pageNumber)
    || pageNumber < 1
    || !Number.isFinite(pdfX)
    || !Number.isFinite(pdfY)
  ) {
    return null
  }

  return {
    page: pageNumber,
    pos: [pdfX, pdfY],
    ...captureSelectionTextContext(),
  }
}

async function handlePageDoubleClick(pageLayout, payload = {}) {
  if (props.kind !== 'latex') return

  await nextTick()
  if (typeof window !== 'undefined') {
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
  }

  const detail = resolveReverseSyncDetail(pageLayout, payload.pos)
  if (!detail) return
  emit('reverse-sync-request', detail)
}

async function applyForwardSyncRequest(request = null) {
  const requestId = Number(request?.requestId || 0)
  if (!Number.isInteger(requestId) || requestId < 1) return false

  const scopedRecords = selectBoundaryForwardSyncRecords(
    Array.isArray(request?.target?.records) ? request.target.records : [],
    request?.target?.sourceLocation || {},
  )
  const focusRecord = scopedRecords[0]
    || request?.target?.record
    || (Array.isArray(request?.target?.records) ? request.target.records[0] : null)
  const pageNumber = Number(focusRecord?.page || 0)
  const scrollScope = scroll.provides.value
  const pageMeta = resolveDocumentPageMeta(pageNumber)
  if (!focusRecord || !scrollScope || !pageMeta) return false

  const pageCoordinates = resolveForwardSyncPageCoordinates(focusRecord, pageMeta)
  if (!pageCoordinates) return false

  scrollScope.scrollToPage({
    pageNumber,
    pageCoordinates,
    behavior: 'smooth',
    alignY: 34,
  })

  await nextTick()
  if (typeof window !== 'undefined') {
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
  }

  const overlayEntries = buildForwardSyncOverlayEntries(request)
  if (overlayEntries.length === 0) {
    queuedForwardSyncRequest.value = request
    return false
  }

  forwardSyncOverlays.value = overlayEntries
  scheduleForwardSyncHighlightClear()
  scheduleViewStateEmission()
  return true
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
    clearScheduledLayoutNudge()
    pageBindings.clear()
    currentContextMenuReverseSyncDetail.value = null
    initialLayoutHandled.value = false
    clearForwardSyncHighlight()
    lastHandledForwardSyncRequestId = 0
    selectionActive.value = false
    selectedText.value = ''
    suppressSearchWatch = true
    searchQuery.value = ''
    searchUiVisible.value = false
    scheduleViewStateEmission()
    scheduleInitialLayoutNudge()
  }
)

watch(
  () => props.forwardSyncRequest,
  (nextRequest) => {
    const requestId = Number(nextRequest?.requestId || 0)
    if (!Number.isInteger(requestId) || requestId < 1 || requestId === lastHandledForwardSyncRequestId) {
      return
    }

    void applyForwardSyncRequest(nextRequest).then((applied) => {
      if (applied) {
        lastHandledForwardSyncRequestId = requestId
        queuedForwardSyncRequest.value = null
        return
      }
      queuedForwardSyncRequest.value = nextRequest
    })
  },
  { immediate: true }
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

      if (!initialLayoutHandled.value) {
        applyViewerPreferences()
        initialLayoutHandled.value = true
        clearScheduledLayoutNudge()
      }
      if (queuedForwardSyncRequest.value) {
        const queuedRequest = queuedForwardSyncRequest.value
        void applyForwardSyncRequest(queuedRequest).then((applied) => {
          if (!applied) return
          lastHandledForwardSyncRequestId = Number(queuedRequest?.requestId || 0)
          queuedForwardSyncRequest.value = null
        })
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

onUnmounted(() => {
  clearScheduledLayoutNudge()
  pageBindings.clear()
  clearSearchDebounceTimer()
  clearForwardSyncHighlight()

  if (scheduledViewStateFrame && typeof window !== 'undefined') {
    window.cancelAnimationFrame(scheduledViewStateFrame)
    scheduledViewStateFrame = 0
  }
})

onMounted(() => {
  scheduleInitialLayoutNudge()
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
  width: calc(100% - var(--pdf-layout-nudge, 0px));
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

.pdf-artifact-preview__surface.is-dark-page-theme :deep(.pdf-artifact-preview__thumbnail-image img) {
  filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88);
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

.pdf-artifact-preview__surface.is-dark-page-theme :deep(.pdf-artifact-preview__page canvas),
.pdf-artifact-preview__surface.is-dark-page-theme :deep(.pdf-artifact-preview__page img) {
  filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88);
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
  width: 94px;
  min-width: 94px;
}

:deep(.pdf-artifact-preview__toolbar .pdf-artifact-preview__toolbar-select .ui-select-trigger) {
  height: 28px;
  padding: 0 22px 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
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
  right: 8px;
}

.pdf-artifact-preview__forward-sync-highlight {
  position: absolute;
  z-index: 6;
  border-radius: 3px;
  border: 1px solid color-mix(in srgb, #c69a2d 48%, transparent);
  background: color-mix(in srgb, #f0d27a 34%, transparent);
  pointer-events: none;
  animation: pdf-forward-sync-highlight 1.35s ease-out forwards;
}


@keyframes pdf-forward-sync-highlight {
  0% {
    opacity: 0;
    transform: scale(0.995);
  }

  12% {
    opacity: 1;
    transform: scale(1);
  }

  72% {
    opacity: 0.78;
  }

  100% {
    opacity: 0;
    transform: scale(1.003);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pdf-artifact-preview__forward-sync-highlight {
    animation-duration: 0.01ms;
  }
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
