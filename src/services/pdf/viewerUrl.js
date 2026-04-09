export function buildPdfViewerSrc(fileUrl, options = {}) {
  const normalizedFileUrl = String(fileUrl || '').trim()
  if (!normalizedFileUrl) return ''

  const params = new URLSearchParams()
  params.set('file', normalizedFileUrl)

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

  return `/pdfjs-viewer/web/viewer.html?${params.toString()}`
}
