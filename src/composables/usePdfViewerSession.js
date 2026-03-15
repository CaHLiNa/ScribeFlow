import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-vue'
import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs'
import { createPdfLoadingTaskForWorkspace, openPdfExternalUrl } from '../services/pdfDocument'

const PDF_SCALE_PRESETS = [
  'auto',
  'page-width',
  'page-fit',
  'page-actual',
  '0.5',
  '0.75',
  '1',
  '1.25',
  '1.5',
  '2',
  '3',
]
const MIN_SCALE = 0.3
const MAX_SCALE = 5
const DEFAULT_PAGE_THUMB_ASPECT_RATIO = 1 / Math.SQRT2
const PAGE_THUMBNAIL_TARGET_WIDTH = 132
const PAGE_THUMBNAIL_CONCURRENCY = 2
const PAGE_THUMBNAIL_NEARBY_RANGE = 1

function normalizeOutlineTitle(title) {
  const normalized = String(title || '').replace(/\u0000/g, '').trim()
  return normalized || '-'
}

function flattenOutline(items, depth = 0, path = '', acc = []) {
  if (!Array.isArray(items)) return acc

  items.forEach((item, index) => {
    const id = path ? `${path}.${index}` : String(index)
    acc.push({
      id,
      depth,
      title: normalizeOutlineTitle(item?.title),
      dest: item?.dest ?? null,
      url: item?.url ?? '',
      bold: !!item?.bold,
      italic: !!item?.italic,
    })
    if (Array.isArray(item?.items) && item.items.length > 0) {
      flattenOutline(item.items, depth + 1, id, acc)
    }
  })

  return acc
}

