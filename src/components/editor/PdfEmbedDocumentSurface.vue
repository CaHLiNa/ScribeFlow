<template>
  <div
    class="pdf-artifact-preview__surface"
    tabindex="0"
    data-surface-context-guard="true"
    @contextmenu.prevent="handleShellContextMenu"
    @keydown.capture="handleKeydown"
    @dblclick.capture="handleDoubleClick"
  >
    <Viewport :document-id="documentId" class="pdf-artifact-preview__viewport">
      <Scroller :document-id="documentId" v-slot="{ page }">
        <div
          :ref="(element) => setPageElement(page.pageNumber, element)"
          class="pdf-artifact-preview__page"
          :data-page-number="page.pageNumber"
          :style="{ width: `${page.width}px`, height: `${page.height}px` }"
        >
          <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
        </div>
      </Scroller>
    </Viewport>

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
import { nextTick, onUnmounted, ref, watch } from 'vue'

import { useExport } from '@embedpdf/plugin-export/vue'
import { RenderLayer } from '@embedpdf/plugin-render/vue'
import { Scroller, useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/vue'
import { SpreadMode, useSpread } from '@embedpdf/plugin-spread/vue'
import { Viewport, useViewportCapability } from '@embedpdf/plugin-viewport/vue'
import { ZoomMode, useZoom } from '@embedpdf/plugin-zoom/vue'

import { useI18n } from '../../i18n'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import {
  encodePdfArrayBufferToBase64,
} from '../../services/pdf/embedPdfAdapter.js'
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

const { t } = useI18n()
const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const zoom = useZoom(() => props.documentId)
const spread = useSpread(() => props.documentId)
const scroll = useScroll(() => props.documentId)
const exportScope = useExport(() => props.documentId)
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

let scheduledViewStateFrame = 0
let restoreRevision = 0

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
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

function buildSurfaceMenuGroups() {
  const reverseSyncDetail = currentContextMenuReverseSyncDetail.value
  return [
    {
      key: 'embedpdf-surface-actions',
      items: [
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
        ...(props.kind === 'latex' && reverseSyncDetail
          ? [
              {
                key: 'reveal-source',
                label: t('Reveal Source'),
                action: () => {
                  emit('reverse-sync-request', reverseSyncDetail)
                },
              },
            ]
          : []),
      ],
    },
  ]
}

const currentContextMenuReverseSyncDetail = ref(null)

function handleShellContextMenu(event) {
  currentContextMenuReverseSyncDetail.value = resolveReverseSyncDetail(event)
  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups: buildSurfaceMenuGroups(),
  })
}

function handleKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && String(event.key || '').toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    void savePdfToDisk()
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

  const pageElement = event?.target?.closest?.('.pdf-artifact-preview__page')
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

function handleDoubleClick(event) {
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
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
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
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
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
    scheduleViewStateEmission()
  }
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
  if (scheduledViewStateFrame && typeof window !== 'undefined') {
    window.cancelAnimationFrame(scheduledViewStateFrame)
    scheduledViewStateFrame = 0
  }
})
</script>

<style scoped>
.pdf-artifact-preview__surface {
  width: 100%;
  height: 100%;
  outline: none;
}

.pdf-artifact-preview__viewport {
  width: 100%;
  height: 100%;
  background: var(--embedpdf-surface);
}

.pdf-artifact-preview__page {
  margin: 12px auto;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  background: var(--embedpdf-page);
}
</style>
