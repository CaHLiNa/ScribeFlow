function parsePdfPageBackground(color = '') {
  const normalized = String(color || '').trim().toLowerCase()

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
    }
  }

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return {
      r: parseInt(`${normalized[1]}${normalized[1]}`, 16),
      g: parseInt(`${normalized[2]}${normalized[2]}`, 16),
      b: parseInt(`${normalized[3]}${normalized[3]}`, 16),
    }
  }

  const rgbMatch = normalized.match(
    /^rgb\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})\s*\)$/
  )
  if (!rgbMatch) return null

  return {
    r: Math.min(255, Math.max(0, Number(rgbMatch[1] || 0))),
    g: Math.min(255, Math.max(0, Number(rgbMatch[2] || 0))),
    b: Math.min(255, Math.max(0, Number(rgbMatch[3] || 0))),
  }
}

function shouldTreatPdfPageAsDark(pageBackground = '', resolvedTheme = 'dark') {
  const parsedColor = parsePdfPageBackground(pageBackground)
  if (!parsedColor) {
    return String(resolvedTheme || '').trim().toLowerCase() !== 'light'
  }

  const luminance =
    (0.2126 * parsedColor.r + 0.7152 * parsedColor.g + 0.0722 * parsedColor.b) / 255
  return luminance < 0.58
}

export function shouldUsePdfCanvasFilterFallback(options = {}) {
  if (options.themedPages !== true) return false
  const userAgent = String(options.userAgent || '')
  const isAppleWebKit = /AppleWebKit/i.test(userAgent)
  const isChromium = /Chrome|Chromium|Edg\//i.test(userAgent)
  if (!isAppleWebKit || isChromium) return false

  return shouldTreatPdfPageAsDark(options.pageBackground, options.resolvedTheme)
}

export function buildPdfViewerThemeOptions(options = {}) {
  const resolvedTheme = String(options.resolvedTheme || '').trim().toLowerCase() === 'light'
    ? 'light'
    : 'dark'
  const themedPages = options.themedPages === true
  const usePageFilterFallback = options.usePageFilterFallback === true
  const pageBackground = String(options.pageBackground || '').trim()
  const pageForeground = String(options.pageForeground || '').trim()
  const viewerThemeMode =
    themedPages && pageBackground
      ? (shouldTreatPdfPageAsDark(pageBackground, resolvedTheme) ? 'dark' : 'light')
      : resolvedTheme

  return {
    forcePageColors: themedPages && !usePageFilterFallback && Boolean(pageBackground && pageForeground),
    pageBackground: themedPages ? pageBackground : '',
    pageForeground: themedPages ? pageForeground : '',
    useCanvasFilterFallback: themedPages && usePageFilterFallback,
    viewerCssTheme: viewerThemeMode === 'light' ? 1 : 2,
  }
}

export function normalizePdfViewerLocale(value = '') {
  return String(value || '').trim().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function buildPdfViewerSrc(fileUrl, options = {}) {
  const normalizedFileUrl = String(fileUrl || '').trim()
  if (!normalizedFileUrl) return ''

  const params = new URLSearchParams()
  params.set('file', normalizedFileUrl)
  params.set('maxcanvaspixels', String(2 ** 27))
  params.set('mindurationtoupdatecanvas', '32')
  params.set('enabledetailcanvas', 'true')

  const normalizedLocale = String(options.locale || '').trim()
  if (normalizedLocale) {
    params.set('locale', normalizePdfViewerLocale(normalizedLocale))
  }

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
