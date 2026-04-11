function isElementNode(node) {
  return !!node && Number(node.nodeType) === 1
}

function isTextNode(node) {
  return !!node && Number(node.nodeType) === 3
}

export function resolvePdfPreviewEventTarget(target) {
  if (isElementNode(target)) return target
  if (isTextNode(target)) return target.parentElement || null
  return null
}

export function capturePdfPreviewSelectionContext(selection) {
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

export function scrollPdfPreviewToPoint({ app, doc, point = {} }) {
  const page = Number(point.page || 0)
  const x = Number(point.x)
  const y = Number(point.y)
  if (!app?.pdfViewer || !Number.isInteger(page) || page < 1) return false

  if (Number.isFinite(x) && Number.isFinite(y)) {
    const pageDom = doc?.getElementsByClassName?.('page')?.[page - 1]
    const pageView = app.pdfViewer?._pages?.[page - 1]
    const viewerContainer = doc?.getElementById?.('viewerContainer')
    if (pageDom && pageView?.viewport && viewerContainer) {
      const [viewportX, viewportY] = pageView.viewport.convertToViewportPoint(x, y)
      const scrollY = pageDom.offsetTop + pageDom.offsetHeight - viewportY
      if (app.pdfViewer.scrollMode === 1) {
        viewerContainer.scrollLeft = pageDom.offsetLeft
      } else {
        viewerContainer.scrollTop = scrollY - viewerContainer.clientHeight * 0.4
      }
      return true
    }

    app.pdfViewer.scrollPageIntoView({
      pageNumber: page,
      destArray: [null, { name: 'XYZ' }, x, y, null],
      allowNegativeOffset: true,
    })
    return true
  }

  app.pdfViewer.scrollPageIntoView({ pageNumber: page })
  return true
}

export function resolveLatexPdfReverseSyncPayload({ event, frameWindow }) {
  const eventTarget = resolvePdfPreviewEventTarget(event?.target)
  const currentTarget = resolvePdfPreviewEventTarget(event?.currentTarget)
  const pageDom = currentTarget?.classList?.contains('page')
    ? currentTarget
    : eventTarget?.closest?.('.page') || null
  const page = Number(pageDom?.dataset?.pageNumber || 0)
  if (!pageDom || !Number.isInteger(page) || page < 1) return null

  const app = frameWindow?.PDFViewerApplication
  const pageView = app?.pdfViewer?._pages?.[page - 1]
  const doc = frameWindow?.document
  const viewerContainer = doc?.getElementById?.('viewerContainer')
  const canvasDom = pageDom.getElementsByTagName?.('canvas')?.[0]
  const canvasWrapper = pageDom.getElementsByClassName?.('canvasWrapper')?.[0]
  if (!pageView || !viewerContainer || !canvasDom || !canvasWrapper) return null

  const left = event.pageX - pageDom.offsetLeft + viewerContainer.scrollLeft - canvasWrapper.offsetLeft
  const top = event.pageY - pageDom.offsetTop + viewerContainer.scrollTop - canvasWrapper.offsetTop
  const pos = pageView.getPagePoint(left, canvasDom.offsetHeight - top)
  if (!Array.isArray(pos) || pos.length < 2) return null

  return {
    page,
    pos,
    ...capturePdfPreviewSelectionContext(frameWindow?.getSelection?.()),
  }
}

export function dispatchLatexBackwardSync(windowTarget, detail = {}) {
  windowTarget?.dispatchEvent?.(new CustomEvent('latex-backward-sync', { detail }))
}
