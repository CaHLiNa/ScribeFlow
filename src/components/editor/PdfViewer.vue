<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div class="relative flex-1 overflow-hidden">
      <iframe
        v-if="viewerSrc"
        ref="iframeRef"
        :src="viewerSrc"
        class="w-full h-full border-0"
        tabindex="0"
        style="display: block;"
        @focus="markPaneActive"
        @load="onIframeLoad"
      />

      <Transition name="pdf-annotation-overlay">
        <aside
          v-if="annotationsOpen"
          class="pdf-annotation-sidebar-shell"
        >
          <div class="pdf-annotation-sidebar-header">
            <div class="pdf-annotation-sidebar-title">{{ t('Highlights') }}</div>
            <button
              type="button"
              class="pdf-toolbar-btn"
              :title="t('Close')"
              @click="annotationsOpen = false"
            >
              <IconChevronRight :size="13" :stroke-width="1.8" />
            </button>
          </div>

          <div class="pdf-annotation-list">
            <div v-if="pendingSelection" class="pdf-annotation-pending">
              <div class="pdf-annotation-pending-label">{{ t('Selection ready') }}</div>
              <div class="pdf-annotation-pending-quote">{{ pendingSelection.quote }}</div>
              <button
                type="button"
                class="pdf-annotation-primary"
                @mousedown.prevent
                @click="createAnnotationFromSelection"
              >
                {{ t('Create highlight on page {page}', { page: pendingSelection.page }) }}
              </button>
            </div>

            <div
              v-if="currentPdfAnnotations.length === 0"
              class="pdf-annotation-empty"
            >
              <div>{{ t('No highlights yet') }}</div>
              <div class="pdf-annotation-empty-hint">
                {{ t('Select text in the PDF, then save it as a highlight.') }}
              </div>
            </div>

            <div
              v-for="annotation in currentPdfAnnotations"
              v-else
              :key="annotation.id"
              class="pdf-annotation-item"
              tabindex="0"
              :class="{ 'pdf-annotation-item-active': annotation.id === activeAnnotationId }"
              @click="focusAnnotation(annotation)"
              @keydown.enter.prevent="focusAnnotation(annotation)"
            >
              <div class="pdf-annotation-item-header">
                <span class="pdf-annotation-page">{{ t('Page {page}', { page: annotation.page }) }}</span>
                <span class="pdf-annotation-date">{{ formatAnnotationTimestamp(annotation.updatedAt || annotation.createdAt) }}</span>
              </div>
              <div class="pdf-annotation-quote">{{ annotation.quote }}</div>
              <div class="pdf-annotation-actions">
                <span class="pdf-annotation-open">{{ t('Jump to quote') }}</span>
                <button
                  type="button"
                  class="pdf-annotation-delete"
                  :title="t('Delete highlight')"
                  @click.stop="deleteAnnotation(annotation)"
                >
                  {{ t('Delete') }}
                </button>
              </div>
              <div class="pdf-annotation-note-shell" @click.stop>
                <button
                  v-if="!noteForAnnotation(annotation.id)"
                  type="button"
                  class="pdf-annotation-note-create"
                  @click="createNoteFromAnnotation(annotation)"
                >
                  {{ t('Create note') }}
                </button>
                <ResearchNoteCard
                  v-else
                  :note="noteForAnnotation(annotation.id)"
                  :annotation="annotation"
                  :is-active="noteForAnnotation(annotation.id)?.id === activeNoteId"
                  @update-comment="updateNoteComment(noteForAnnotation(annotation.id), $event)"
                  @insert="insertNoteIntoManuscript(annotation)"
                  @delete="deleteNote(noteForAnnotation(annotation.id))"
                />
              </div>
            </div>
          </div>
        </aside>
      </Transition>

      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        {{ t('Loading PDF...') }}
      </div>
      <div
        v-else-if="error"
        class="absolute inset-0 flex items-center justify-center px-6 text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        <div class="max-w-xl text-center">
          <div>{{ t('Could not load PDF') }}</div>
          <div v-if="error" class="mt-2 text-xs" style="word-break: break-word;">{{ error }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, toRef, watch } from 'vue'
import { IconChevronRight } from '@tabler/icons-vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '../../i18n'
import { useEditorStore } from '../../stores/editor'
import { useResearchArtifactsStore } from '../../stores/researchArtifacts'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { createPdfQuoteAnchor } from '../../services/pdfAnchors'
import ResearchNoteCard from './ResearchNoteCard.vue'

const emit = defineEmits(['dblclick-page'])

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  referenceKey: { type: String, default: '' },
})

const PDF_VIEWER_THEME_STYLE_ID = 'altals-pdf-viewer-theme'

const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const researchArtifactsStore = useResearchArtifactsStore()
const editorStore = useEditorStore()
const { t } = useI18n()
const filePathRef = toRef(props, 'filePath')

const iframeRef = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const error = ref(null)
const annotationsOpen = ref(false)
const pendingSelection = ref(null)

const pdfUi = reactive({
  ready: false,
  pageNumber: 1,
  pagesCount: 0,
  canGoPrevious: false,
  canGoNext: false,
  canZoomOut: false,
  canZoomIn: false,
  scaleValue: 'auto',
  scaleLabel: t('Automatic Zoom'),
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  searchResultText: '',
  searchHighlightAll: true,
  searchCaseSensitive: false,
  searchMatchDiacritics: false,
  searchEntireWord: false,
})

let syncTimer = null
let syncHighlightTimer = null
let activeSyncHighlightEl = null
let loadRequestId = 0
let iframeListenersAttached = false
let resolveViewerReady = null
let rejectViewerReady = null
let viewerReadyPromise = null
let annotationRenderScheduled = false
let annotationMutationObserver = null
let pendingScrollLocation = null

