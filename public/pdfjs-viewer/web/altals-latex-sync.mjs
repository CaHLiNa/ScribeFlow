const CHANNEL = 'altals-latex-sync'

function postToParent(type, payload = {}) {
  try {
    window.parent?.postMessage({
      channel: CHANNEL,
      type,
      ...payload,
    }, '*')
  } catch {
    // Ignore parent bridge failures to keep the viewer usable.
  }
}

const webViewerLoaded = new Promise((resolve) => {
  document.addEventListener('webviewerloaded', () => resolve(), { once: true })
  try {
    parent.document.addEventListener('webviewerloaded', () => resolve(), { once: true })
  } catch {
    // Ignore cross-frame access issues.
  }
})

async function getViewerApp() {
  await webViewerLoaded
  await window.PDFViewerApplication.initializedPromise
  return window.PDFViewerApplication
}

async function getViewerEventBus() {
  const app = await getViewerApp()
  return app.eventBus
}

function onPDFViewerEvent(eventName, callback, options = {}) {
  const wrapped = (event) => {
    callback(event)
    if (options.once) {
      window.PDFViewerApplication.eventBus.off(eventName, wrapped)
    }
  }
  void getViewerEventBus().then(eventBus => eventBus.on(eventName, wrapped))
}

function getSelectionContext() {
  const selection = window.getSelection()
  if (!selection?.anchorNode || selection.anchorNode.nodeName !== '#text') {
    return { textBeforeSelection: '', textAfterSelection: '' }
  }

  const text = String(selection.anchorNode.textContent || '')
  const offset = Math.max(0, Math.min(Number(selection.anchorOffset || 0), text.length))
  return {
    textBeforeSelection: text.slice(0, offset),
    textAfterSelection: text.slice(offset),
  }
}

function callReverseSynctex(event, pageNumber, pageDom, viewerContainer) {
  const canvasDom = pageDom.getElementsByTagName('canvas')[0]
  const canvasWrapper = pageDom.getElementsByClassName('canvasWrapper')[0]
  if (!canvasDom || !canvasWrapper) return

  const pageView = window.PDFViewerApplication.pdfViewer?._pages?.[pageNumber - 1]
  if (!pageView?.getPagePoint) return

  const left = event.pageX - pageDom.offsetLeft + viewerContainer.scrollLeft - canvasWrapper.offsetLeft
  const top = event.pageY - pageDom.offsetTop + viewerContainer.scrollTop - canvasWrapper.offsetTop
  const pos = pageView.getPagePoint(left, canvasDom.offsetHeight - top)
  if (!Array.isArray(pos) || pos.length < 2) return

  const { textBeforeSelection, textAfterSelection } = getSelectionContext()
  postToParent('reverse_synctex', {
    page: pageNumber,
    pos,
    textBeforeSelection,
    textAfterSelection,
  })
}

function registerSyncTeX() {
  const viewerDom = document.getElementById('viewer')
  const viewerContainer = document.getElementById('viewerContainer')
  if (!viewerDom || !viewerContainer) return

  const pageDomList = viewerDom.firstElementChild?.classList.contains('spread')
    ? [...viewerDom.children].flatMap(node => [...node.children])
    : [...viewerDom.children]

  for (const pageDom of pageDomList) {
    const pageNumber = Number(pageDom?.dataset?.pageNumber || 0)
    if (!pageNumber) continue
    pageDom.ondblclick = (event) => {
      callReverseSynctex(event, pageNumber, pageDom, viewerContainer)
    }
  }
}

function ensureIndicatorRoot() {
  let indicator = document.getElementById('synctex-indicator')
  if (indicator) return indicator

  const container = document.getElementById('viewerContainer')
  if (!container) return null
  indicator = document.createElement('div')
  indicator.id = 'synctex-indicator'
  indicator.setAttribute('aria-hidden', 'true')
  container.appendChild(indicator)
  return indicator
}

function createIndicator(type, scrollX, scrollY, widthPx, heightPx) {
  let indicator = ensureIndicatorRoot()
  if (!indicator) return

  if (type === 'rect') {
    const parent = indicator.parentNode
    indicator = indicator.cloneNode(true)
    indicator.id = ''
    indicator.classList.add('synctex-indicator-rect')
    indicator.style.width = `${widthPx}px`
    indicator.style.height = `${heightPx}px`
    indicator.addEventListener('animationend', () => {
      indicator.style.display = 'none'
      parent?.removeChild(indicator)
    }, { once: true })
    parent?.appendChild(indicator)
  } else {
    indicator.className = 'show'
    window.setTimeout(() => {
      indicator.className = 'hide'
    }, 10)
  }

  indicator.style.left = `${scrollX}px`
  indicator.style.top = `${scrollY}px`
}

function scrollToPosition(page, posX, posY, isCircle = false) {
  const container = document.getElementById('viewerContainer')
  if (!container) return

  const maxScrollX = window.innerWidth * (isCircle ? 0.9 : 1)
  const minScrollX = window.innerWidth * (isCircle ? 0.1 : 0)
  let scrollX = page.offsetLeft + posX
  scrollX = Math.min(scrollX, maxScrollX)
  scrollX = Math.max(scrollX, minScrollX)
  const scrollY = page.offsetTop + page.offsetHeight - posY

  if (window.PDFViewerApplication.pdfViewer.scrollMode === 1) {
    container.scrollLeft = page.offsetLeft
  } else {
    container.scrollTop = scrollY - document.body.offsetHeight * 0.4
  }

  return { scrollX, scrollY }
}

function forwardSynctex(data) {
  if (!data) return
  const records = Array.isArray(data) ? data : [data]

  for (const record of records) {
    const page = document.getElementsByClassName('page')[record.page - 1]
    const pageView = window.PDFViewerApplication.pdfViewer?._pages?.[record.page - 1]
    if (!page || !pageView?.viewport) continue

    const position = Array.isArray(data)
      ? pageView.viewport.convertToViewportPoint(record.h, record.v - record.H)
      : pageView.viewport.convertToViewportPoint(record.x, record.y)

    const { scrollX, scrollY } = scrollToPosition(page, position[0], position[1], !Array.isArray(data)) || {}
    if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY)) continue

    if (Array.isArray(data)) {
      const bottomRight = pageView.viewport.convertToViewportPoint(record.h + record.W, record.v)
      const widthPx = Math.max(0, bottomRight[0] - position[0])
      const heightPx = Math.max(0, position[1] - bottomRight[1])
      createIndicator('rect', scrollX, scrollY, widthPx, heightPx)
    } else {
      createIndicator('circ', scrollX, scrollY)
    }
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  const data = event.data
  if (!data || data.channel !== CHANNEL) return

  if (data.type === 'synctex') {
    forwardSynctex(data.data)
  }
})

onPDFViewerEvent('pagesinit', () => {
  registerSyncTeX()
  postToParent('pagesinit')
})

onPDFViewerEvent('pagesloaded', () => {
  registerSyncTeX()
  postToParent('loaded')
})
