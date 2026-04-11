export function shouldUsePdfCanvasFilterFallback(options = {}) {
  if (options.themedPages !== true) return false
  const resolvedTheme = String(options.resolvedTheme || '').trim().toLowerCase() === 'light'
    ? 'light'
    : 'dark'
  if (resolvedTheme !== 'dark') return false

  const userAgent = String(options.userAgent || '')
  const isAppleWebKit = /AppleWebKit/i.test(userAgent)
  const isChromium = /Chrome|Chromium|Edg\//i.test(userAgent)
  return isAppleWebKit && !isChromium
}

export function buildPdfViewerThemeOptions(options = {}) {
  const resolvedTheme = String(options.resolvedTheme || '').trim().toLowerCase() === 'light'
    ? 'light'
    : 'dark'
  const themedPages = options.themedPages === true
  const usePageFilterFallback = options.usePageFilterFallback === true
  const pageBackground = String(options.pageBackground || '').trim()
  const pageForeground = String(options.pageForeground || '').trim()

  return {
    forcePageColors: themedPages && !usePageFilterFallback && Boolean(pageBackground && pageForeground),
    pageBackground: themedPages ? pageBackground : '',
    pageForeground: themedPages ? pageForeground : '',
    useCanvasFilterFallback: themedPages && usePageFilterFallback,
    viewerCssTheme: resolvedTheme === 'light' ? 1 : 2,
  }
}

export function buildPdfViewerSrc(fileUrl, options = {}) {
  const normalizedFileUrl = String(fileUrl || '').trim()
  if (!normalizedFileUrl) return ''

  const params = new URLSearchParams()
  params.set('file', normalizedFileUrl)
  params.set('maxcanvaspixels', String(2 ** 27))
  params.set('mindurationtoupdatecanvas', '0')
  params.set('enabledetailcanvas', 'true')

  if (options.forcePageColors) {
    params.set('forcepagecolors', 'true')
  }

  const pageBackground = String(options.pageBackground || '').trim()
  if (pageBackground) {
    params.set('pagecolorsbackground', pageBackground)
  }

  const pageForeground = String(options.pageForeground || '').trim()
  if (pageForeground) {
    params.set('pagecolorsforeground', pageForeground)
  }

  const viewerCssTheme = Number(options.viewerCssTheme || 0)
  if (Number.isInteger(viewerCssTheme) && viewerCssTheme > 0) {
    params.set('viewercsstheme', String(viewerCssTheme))
  }

  if (options.useCanvasFilterFallback) {
    params.set('altalscanvasfilterfallback', 'true')
  }

  return `/pdfjs-viewer/web/viewer.html?${params.toString()}`
}