const LIGHT_THEMES = new Set(['light', 'one-light', 'humane', 'solarized'])
const isDark = computed(() => !LIGHT_THEMES.has(workspace.theme))
const disableCanvasFilters = typeof navigator !== 'undefined'
  && /mac|iphone|ipad/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`)
const currentPdfAnnotations = computed(() => (
  filePathRef.value ? researchArtifactsStore.annotationsForPdf(filePathRef.value) : []
))
const activeAnnotationId = computed(() => researchArtifactsStore.activeAnnotationId || null)
const activeNoteId = computed(() => researchArtifactsStore.activeNoteId || null)

function localizeScaleLabel(label) {
  const normalized = String(label || '').trim()
  if (!normalized) return normalized
  if (normalized === 'Automatic Zoom') return t('Automatic Zoom')
  if (normalized === 'Actual Size') return t('Actual Size')
  if (normalized === 'Page Fit') return t('Page Fit')
  if (normalized === 'Page Width') return t('Page Width')
  return normalized
}

function resetPdfUi() {
  pdfUi.ready = false
  pdfUi.pageNumber = 1
  pdfUi.pagesCount = 0
  pdfUi.canGoPrevious = false
  pdfUi.canGoNext = false
  pdfUi.canZoomOut = false
  pdfUi.canZoomIn = false
  pdfUi.scaleValue = 'auto'
  pdfUi.scaleLabel = t('Automatic Zoom')
  pdfUi.sidebarOpen = false
  pdfUi.searchOpen = false
  pdfUi.searchQuery = ''
  pdfUi.searchResultText = ''
  pdfUi.searchHighlightAll = true
  pdfUi.searchCaseSensitive = false
  pdfUi.searchMatchDiacritics = false
  pdfUi.searchEntireWord = false
}

function clearSyncTimer() {
  if (!syncTimer) return
  window.clearInterval(syncTimer)
  syncTimer = null
}

function clearSyncHighlight() {
  if (syncHighlightTimer) {
    window.clearTimeout(syncHighlightTimer)
    syncHighlightTimer = null
  }
  activeSyncHighlightEl?.remove()
  activeSyncHighlightEl = null
}

function resetViewerReadyPromise() {
  viewerReadyPromise = new Promise((resolve, reject) => {
    resolveViewerReady = resolve
    rejectViewerReady = reject
  })
}

function getPdfWindow() {
  return iframeRef.value?.contentWindow || null
}

function getPdfDocument() {
  return iframeRef.value?.contentDocument || null
}

function getPdfApp() {
  return getPdfWindow()?.PDFViewerApplication || null
}

function getPdfElement(...ids) {
  const doc = getPdfDocument()
  if (!doc) return null
  for (const id of ids) {
    const element = doc.getElementById(id)
    if (element) return element
  }
  return null
}

function getViewerRoot() {
  return getPdfElement('viewer') || getPdfDocument()?.querySelector('.pdfViewer') || null
}

function getViewerSelection() {
  try {
    return getPdfWindow()?.getSelection?.() || null
  } catch {
    return null
  }
}

function getPageView(pageNumber) {
  const viewer = getPdfApp()?.pdfViewer
  const targetPage = Number(pageNumber)
  if (!viewer || !Number.isInteger(targetPage) || targetPage < 1) return null
  if (typeof viewer.getPageView === 'function') {
    return viewer.getPageView(targetPage - 1) || null
  }
  return viewer._pages?.[targetPage - 1] || null
}

function getPageHeightInPdfPoints(pageView) {
  const rawHeight = Number(pageView?.viewport?.rawDims?.pageHeight)
  if (Number.isFinite(rawHeight) && rawHeight > 0) return rawHeight

  const viewBox = pageView?.pdfPage?.view
  if (Array.isArray(viewBox) && viewBox.length >= 4) {
    const height = Number(viewBox[3]) - Number(viewBox[1])
    if (Number.isFinite(height) && height > 0) return height
  }

  return null
}

function clickPdfElement(...ids) {
  const element = getPdfElement(...ids)
  if (!element || element.disabled) return false
  element.click()
  syncPdfUi()
  return true
}

function normalizeScaleOptions(select) {
  const options = Array.from(select?.options || [])
    .filter(option => option.value)
    .map(option => ({
      value: option.value,
      label: localizeScaleLabel(option.textContent),
    }))
  const customOption = options.find(option => option.value === 'custom')
  if (customOption && customOption.label) return options
  return options.filter(option => option.value !== 'custom')
}

function clearIframePointerGuards() {
  document.getElementById('resize-drag-iframe-block')?.remove()
  document.getElementById('split-drag-iframe-block')?.remove()
  iframeRef.value?.style?.setProperty('pointer-events', 'auto')
}

function readAppCssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function markPaneActive() {
  editorStore.setActivePane(props.paneId)
}

function createToolbarStyleText() {
  const bgPrimary = readAppCssVar('--bg-primary', isDark.value ? '#2c313c' : '#ffffff')
  const bgSecondary = readAppCssVar('--bg-secondary', isDark.value ? '#343b47' : '#f3f6fb')
  const bgHover = readAppCssVar('--bg-hover', isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)')
  const border = readAppCssVar('--border', isDark.value ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.26)')
  const fgPrimary = readAppCssVar('--fg-primary', isDark.value ? '#f7f9fc' : '#1f2937')
  const fgSecondary = readAppCssVar('--fg-secondary', isDark.value ? '#c7d0dc' : '#4b5563')
  const fgMuted = readAppCssVar('--fg-muted', isDark.value ? '#8b98ab' : '#6b7280')
  const accent = readAppCssVar('--accent', '#60a5fa')
  const shadow = isDark.value
    ? '0 10px 26px rgba(15, 23, 42, 0.32)'
    : '0 10px 26px rgba(15, 23, 42, 0.10)'

  const pageThemeCss = workspace.pdfThemedPages
    ? (isDark.value
      ? `
      .page {
        background: color-mix(in srgb, #111827 82%, #343b47) !important;
        box-shadow: 0 0 0 1px rgba(100, 116, 139, 0.24), 0 12px 28px rgba(15, 23, 42, 0.26) !important;
      }
      .page canvas {
        filter: ${disableCanvasFilters ? 'none' : 'invert(0.86) hue-rotate(180deg) brightness(0.98) contrast(0.88) saturate(0.78)'} !important;
      }
    `
      : `
      .page {
        background: color-mix(in srgb, #f8fafc 80%, #efe6d8) !important;
        box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.24), 0 8px 18px rgba(15, 23, 42, 0.06) !important;
      }
      .page canvas {
        filter: ${disableCanvasFilters ? 'none' : 'brightness(0.96) contrast(0.92) sepia(0.1) saturate(0.86)'} !important;
      }
    `)
    : ''

  return `
    :root {
      --toolbar-height: 24px;
      --toolbar-vertical-padding: 0px;
      --toolbar-horizontal-padding: 6px;
      --main-color: ${fgPrimary};
      --toolbar-bg-color: ${bgSecondary};
      --sidebar-toolbar-bg-color: ${bgSecondary};
      --toolbar-border-color: ${border};
      --toolbar-border-bottom: 1px solid ${border};
      --toolbar-box-shadow: none;
      --toolbarSidebar-box-shadow: none;
      --toolbarSidebar-border-bottom: 1px solid ${border};
      --toolbar-icon-bg-color: ${fgSecondary};
      --toolbar-icon-hover-bg-color: ${fgPrimary};
      --button-hover-color: ${bgHover};
      --separator-color: ${border};
      --toggled-btn-color: ${fgPrimary};
      --toggled-btn-bg-color: color-mix(in srgb, ${accent} 16%, ${bgPrimary});
      --dropdown-btn-bg-color: ${bgPrimary};
      --field-color: ${fgPrimary};
      --field-bg-color: ${bgPrimary};
      --field-border-color: ${border};
      --doorhanger-bg-color: ${bgSecondary};
      --doorhanger-border-color: ${border};
      --doorhanger-hover-color: ${fgPrimary};
      --doorhanger-separator-color: ${border};
    }

    body {
      background-color: ${bgSecondary};
    }

    #toolbarContainer,
    #toolbarSidebar {
      background-color: ${bgSecondary} !important;
    }

    #toolbarContainer {
      padding: 0 6px;
    }

    #toolbarContainer #toolbarViewer {
      align-items: center;
    }

    #toolbarViewerLeft,
    #toolbarViewerMiddle,
    #toolbarViewerRight {
      align-items: center;
      gap: 6px;
    }

    .toolbarButton,
    .toolbarButtonWithContainer {
      height: 20px;
    }

    .toolbarButton {
      width: 20px;
      border-radius: 6px;
      border: 1px solid transparent;
    }

    .toolbarButtonWithContainer {
      height: 20px;
    }

    .toolbarButton::before {
      width: 14px;
      height: 14px;
    }

    .toolbarField {
      height: 20px;
      padding: 0 8px;
      border-radius: 6px;
      background-color: color-mix(in srgb, ${bgPrimary} 82%, ${bgSecondary});
      border-color: ${border};
      color: ${fgPrimary};
      font-size: 11px;
      line-height: 1;
    }

    .toolbarField::placeholder {
      color: ${fgMuted};
    }

    .toolbarButton:is(:hover,:focus-visible) {
      background-color: ${bgHover};
    }

    .toolbarButton.toggled {
      color: ${accent};
      border-color: color-mix(in srgb, ${accent} 35%, transparent);
      background-color: color-mix(in srgb, ${accent} 14%, transparent);
    }

    .toolbarButton.toggled::before {
      background-color: ${accent};
    }

    .toolbarButtonSpacer {
      width: 1px !important;
      height: 12px !important;
      background: color-mix(in srgb, ${border} 85%, transparent);
    }

    .splitToolbarButtonSeparator {
      height: 12px;
      align-self: center;
      opacity: 1;
    }

    #pageNumber {
      width: 36px;
      text-align: center;
      font-size: 11px;
      font-weight: 600;
    }

    #numPages,
    .toolbarLabel,
    #findResultsCount,
    #findMsg {
      color: ${fgSecondary};
      font-size: 11px;
    }

    #scaleSelectContainer {
      height: 20px;
      min-width: 120px;
      overflow: hidden;
      border: 1px solid ${border};
      border-radius: 6px;
      background-color: color-mix(in srgb, ${bgPrimary} 82%, ${bgSecondary});
    }

    #scaleSelect {
      height: 100%;
      padding-inline: 8px 24px;
      border: 0;
      background: transparent;
      color: ${fgPrimary};
      font-size: 11px;
    }

    #findbar {
      margin-top: 8px;
      min-width: 360px;
      max-width: calc(100vw - 16px);
      border: 1px solid ${border};
      border-radius: 10px;
      background-color: ${bgSecondary};
      box-shadow: ${shadow};
    }

    #findbar #findInputContainer {
      margin-inline-start: 0;
    }

    #findbar #findInput {
      width: 200px;
      color: ${fgPrimary};
    }

    #findbar #findbarMessageContainer {
      gap: 6px;
    }

    #findbar #findResultsCount {
      color: ${fgMuted};
      background: transparent;
      padding-inline: 0;
    }

    #findbar .toggleButton {
      display: inline-flex;
      align-items: center;
      padding-inline: 8px;
    }

    #findbar .toggleButton:has(> input:checked) {
      background-color: color-mix(in srgb, ${accent} 14%, ${bgPrimary});
      color: ${fgPrimary};
    }

    #findbar .toggleButton:is(:hover, :has(> input:focus-visible)) {
      background-color: ${bgHover};
      color: ${fgPrimary};
    }

    #secondaryToolbar,
    .toolbarButtonWithContainer .editorParamsToolbar,
    #findbar {
      border-radius: 10px;
      box-shadow: ${shadow};
    }

    ${pageThemeCss}
  `
}

function applyTheme() {
  const doc = getPdfDocument()
  if (!doc?.documentElement || !doc.head) return

  doc.documentElement.style.setProperty('color-scheme', isDark.value ? 'dark' : 'light')

  let style = doc.getElementById(PDF_VIEWER_THEME_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = PDF_VIEWER_THEME_STYLE_ID
    doc.head.appendChild(style)
  }

  style.textContent = createToolbarStyleText()
}

function syncPdfUi() {
  const app = getPdfApp()
  const doc = getPdfDocument()
  if (!app?.pdfViewer || !doc) return

  const previousButton = doc.getElementById('previous')
  const nextButton = doc.getElementById('next')
  const zoomOutButton = doc.getElementById('zoomOutButton')
  const zoomInButton = doc.getElementById('zoomInButton')
  const scaleSelect = doc.getElementById('scaleSelect')
  const findResultsCount = doc.getElementById('findResultsCount')
  const findMsg = doc.getElementById('findMsg')
  const findbar = doc.getElementById('findbar')
  const findInput = doc.getElementById('findInput')
  const findHighlightAll = doc.getElementById('findHighlightAll')
  const findMatchCase = doc.getElementById('findMatchCase')
  const findMatchDiacritics = doc.getElementById('findMatchDiacritics')
  const findEntireWord = doc.getElementById('findEntireWord')
  const toggleButton = doc.getElementById('viewsManagerToggleButton')
  const viewsManager = app.viewsManager

  pdfUi.ready = true
  pdfUi.pageNumber = Number(app.page || 1)
  pdfUi.pagesCount = Number(app.pagesCount || 0)
  pdfUi.canGoPrevious = !!previousButton && !previousButton.disabled
  pdfUi.canGoNext = !!nextButton && !nextButton.disabled
  pdfUi.canZoomOut = !!zoomOutButton && !zoomOutButton.disabled
  pdfUi.canZoomIn = !!zoomInButton && !zoomInButton.disabled
  pdfUi.sidebarOpen = typeof viewsManager?.isOpen === 'boolean'
    ? viewsManager.isOpen
    : toggleButton?.getAttribute('aria-expanded') === 'true'
  pdfUi.searchOpen = !!findbar && !findbar.classList.contains('hidden')
  pdfUi.searchQuery = findInput?.value || ''
  pdfUi.searchHighlightAll = !!findHighlightAll?.checked
  pdfUi.searchCaseSensitive = !!findMatchCase?.checked
  pdfUi.searchMatchDiacritics = !!findMatchDiacritics?.checked
  pdfUi.searchEntireWord = !!findEntireWord?.checked
  pdfUi.searchResultText = [findResultsCount?.textContent, findMsg?.textContent]
    .map(value => (value || '').trim())
    .filter(Boolean)
    .join(' ')

  if (scaleSelect) {
    pdfUi.scaleValue = scaleSelect.value || 'auto'
    pdfUi.scaleLabel = localizeScaleLabel(scaleSelect.options[scaleSelect.selectedIndex]?.textContent) || pdfUi.scaleLabel
  }
}

function dispatchPdfEvent(type, detail = {}) {
  const app = getPdfApp()
  if (!app?.eventBus) return
  app.eventBus.dispatch(type, { source: app, ...detail })
  syncPdfUi()
}

function openSearch() {
  const doc = getPdfDocument()
  const findbar = doc?.getElementById('findbar')
  if (findbar?.classList.contains('hidden')) {
    clickPdfElement('viewFindButton')
  }
  syncPdfUi()
  window.requestAnimationFrame(() => {
    doc?.getElementById('findInput')?.focus()
  })
}

function closeSearch() {
  const findbar = getPdfElement('findbar')
  if (findbar && !findbar.classList.contains('hidden')) {
    clickPdfElement('viewFindButton')
  }
  pdfUi.searchOpen = false
}

function toggleSearch() {
  if (pdfUi.searchOpen) {
    closeSearch()
    return
  }
  openSearch()
}

function roundRectValue(value) {
  return Math.round(Number(value || 0) * 10000) / 10000
}

function normalizeSelectionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvePageElement(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  return element?.closest?.('.page[data-page-number]') || null
}

function normalizeRectToPage(clientRect, pageRect) {
  const pageWidth = Math.max(Number(pageRect?.width || 0), 1)
  const pageHeight = Math.max(Number(pageRect?.height || 0), 1)
  const left = Math.max(0, Number(clientRect?.left || 0) - pageRect.left)
  const top = Math.max(0, Number(clientRect?.top || 0) - pageRect.top)
  const right = Math.min(pageWidth, Number(clientRect?.right || 0) - pageRect.left)
  const bottom = Math.min(pageHeight, Number(clientRect?.bottom || 0) - pageRect.top)
  const width = right - left
  const height = bottom - top

  if (width < 1 || height < 1) return null

  return {
    left: roundRectValue(left / pageWidth),
    top: roundRectValue(top / pageHeight),
    width: roundRectValue(width / pageWidth),
    height: roundRectValue(height / pageHeight),
  }
}

function extractQuoteContext(pageText, quote) {
  const normalizedPageText = normalizeSelectionText(pageText)
  const normalizedQuote = normalizeSelectionText(quote)
  if (!normalizedPageText || !normalizedQuote) {
    return { prefix: '', suffix: '' }
  }

  const quoteIndex = normalizedPageText.indexOf(normalizedQuote)
  if (quoteIndex === -1) {
    return { prefix: '', suffix: '' }
  }

  const prefixStart = Math.max(0, quoteIndex - 120)
  const suffixStart = quoteIndex + normalizedQuote.length

  return {
    prefix: normalizedPageText.slice(prefixStart, quoteIndex).trim(),
    suffix: normalizedPageText.slice(suffixStart, suffixStart + 120).trim(),
  }
}

function convertPageOffsetToSyncTexPoint(pageNumber, x, y) {
  const pageView = getPageView(pageNumber)
  if (!pageView?.getPagePoint) return null

  const localX = Number(x)
  const localY = Number(y)
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null

  const [pdfX, pdfY] = pageView.getPagePoint(localX, localY)
  const pageHeight = getPageHeightInPdfPoints(pageView)
  if (!Number.isFinite(pdfX) || !Number.isFinite(pdfY) || !Number.isFinite(pageHeight)) {
    return null
  }

  return {
    x: pdfX,
    y: pageHeight - pdfY,
    pdfX,
    pdfY,
    pageHeight,
  }
}

function convertSyncTexPointToPageOffset(pageNumber, x, y) {
  const pageView = getPageView(pageNumber)
  const pageElement = pageView?.div
  if (!pageView?.viewport || !pageElement) return null

  const xCoord = Number(x)
  const yCoord = Number(y)
  const pageHeight = getPageHeightInPdfPoints(pageView)
  if (!Number.isFinite(xCoord) || !Number.isFinite(yCoord) || !Number.isFinite(pageHeight)) {
    return null
  }

  const [localX, localY] = pageView.viewport.convertToViewportPoint(xCoord, pageHeight - yCoord)
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null

  return {
    pageView,
    pageElement,
    x: localX,
    y: localY,
  }
}

function buildSelectionRect(range, pageElement, pageNumber) {
  const pageRect = pageElement?.getBoundingClientRect?.()
  if (!pageRect) return null

  const normalizedRects = Array.from(range.getClientRects())
    .map((rect) => normalizeRectToPage(rect, pageRect))
    .filter(Boolean)

  if (normalizedRects.length === 0) {
    const fallbackRect = normalizeRectToPage(range.getBoundingClientRect(), pageRect)
    if (fallbackRect) normalizedRects.push(fallbackRect)
  }

  if (normalizedRects.length === 0) return null

  const bounds = normalizedRects.reduce((acc, rect) => {
    const right = rect.left + rect.width
    const bottom = rect.top + rect.height
    return {
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, right),
      bottom: Math.max(acc.bottom, bottom),
    }
  }, {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: 0,
    bottom: 0,
  })

  const pageWidth = Math.max(Number(pageRect.width || 0), 1)
  const pageHeight = Math.max(Number(pageRect.height || 0), 1)
  const localX = ((bounds.left + (bounds.right - bounds.left) / 2) * pageWidth)
  const localY = ((bounds.top + (bounds.bottom - bounds.top) / 2) * pageHeight)
  const focusPoint = convertPageOffsetToSyncTexPoint(pageNumber, localX, localY)

  return {
    rects: normalizedRects,
    bounds: {
      left: roundRectValue(bounds.left),
      top: roundRectValue(bounds.top),
      width: roundRectValue(bounds.right - bounds.left),
      height: roundRectValue(bounds.bottom - bounds.top),
    },
    focusPoint: focusPoint
      ? {
        x: focusPoint.x,
        y: focusPoint.y,
      }
      : null,
  }
}

function clearPendingSelection({ clearDomSelection = false } = {}) {
  pendingSelection.value = null
  if (!clearDomSelection) return
  try {
    getViewerSelection()?.removeAllRanges?.()
  } catch {}
}

function capturePendingSelection(showFeedback = true) {
  const selection = getViewerSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    clearPendingSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement
  if (!commonNode || !getViewerRoot()?.contains(commonNode)) {
    clearPendingSelection()
    return
  }

  const pageElement = resolvePageElement(range.startContainer)
  const endPageElement = resolvePageElement(range.endContainer)
  const quote = normalizeSelectionText(selection.toString())

  if (!quote) {
    clearPendingSelection()
    return
  }

  if (!pageElement || !endPageElement || pageElement !== endPageElement) {
    clearPendingSelection()
    if (showFeedback) {
      toastStore.showOnce(
        `pdf-selection:${filePathRef.value}:single-page`,
        t('Please keep PDF highlights within a single page.'),
        { type: 'error', duration: 3500 },
        5000,
      )
    }
    return
  }

  const pageNumber = Number(pageElement.dataset.pageNumber || 0)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    clearPendingSelection()
    return
  }

  const { prefix, suffix } = extractQuoteContext(pageElement.textContent || '', quote)
  pendingSelection.value = {
    page: pageNumber,
    quote,
    prefix,
    suffix,
    selectionRect: buildSelectionRect(range, pageElement, pageNumber),
  }
}

function handleViewerSelectionChange() {
  const selection = getViewerSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    clearPendingSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement
  if (!commonNode || !getViewerRoot()?.contains(commonNode)) {
    clearPendingSelection()
  }
}

function handleViewerMouseUp() {
  window.requestAnimationFrame(() => {
    capturePendingSelection(true)
  })
}

function openAnnotationsPanel() {
  annotationsOpen.value = true
}

function showSyncHighlight(pageNumber, x, y) {
  clearSyncHighlight()

  const pageOffset = convertSyncTexPointToPageOffset(pageNumber, x, y)
  if (!pageOffset?.pageElement) return

  const highlight = getPdfDocument()?.createElement('div')
  if (!highlight) return
  highlight.className = 'altals-pdf-sync-highlight'
  highlight.style.left = `${pageOffset.x}px`
  highlight.style.top = `${pageOffset.y}px`
  pageOffset.pageElement.appendChild(highlight)
  activeSyncHighlightEl = highlight
  syncHighlightTimer = window.setTimeout(() => {
    clearSyncHighlight()
  }, 1450)
}

function focusAnnotation(annotation) {
  if (!annotation) return
  researchArtifactsStore.setActiveAnnotation(annotation.id)
  clearPendingSelection({ clearDomSelection: true })

  const focusPoint = annotation.anchor?.selectionRect?.focusPoint
  if (Number.isFinite(focusPoint?.x) && Number.isFinite(focusPoint?.y)) {
    scrollToLocation(annotation.page, focusPoint.x, focusPoint.y)
    return
  }

  scrollToPage(annotation.page)
}

function noteForAnnotation(annotationId) {
  return researchArtifactsStore.noteForAnnotation(annotationId)
}

function createNoteFromAnnotation(annotation) {
  if (!annotation?.id) return null
  const existing = noteForAnnotation(annotation.id)
  if (existing) {
    researchArtifactsStore.setActiveNote(existing.id)
    return existing
  }

  const note = researchArtifactsStore.createResearchNote({
    sourceAnnotationId: annotation.id,
    quote: annotation.quote,
    comment: '',
    sourceRef: {
      type: 'pdf_annotation',
      annotationId: annotation.id,
      referenceKey: annotation.referenceKey || props.referenceKey || null,
      pdfPath: annotation.pdfPath || filePathRef.value,
      page: annotation.page,
    },
  })
  researchArtifactsStore.setActiveNote(note.id)
  toastStore.show(t('Created note from page {page}', { page: annotation.page }), {
    type: 'success',
    duration: 2200,
  })
  return note
}

function updateNoteComment(note, comment) {
  if (!note?.id) return
  researchArtifactsStore.updateResearchNote(note.id, { comment })
}

function deleteNote(note) {
  if (!note?.id) return
  researchArtifactsStore.removeResearchNote(note.id)
  toastStore.show(t('Note deleted'), {
    type: 'success',
    duration: 2000,
  })
}

function insertNoteIntoManuscript(annotation) {
  if (!annotation?.id) return
  const note = noteForAnnotation(annotation.id) || createNoteFromAnnotation(annotation)
  if (!note) return

  const result = editorStore.insertResearchNoteIntoManuscript(note, annotation)
  if (!result?.ok) {
    toastStore.show(
      t('Open a text manuscript in another pane to insert this note.'),
      { type: 'error', duration: 4200 },
    )
    return
  }

  researchArtifactsStore.updateResearchNote(note.id, {
    insertedInto: {
      path: result.path,
      paneId: result.paneId,
      viewerType: result.viewerType,
      insertedAt: new Date().toISOString(),
    },
  })
  researchArtifactsStore.setActiveNote(note.id)
  toastStore.show(t('Inserted note into {name}', {
    name: result.path.split('/').pop() || result.path,
  }), {
    type: 'success',
    duration: 2600,
  })
}

function deleteAnnotation(annotation) {
  if (!annotation?.id) return
  researchArtifactsStore.removeAnnotation(annotation.id)
  toastStore.show(t('Highlight deleted'), {
    type: 'success',
    duration: 2200,
  })
  scheduleRenderAnnotationHighlights()
}

async function createAnnotationFromSelection() {
  const selection = pendingSelection.value
  if (!selection || !filePathRef.value) return

  const anchor = createPdfQuoteAnchor({
    pdfPath: filePathRef.value,
    referenceKey: props.referenceKey || null,
    page: selection.page,
    quote: selection.quote,
    prefix: selection.prefix,
    suffix: selection.suffix,
    selectionRect: selection.selectionRect,
  })

  const annotation = researchArtifactsStore.createAnnotation({
    pdfPath: filePathRef.value,
    referenceKey: props.referenceKey || null,
    page: selection.page,
    quote: selection.quote,
    anchor,
  })

  researchArtifactsStore.setActiveAnnotation(annotation.id)
  clearPendingSelection({ clearDomSelection: true })
  openAnnotationsPanel()
  await nextTick()
  scheduleRenderAnnotationHighlights()
  focusAnnotation(annotation)
  toastStore.show(t('Saved highlight on page {page}', { page: annotation.page }), {
    type: 'success',
    duration: 2400,
  })
}

function formatAnnotationTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function clearRenderedAnnotationHighlights() {
  getPdfDocument()
    ?.querySelectorAll?.('.altals-pdf-annotation-highlight')
    ?.forEach((element) => element.remove())
}

function renderAnnotationHighlights() {
  clearRenderedAnnotationHighlights()
  const doc = getPdfDocument()
  if (!doc || loading.value) return

  currentPdfAnnotations.value.forEach((annotation) => {
    const rects = annotation.anchor?.selectionRect?.rects
    if (!Array.isArray(rects) || rects.length === 0) return

    const pageNumber = Number(annotation.page || annotation.anchor?.page || 0)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return

    const pageElement = doc.querySelector(`.page[data-page-number="${pageNumber}"]`)
    if (!pageElement) return

    rects.forEach((rect) => {
      if (
        !Number.isFinite(rect?.left) ||
        !Number.isFinite(rect?.top) ||
        !Number.isFinite(rect?.width) ||
        !Number.isFinite(rect?.height)
      ) return
      const highlight = doc.createElement('div')
      highlight.className = 'altals-pdf-annotation-highlight'
      if (annotation.id === activeAnnotationId.value) {
        highlight.classList.add('altals-pdf-annotation-highlight-active')
      }
      highlight.dataset.annotationId = annotation.id
      highlight.style.left = `${rect.left * 100}%`
      highlight.style.top = `${rect.top * 100}%`
      highlight.style.width = `${rect.width * 100}%`
      highlight.style.height = `${rect.height * 100}%`
      pageElement.appendChild(highlight)
    })
  })
}

function scheduleRenderAnnotationHighlights() {
  if (annotationRenderScheduled) return
  annotationRenderScheduled = true
  window.requestAnimationFrame(() => {
    annotationRenderScheduled = false
    renderAnnotationHighlights()
  })
}

function isHighlightOnlyMutation(record) {
  const nodes = [
    ...Array.from(record.addedNodes || []),
    ...Array.from(record.removedNodes || []),
  ]
  return nodes.length > 0 && nodes.every((node) => (
    node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('altals-pdf-annotation-highlight')
  ))
}

function attachAnnotationMutationObserver() {
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null

  const viewerRoot = getViewerRoot()
  if (typeof MutationObserver !== 'function' || !viewerRoot) return

  annotationMutationObserver = new MutationObserver((records) => {
    if (records.every(isHighlightOnlyMutation)) return
    scheduleRenderAnnotationHighlights()
  })
  annotationMutationObserver.observe(viewerRoot, {
    childList: true,
    subtree: true,
  })
}

function handleIframeDoubleClick(event) {
  const pageElement = event.target?.closest?.('.page[data-page-number]')
  if (!pageElement) return

  const page = Number(pageElement.dataset.pageNumber || 0)
  const rect = pageElement.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  const syncTexPoint = convertPageOffsetToSyncTexPoint(page, localX, localY)
  emit('dblclick-page', {
    page,
    x: syncTexPoint?.x ?? localX,
    y: syncTexPoint?.y ?? localY,
  })
}

function scrollToPage(pageNumber) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const app = getPdfApp()
  if (!app?.pdfLinkService?.goToPage) {
    pendingScrollLocation = { pageNumber: targetPage, x: null, y: null }
    return
  }

  app.pdfLinkService.goToPage(targetPage)
}

function applyPendingScrollLocation() {
  if (!pendingScrollLocation) return
  const nextLocation = pendingScrollLocation
  pendingScrollLocation = null
  scrollToLocation(nextLocation.pageNumber, nextLocation.x, nextLocation.y)
}

function scrollToLocation(pageNumber, x, y) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const app = getPdfApp()
  const container = getPdfElement('viewerContainer')
  if (!app?.pdfViewer || !container) {
    pendingScrollLocation = { pageNumber: targetPage, x, y }
    scrollToPage(targetPage)
    return
  }

  pendingScrollLocation = null
  const pageOffset = convertSyncTexPointToPageOffset(targetPage, x, y)
  if (pageOffset?.pageElement) {
    const targetTop = pageOffset.pageElement.offsetTop + pageOffset.y - container.clientHeight / 2
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const clampedTop = Math.min(Math.max(0, targetTop), maxScrollTop)

    container.scrollTo({
      top: clampedTop,
      behavior: 'auto',
    })
    showSyncHighlight(targetPage, x, y)
  } else if (typeof app.pdfLinkService?.goToPage === 'function') {
    app.pdfLinkService.goToPage(targetPage)
  }
  syncPdfUi()
}

async function onIframeLoad() {
  const win = getPdfWindow()
  const app = getPdfApp()
  if (!win || !app) {
    rejectViewerReady?.(new Error('PDF viewer failed to initialize'))
    return
  }

  try {
    if (app.initializedPromise) {
      await app.initializedPromise
    }
  } catch (loadError) {
    rejectViewerReady?.(loadError)
    return
  }

  applyTheme()
  clearIframePointerGuards()
  syncPdfUi()
  clearSyncTimer()
  clearSyncHighlight()
  syncTimer = window.setInterval(syncPdfUi, 250)

  if (!iframeListenersAttached) {
    try {
      const doc = win.document
      doc.addEventListener('dblclick', handleIframeDoubleClick)
      doc.addEventListener('mouseup', handleViewerMouseUp)
      doc.addEventListener('selectionchange', handleViewerSelectionChange)
      doc.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
          event.preventDefault()
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: event.key,
            code: event.code,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            bubbles: true,
            cancelable: true,
          }))
          return
        }

        if ((event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 'f') {
          event.preventDefault()
          openSearch()
          return
        }

        if (event.key === 'Escape' && pdfUi.searchOpen) {
          event.preventDefault()
          closeSearch()
        }
      })
      iframeListenersAttached = true
    } catch {}
  }

  attachAnnotationMutationObserver()
  scheduleRenderAnnotationHighlights()
  resolveViewerReady?.(app)
}

async function loadPdf() {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = null
  clearSyncTimer()
  clearSyncHighlight()
  resetPdfUi()
  clearPendingSelection({ clearDomSelection: true })
  clearRenderedAnnotationHighlights()
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null
  iframeListenersAttached = false

  try {
    const bytes = await invoke('read_file_binary', { path: filePathRef.value })
    if (requestId !== loadRequestId) return
    const uint8Array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    resetViewerReadyPromise()
    viewerSrc.value = `/pdfjs-viewer/web/viewer.html?instance=${requestId}`
    const app = await viewerReadyPromise
    if (requestId !== loadRequestId) return
    await app.open({ data: uint8Array })
    if (requestId !== loadRequestId) {
      await app.close().catch(() => {})
      return
    }
    syncPdfUi()
    attachAnnotationMutationObserver()
    scheduleRenderAnnotationHighlights()
    applyPendingScrollLocation()
  } catch (loadError) {
    if (requestId !== loadRequestId) return
    error.value = loadError?.message || String(loadError)
  } finally {
    if (requestId === loadRequestId) {
      loading.value = false
    }
  }
}

function handlePdfUpdated(event) {
  if (event.detail?.path === filePathRef.value) loadPdf()
}

onMounted(() => {
  resetViewerReadyPromise()
  clearIframePointerGuards()
  window.addEventListener('pdf-updated', handlePdfUpdated)
  loadPdf()
})

onUnmounted(() => {
  loadRequestId += 1
  window.removeEventListener('pdf-updated', handlePdfUpdated)
  clearSyncTimer()
  clearSyncHighlight()
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null
  clearRenderedAnnotationHighlights()
  clearPendingSelection({ clearDomSelection: true })
  const app = getPdfApp()
  if (app?.close) {
    app.close().catch(() => {})
  }
  viewerReadyPromise = null
  resolveViewerReady = null
  rejectViewerReady = null
})

watch(isDark, applyTheme)
watch(() => workspace.pdfThemedPages, applyTheme)

watch(
  () => [
    loading.value,
    pdfUi.pageNumber,
    pdfUi.scaleValue,
    currentPdfAnnotations.value.length,
    activeAnnotationId.value,
  ],
  () => {
    scheduleRenderAnnotationHighlights()
  },
)

watch(currentPdfAnnotations, () => {
  scheduleRenderAnnotationHighlights()
}, { deep: true })

watch(filePathRef, () => {
  loadPdf()
})

defineExpose({
  scrollToPage,
  scrollToLocation,
})
</script>

<style scoped>
.pdf-toolbar-wrap {
  flex: none;
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  overflow: visible;
}

.pdf-toolbar-wrap-embedded {
  border-bottom: 0;
  border-top: 0;
  position: relative;
  z-index: 4;
}

.pdf-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--document-header-row-height, 24px);
  box-sizing: border-box;
  padding: 0 6px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
}

.pdf-toolbar::-webkit-scrollbar {
  display: none;
}

.pdf-toolbar-left,
.pdf-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 0;
}

.pdf-toolbar-right {
  justify-content: flex-end;
}

.pdf-toolbar-center {
  position: absolute;
  inset: 0 auto 0 50%;
  display: flex;
  align-items: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.pdf-toolbar-center > * {
  pointer-events: auto;
}

.pdf-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.pdf-toolbar-separator {
  width: 1px;
  height: 12px;
  flex: none;
  background: color-mix(in srgb, var(--border) 85%, transparent);
}

.pdf-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  padding: 0;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.pdf-toolbar-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.pdf-toolbar-btn-active {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.pdf-toolbar-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-toolbar-btn-sm {
  width: 18px;
  height: 18px;
}

.pdf-toolbar-input,
.pdf-toolbar-select {
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1;
  appearance: none;
}

.pdf-toolbar-input {
  padding: 0 8px;
}

.pdf-toolbar-search {
  width: 120px;
}

.pdf-toolbar-select {
  min-width: 120px;
  padding: 0 24px 0 8px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 11px) calc(50% - 1px), calc(100% - 7px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}

.pdf-page-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pdf-page-input {
  width: 36px;
  text-align: center;
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.pdf-toolbar-label,
.pdf-toolbar-hint {
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-toolbar-hint {
  color: var(--fg-muted);
  font-size: 11px;
}

.pdf-toolbar-group-translate {
  gap: 8px;
}

.pdf-toolbar-group-scale {
  gap: 6px;
}

.pdf-search-popover {
  position: absolute;
  top: calc(var(--document-header-row-height, 24px) + 6px);
  left: 6px;
  z-index: 24;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  max-width: calc(100% - 12px);
  box-sizing: border-box;
  padding: 6px;
  min-height: 32px;
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  overflow-x: auto;
  scrollbar-width: none;
}

.pdf-search-popover::-webkit-scrollbar {
  display: none;
}

.pdf-search-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-search-toggle:hover:not(:disabled) {
  background: var(--bg-hover);
}

.pdf-search-toggle:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-search-toggle-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.pdf-translate-status {
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-translate-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 20px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
  color: var(--accent);
}

.pdf-translate-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.pdf-translate-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.pdf-annotation-btn,
.pdf-annotation-primary,
.pdf-annotation-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
}

.pdf-annotation-btn,
.pdf-annotation-primary {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.pdf-annotation-btn:hover,
.pdf-annotation-primary:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pdf-annotation-sidebar-shell {
  display: flex;
  flex-direction: column;
  position: absolute;
  inset: 0 0 0 auto;
  width: min(360px, calc(100% - 40px));
  min-width: 280px;
  max-width: 420px;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
  box-shadow: -10px 0 28px rgba(0, 0, 0, 0.18);
  z-index: 12;
  backdrop-filter: blur(10px);
}

.pdf-annotation-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
}

.pdf-annotation-sidebar-title {
  color: var(--fg-primary);
  font-size: 12px;
  font-weight: 600;
}

.pdf-annotation-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.pdf-annotation-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent);
  color: var(--fg-muted);
  font-size: 12px;
}

.pdf-annotation-empty-hint {
  line-height: 1.4;
}

.pdf-annotation-pending {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.pdf-annotation-pending-label {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}

.pdf-annotation-pending-quote,
.pdf-annotation-quote {
  color: var(--fg-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.pdf-annotation-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
  outline: none;
}

.pdf-annotation-item:hover {
  border-color: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pdf-annotation-item-active {
  border-color: color-mix(in srgb, var(--accent) 36%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent);
}

.pdf-annotation-item-header,
.pdf-annotation-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pdf-annotation-page,
.pdf-annotation-open {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}

.pdf-annotation-date {
  color: var(--fg-muted);
  font-size: 11px;
}

.pdf-annotation-delete {
  color: var(--fg-muted);
  padding-inline: 8px;
}

.pdf-annotation-delete:hover {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.pdf-annotation-note-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pdf-annotation-note-create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px dashed color-mix(in srgb, var(--accent) 28%, transparent);
  background: transparent;
  color: var(--accent);
  font-size: var(--ui-font-caption);
}

.pdf-annotation-note-create:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.pdf-annotation-overlay-enter-active,
.pdf-annotation-overlay-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.pdf-annotation-overlay-enter-from,
.pdf-annotation-overlay-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

@media (max-width: 880px) {
  .pdf-toolbar-center {
    position: static;
    transform: none;
    flex: none;
    inset: auto;
  }

  .pdf-toolbar {
    justify-content: flex-start;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pdf-toolbar-left,
  .pdf-toolbar-right {
    flex: none;
  }

  .pdf-search-popover {
    right: 6px;
    width: auto;
  }

  .pdf-annotation-sidebar-shell {
    width: min(100%, 420px);
    min-width: 0;
  }
}
</style>