export function usePdfViewerSession(options) {
  const {
    filePathRef,
    viewerContainerRef,
    viewerRef,
    sidebarScrollRef,
    pageInputRef,
    workspace,
    t,
  } = options

  const pageInput = ref('1')
  const loading = ref(true)
  const error = ref(null)
  const pdfSession = shallowRef(null)
  const outlineItems = ref([])
  const outlineLoading = ref(false)
  const outlineResolved = ref(false)
  const pageThumbnails = ref([])
  const reloadVersion = ref(0)

  const pdfUi = reactive({
    ready: false,
    pageNumber: 1,
    pagesCount: 0,
    canGoPrevious: false,
    canGoNext: false,
    canZoomOut: false,
    canZoomIn: false,
    scaleValue: 'page-width',
    scaleLabel: '',
    sidebarOpen: false,
    sidebarMode: 'outline',
    sidebarSupported: false,
    outlineSupported: false,
    pagesSupported: false,
  })

  let loadRequestId = 0
  let resizeObserver = null
  let thumbnailObserver = null
  let thumbnailQueue = []
  const thumbnailQueuedPages = new Set()
  const thumbnailRenderingPages = new Set()
  const thumbnailItemElements = new Map()

  const sidebarIcon = computed(() => (
    pdfUi.sidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand
  ))
  const sidebarAvailable = computed(() => (
    pdfUi.sidebarSupported || outlineLoading.value
  ))
  const scaleOptions = computed(() => {
    const options = PDF_SCALE_PRESETS.map((value) => ({
      value,
      label: localizeScaleLabel(value),
    }))
    const currentValue = String(pdfUi.scaleValue || '').trim()
    if (!currentValue || options.some((option) => option.value === currentValue)) {
      return options
    }
    return [
      ...options,
      {
        value: currentValue,
        label: localizeScaleLabel(currentValue, getPdfViewer()?.currentScale || 1),
      },
    ]
  })

  function getPdfViewer() {
    return pdfSession.value?.pdfViewer || null
  }

  function getPdfLinkService() {
    return pdfSession.value?.linkService || null
  }

  function localizeScaleLabel(value, numericScale = null) {
    switch (String(value || '').trim()) {
      case 'auto':
        return t('Automatic Zoom')
      case 'page-width':
        return t('Page Width')
      case 'page-fit':
        return t('Page Fit')
      case 'page-actual':
        return t('Actual Size')
      default: {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) {
          const percent = Math.round((numericScale ?? parsed) * 100)
          return `${percent}%`
        }
        return String(value || '')
      }
    }
  }

  function resetPageThumbnails() {
    disconnectThumbnailObserver()
    thumbnailQueue = []
    thumbnailQueuedPages.clear()
    thumbnailRenderingPages.clear()
    thumbnailItemElements.clear()
    pageThumbnails.value = []
  }

  function resetPdfUi() {
    pdfUi.ready = false
    pdfUi.pageNumber = 1
    pdfUi.pagesCount = 0
    pdfUi.canGoPrevious = false
    pdfUi.canGoNext = false
    pdfUi.canZoomOut = false
    pdfUi.canZoomIn = false
    pdfUi.scaleValue = 'page-width'
    pdfUi.scaleLabel = t('Page Width')
    pdfUi.sidebarOpen = false
    pdfUi.sidebarMode = 'outline'
    pdfUi.sidebarSupported = false
    pdfUi.outlineSupported = false
    pdfUi.pagesSupported = false
    pageInput.value = '1'
    outlineItems.value = []
    outlineLoading.value = false
    outlineResolved.value = false
    resetPageThumbnails()
  }

  function initializePageThumbnails(totalPages) {
    const count = Math.max(0, Number(totalPages || 0))
    pageThumbnails.value = Array.from({ length: count }, (_, index) => ({
      pageNumber: index + 1,
      status: 'idle',
      imageSrc: '',
      aspectRatio: DEFAULT_PAGE_THUMB_ASPECT_RATIO,
    }))
  }

  function syncSidebarSupport() {
    pdfUi.sidebarSupported = pdfUi.pagesSupported || pdfUi.outlineSupported
    if (!pdfUi.sidebarSupported && !outlineLoading.value) {
      pdfUi.sidebarOpen = false
    }
    if (outlineResolved.value && !pdfUi.outlineSupported && pdfUi.pagesSupported && pdfUi.sidebarMode === 'outline') {
      pdfUi.sidebarMode = 'pages'
    }
    if (!pdfUi.pagesSupported && pdfUi.sidebarMode === 'pages') {
      pdfUi.sidebarMode = 'outline'
    }
  }

  function syncPdfUi() {
    const viewer = getPdfViewer()
    const session = pdfSession.value
    if (!viewer || !session?.pdfDocument) {
      pdfUi.ready = false
      return
    }

    const pageNumber = Number(viewer.currentPageNumber || 1)
    const pagesCount = Number(viewer.pagesCount || session.pdfDocument.numPages || 0)
    const currentScale = Number(viewer.currentScale || 1)
    const currentScaleValue = String(viewer.currentScaleValue || pdfUi.scaleValue || 'page-width')

    pdfUi.ready = true
    pdfUi.pageNumber = pageNumber
    pdfUi.pagesCount = pagesCount
    pdfUi.canGoPrevious = pageNumber > 1
    pdfUi.canGoNext = pageNumber < pagesCount
    pdfUi.canZoomOut = currentScale > MIN_SCALE
    pdfUi.canZoomIn = currentScale < MAX_SCALE
    pdfUi.scaleValue = currentScaleValue
    pdfUi.scaleLabel = localizeScaleLabel(currentScaleValue, currentScale)
    pdfUi.pagesSupported = pagesCount > 0

    if (pageThumbnails.value.length !== pagesCount) {
      initializePageThumbnails(pagesCount)
    }
    syncSidebarSupport()

    if (document.activeElement !== pageInputRef.value) {
      pageInput.value = String(pageNumber || 1)
    }
  }

  function disconnectThumbnailObserver() {
    if (!thumbnailObserver) return
    thumbnailObserver.disconnect()
    thumbnailObserver = null
  }

  function updatePageThumbnail(pageNumber, patch) {
    const index = Number(pageNumber) - 1
    const current = pageThumbnails.value[index]
    if (!current) return
    pageThumbnails.value[index] = {
      ...current,
      ...patch,
    }
  }

  function queueThumbnailWindow(pageNumber) {
    const center = Number(pageNumber)
    if (!Number.isInteger(center) || center < 1) return
    const start = Math.max(1, center - PAGE_THUMBNAIL_NEARBY_RANGE)
    const end = Math.min(pageThumbnails.value.length, center + PAGE_THUMBNAIL_NEARBY_RANGE)
    for (let page = start; page <= end; page += 1) {
      enqueueThumbnail(page)
    }
  }

  function enqueueThumbnail(pageNumber) {
    const page = Number(pageNumber)
    const thumbnail = pageThumbnails.value[page - 1]
    if (!thumbnail) return
    if (thumbnail.status === 'ready' || thumbnail.status === 'loading') return
    if (thumbnailQueuedPages.has(page) || thumbnailRenderingPages.has(page)) return
    thumbnailQueuedPages.add(page)
    thumbnailQueue.push(page)
    processThumbnailQueue()
  }

  function processThumbnailQueue() {
    while (thumbnailRenderingPages.size < PAGE_THUMBNAIL_CONCURRENCY && thumbnailQueue.length > 0) {
      const pageNumber = thumbnailQueue.shift()
      thumbnailQueuedPages.delete(pageNumber)
      const thumbnail = pageThumbnails.value[pageNumber - 1]
      if (!thumbnail || thumbnail.status === 'ready' || thumbnail.status === 'loading') continue
      thumbnailRenderingPages.add(pageNumber)
      updatePageThumbnail(pageNumber, { status: 'loading' })

      const requestId = loadRequestId
      void renderPageThumbnail(pageNumber, requestId).finally(() => {
        thumbnailRenderingPages.delete(pageNumber)
        processThumbnailQueue()
      })
    }
  }

  async function renderPageThumbnail(pageNumber, requestId) {
    const session = pdfSession.value
    const pdfDocument = session?.pdfDocument
    if (!pdfDocument || requestId !== loadRequestId) return

    let page = null
    try {
      page = await pdfDocument.getPage(pageNumber)
      if (requestId !== loadRequestId || session !== pdfSession.value) return

      const baseViewport = page.getViewport({ scale: 1 })
      const scale = PAGE_THUMBNAIL_TARGET_WIDTH / Math.max(baseViewport.width || 1, 1)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) {
        throw new Error('Canvas 2D context unavailable')
      }

      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        background: 'rgb(255,255,255)',
      })
      await renderTask.promise
      if (requestId !== loadRequestId || session !== pdfSession.value) return

      updatePageThumbnail(pageNumber, {
        status: 'ready',
        imageSrc: canvas.toDataURL('image/png'),
        aspectRatio: canvas.width / Math.max(canvas.height, 1),
      })
    } catch (thumbnailError) {
      if (requestId !== loadRequestId || session !== pdfSession.value) return
      console.warn('[pdf] failed to render page thumbnail:', thumbnailError)
      updatePageThumbnail(pageNumber, { status: 'error' })
    } finally {
      try {
        page?.cleanup?.()
      } catch {}
    }
  }

  function connectThumbnailObserver() {
    disconnectThumbnailObserver()

    if (!sidebarScrollRef.value || pageThumbnails.value.length === 0) return
    if (typeof IntersectionObserver !== 'function') {
      queueThumbnailWindow(pdfUi.pageNumber || 1)
      return
    }

    thumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const pageNumber = Number(entry.target?.dataset?.pageNumber || 0)
        if (!Number.isInteger(pageNumber) || pageNumber < 1) return
        queueThumbnailWindow(pageNumber)
      })
    }, {
      root: sidebarScrollRef.value,
      rootMargin: '160px 0px 160px 0px',
      threshold: 0.01,
    })

    thumbnailItemElements.forEach((element) => {
      thumbnailObserver?.observe(element)
    })
    queueThumbnailWindow(pdfUi.pageNumber || 1)
  }

  function setThumbnailItemRef(pageNumber, element) {
    const key = Number(pageNumber)
    const previous = thumbnailItemElements.get(key)
    if (previous && thumbnailObserver) {
      thumbnailObserver.unobserve(previous)
    }

    if (element) {
      thumbnailItemElements.set(key, element)
      if (thumbnailObserver) {
        thumbnailObserver.observe(element)
      }
      return
    }

    thumbnailItemElements.delete(key)
  }

  function thumbnailPreviewStyle(thumbnail) {
    const ratio = Number(thumbnail?.aspectRatio)
    return {
      aspectRatio: String(Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_PAGE_THUMB_ASPECT_RATIO),
    }
  }

  function scrollCurrentThumbnailIntoView() {
    if (!pdfUi.sidebarOpen || pdfUi.sidebarMode !== 'pages') return
    const element = thumbnailItemElements.get(Number(pdfUi.pageNumber))
    if (!element) return
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ block: 'nearest' })
    })
  }

  function attachViewerListeners(session, requestId) {
    const { eventBus, pdfViewer } = session

    eventBus.on('pagesinit', () => {
      if (requestId !== loadRequestId) return
      pdfViewer.currentScaleValue = pdfUi.scaleValue || 'page-width'
      syncPdfUi()
    })

    eventBus.on('pagerendered', () => {
      if (requestId !== loadRequestId) return
      loading.value = false
      syncPdfUi()
    }, { once: true })

    eventBus.on('pagesloaded', () => {
      if (requestId !== loadRequestId) return
      syncPdfUi()
    })

    eventBus.on('pagechanging', () => {
      if (requestId !== loadRequestId) return
      syncPdfUi()
    })

    eventBus.on('scalechanging', () => {
      if (requestId !== loadRequestId) return
      syncPdfUi()
    })
  }

  async function cleanupPdfSession() {
    const session = pdfSession.value
    pdfSession.value = null

    if (viewerRef.value) {
      viewerRef.value.replaceChildren()
    }

    if (!session) return

    try {
      session.abortController?.abort()
    } catch {}

    try {
      session.linkService?.setDocument(null, null)
    } catch {}

    try {
      session.pdfViewer?.setDocument(null)
      session.pdfViewer?.cleanup?.()
    } catch {}

    try {
      await session.loadingTask?.destroy?.()
    } catch {}
  }

  async function buildViewerSession(requestId) {
    await nextTick()
    if (requestId !== loadRequestId || !viewerContainerRef.value || !viewerRef.value) return null

    const eventBus = new EventBus()
    const linkService = new PDFLinkService({ eventBus })
    const abortController = new AbortController()
    const pdfViewer = new PDFViewer({
      container: viewerContainerRef.value,
      viewer: viewerRef.value,
      eventBus,
      linkService,
      removePageBorders: true,
      abortSignal: abortController.signal,
    })

    linkService.setViewer(pdfViewer)

    const loadingTask = createPdfLoadingTaskForWorkspace(filePathRef.value, workspace, {
      version: reloadVersion.value,
    })
    const session = {
      requestId,
      eventBus,
      linkService,
      pdfViewer,
      loadingTask,
      abortController,
      pdfDocument: null,
    }
    pdfSession.value = session
    attachViewerListeners(session, requestId)
    return session
  }

  async function loadOutline(session, requestId) {
    outlineResolved.value = false
    outlineLoading.value = true
    pdfUi.outlineSupported = false
    syncSidebarSupport()

    try {
      const outline = await session.pdfDocument?.getOutline?.()
      if (requestId !== loadRequestId || session !== pdfSession.value) return

      const nextOutlineItems = flattenOutline(outline)
      outlineItems.value = nextOutlineItems
      pdfUi.outlineSupported = nextOutlineItems.length > 0
    } catch (outlineError) {
      if (requestId !== loadRequestId || session !== pdfSession.value) return
      console.warn('[pdf] failed to load outline:', outlineError)
      outlineItems.value = []
      pdfUi.outlineSupported = false
    } finally {
      if (requestId === loadRequestId) {
        outlineLoading.value = false
        outlineResolved.value = true
        syncSidebarSupport()
      }
    }
  }

  async function loadPdf() {
    const requestId = ++loadRequestId
    loading.value = true
    error.value = null
    resetPdfUi()
    await cleanupPdfSession()

    try {
      const session = await buildViewerSession(requestId)
      if (!session || requestId !== loadRequestId) return

      const pdfDocument = await session.loadingTask.promise
      if (requestId !== loadRequestId) {
        await session.loadingTask.destroy().catch(() => {})
        return
      }

      session.pdfDocument = pdfDocument
      session.linkService.setDocument(pdfDocument, null)
      await session.pdfViewer.setDocument(pdfDocument)
      syncPdfUi()
      void loadOutline(session, requestId)
    } catch (loadError) {
      if (requestId !== loadRequestId) return
      console.error('[pdf] failed to load document:', loadError)
      error.value = loadError?.message || String(loadError)
      loading.value = false
      await cleanupPdfSession()
    }
  }

  function selectSidebarMode(mode) {
    if (mode === 'outline' && !pdfUi.outlineSupported && !outlineLoading.value) return
    if (mode === 'pages' && !pdfUi.pagesSupported) return
    pdfUi.sidebarMode = mode
  }

  function toggleSidebar() {
    if (!sidebarAvailable.value) return
    pdfUi.sidebarOpen = !pdfUi.sidebarOpen
  }

  async function activateOutlineItem(item) {
    if (!item) return

    if (item.url) {
      openPdfExternalUrl(item.url).catch(() => {})
      return
    }

    if (item.dest == null) return

    const linkService = getPdfLinkService()
    if (!linkService?.goToDestination) return

    await linkService.goToDestination(item.dest)
    syncPdfUi()
  }

  function scrollToPage(pageNumber) {
    const targetPage = Number(pageNumber)
    if (!Number.isInteger(targetPage) || targetPage < 1) return
    const linkService = getPdfLinkService()
    if (linkService?.goToPage) {
      linkService.goToPage(targetPage)
      syncPdfUi()
    }
  }

  function activatePageThumbnail(pageNumber) {
    scrollToPage(pageNumber)
    scrollCurrentThumbnailIntoView()
  }

  function goPreviousPage() {
    const viewer = getPdfViewer()
    if (!viewer || !pdfUi.canGoPrevious) return
    viewer.currentPageNumber = Math.max(1, pdfUi.pageNumber - 1)
    syncPdfUi()
  }

  function goNextPage() {
    const viewer = getPdfViewer()
    if (!viewer || !pdfUi.canGoNext) return
    viewer.currentPageNumber = Math.min(pdfUi.pagesCount, pdfUi.pageNumber + 1)
    syncPdfUi()
  }

  function commitPageNumber() {
    const viewer = getPdfViewer()
    const nextPage = Number(pageInput.value)
    if (!viewer || !Number.isInteger(nextPage) || nextPage < 1 || nextPage > pdfUi.pagesCount) {
      pageInput.value = String(pdfUi.pageNumber || 1)
      return
    }
    viewer.currentPageNumber = nextPage
    syncPdfUi()
  }

  function zoomOut() {
    const viewer = getPdfViewer()
    if (!viewer) return
    viewer.currentScale = Math.max(MIN_SCALE, Number(viewer.currentScale || 1) / 1.1)
    syncPdfUi()
  }

  function zoomIn() {
    const viewer = getPdfViewer()
    if (!viewer) return
    viewer.currentScale = Math.min(MAX_SCALE, Number(viewer.currentScale || 1) * 1.1)
    syncPdfUi()
  }

  function applyScale() {
    const viewer = getPdfViewer()
    if (!viewer) return
    viewer.currentScaleValue = pdfUi.scaleValue
    syncPdfUi()
  }

  function scrollToLocation(pageNumber, x, y) {
    const targetPage = Number(pageNumber)
    if (!Number.isInteger(targetPage) || targetPage < 1) return

    const viewer = getPdfViewer()
    if (!viewer?.scrollPageIntoView) {
      scrollToPage(targetPage)
      return
    }

    const xCoord = Number(x)
    const yCoord = Number(y)
    const destArray = [
      null,
      { name: 'XYZ' },
      Number.isFinite(xCoord) ? xCoord : null,
      Number.isFinite(yCoord) ? yCoord : null,
      null,
    ]
    viewer.scrollPageIntoView({
      pageNumber: targetPage,
      destArray,
      allowNegativeOffset: true,
      ignoreDestinationZoom: true,
    })
    syncPdfUi()
  }

  function handlePdfUpdated(event) {
    if (event.detail?.path === filePathRef.value) {
      reloadVersion.value += 1
      loadPdf()
    }
  }

  onMounted(() => {
    resizeObserver = new ResizeObserver(() => {
      const viewer = getPdfViewer()
      const scaleValue = String(pdfUi.scaleValue || viewer?.currentScaleValue || '').trim()
      if (!viewer || !scaleValue) return
      if (scaleValue !== 'auto' && scaleValue !== 'page-width' && scaleValue !== 'page-fit') return
      window.requestAnimationFrame(() => {
        const latestViewer = getPdfViewer()
        if (!latestViewer) return
        latestViewer.currentScaleValue = scaleValue
        syncPdfUi()
      })
    })
    if (viewerContainerRef.value) {
      resizeObserver.observe(viewerContainerRef.value)
    }
    window.addEventListener('pdf-updated', handlePdfUpdated)
    loadPdf()
  })

  onUnmounted(async () => {
    loadRequestId += 1
    resizeObserver?.disconnect()
    resizeObserver = null
    disconnectThumbnailObserver()
    window.removeEventListener('pdf-updated', handlePdfUpdated)
    await cleanupPdfSession()
  })

  watch(filePathRef, () => {
    reloadVersion.value = 0
    loadPdf()
  })

  watch(
    () => [pdfUi.sidebarOpen, pdfUi.sidebarMode, pageThumbnails.value.length],
    async ([sidebarOpen, sidebarMode, thumbnailsCount]) => {
      if (!sidebarOpen || sidebarMode !== 'pages' || thumbnailsCount === 0) {
        disconnectThumbnailObserver()
        return
      }
      await nextTick()
      connectThumbnailObserver()
      scrollCurrentThumbnailIntoView()
    },
  )

  watch(() => pdfUi.pageNumber, (pageNumber) => {
    if (!pdfUi.sidebarOpen || pdfUi.sidebarMode !== 'pages') return
    queueThumbnailWindow(pageNumber)
    nextTick(() => {
      scrollCurrentThumbnailIntoView()
    })
  })

  return {
    pageInput,
    loading,
    error,
    outlineItems,
    outlineLoading,
    pageThumbnails,
    pdfUi,
    sidebarIcon,
    sidebarAvailable,
    scaleOptions,
    selectSidebarMode,
    toggleSidebar,
    activateOutlineItem,
    activatePageThumbnail,
    goPreviousPage,
    goNextPage,
    commitPageNumber,
    zoomOut,
    zoomIn,
    applyScale,
    setThumbnailItemRef,
    thumbnailPreviewStyle,
    scrollToPage,
    scrollToLocation,
  }
}
