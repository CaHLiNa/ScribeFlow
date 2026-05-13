import { createPluginRegistration } from '@embedpdf/core'
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/vue'
import { ExportPluginPackage } from '@embedpdf/plugin-export/vue'
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/vue'
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue'
import { SearchPluginPackage } from '@embedpdf/plugin-search/vue'
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/vue'
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/vue'
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/vue'
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/vue'
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue'
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/vue'

function resolveEmbedPdfSpreadMode(value) {
  return String(value || '').trim().toLowerCase() === 'double'
    ? SpreadMode.Odd
    : SpreadMode.None
}

function resolveEmbedPdfZoomLevel(options = {}) {
  const initialScaleValue = String(options.initialViewState?.scaleValue || '').trim().toLowerCase()
  const zoomMode = String(options.pdfViewerZoomMode || '').trim().toLowerCase()
  const lastScale = String(options.pdfViewerLastScale || '').trim().toLowerCase()

  if (initialScaleValue) {
    if (initialScaleValue === 'page-fit') return ZoomMode.FitPage
    if (initialScaleValue === 'page-width') return ZoomMode.FitWidth
    if (initialScaleValue === 'auto') return ZoomMode.Automatic

    const numericInitialScale = Number(initialScaleValue)
    if (Number.isFinite(numericInitialScale) && numericInitialScale > 0) {
      return numericInitialScale
    }
  }

  if (zoomMode === 'page-fit') return ZoomMode.FitPage
  if (zoomMode === 'remember-last' && lastScale) {
    if (lastScale === 'page-fit') return ZoomMode.FitPage
    if (lastScale === 'page-width') return ZoomMode.FitWidth
    if (lastScale === 'auto') return ZoomMode.Automatic

    const numericScale = Number(lastScale)
    if (Number.isFinite(numericScale) && numericScale > 0) {
      return numericScale
    }
  }

  return ZoomMode.FitWidth
}

export function decodePdfBase64ToArrayBuffer(base64 = '') {
  const binary = atob(normalizeBase64Payload(base64))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function normalizeBase64Payload(base64 = '') {
  return String(base64 || '').replace(/\s/g, '')
}

function base64DecodedByteLength(base64 = '') {
  const normalized = normalizeBase64Payload(base64)
  if (!normalized) return 0

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

function nextDecodeTurn() {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise(resolve => requestAnimationFrame(() => resolve()))
  }

  return new Promise(resolve => setTimeout(resolve, 0))
}

export async function decodePdfBase64ToArrayBufferAsync(base64 = '', options = {}) {
  const normalized = normalizeBase64Payload(base64)
  if (!normalized) return new ArrayBuffer(0)

  const chunkChars = Math.max(
    4,
    Math.floor(Number(options.chunkChars || 262_144) / 4) * 4,
  )
  const bytes = new Uint8Array(base64DecodedByteLength(normalized))
  let offset = 0

  for (let index = 0; index < normalized.length; index += chunkChars) {
    const binary = atob(normalized.slice(index, index + chunkChars))
    for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
      bytes[offset] = binary.charCodeAt(byteIndex)
      offset += 1
    }

    if (index + chunkChars < normalized.length) {
      await nextDecodeTurn()
    }
  }

  return bytes.buffer
}

export function encodePdfArrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

export function buildEmbedPdfPluginRegistrations(options = {}) {
  const documentBuffer = options.documentBuffer
  const documentName = String(options.documentName || 'document.pdf').trim() || 'document.pdf'

  if (!(documentBuffer instanceof ArrayBuffer)) {
    return []
  }

  return [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [
        {
          buffer: documentBuffer,
          name: documentName,
        },
      ],
      maxDocuments: 1,
    }),
    createPluginRegistration(ViewportPluginPackage, {
      viewportGap: 12,
    }),
    createPluginRegistration(InteractionManagerPluginPackage, {
      exclusionRules: {
        dataAttributes: ['data-no-embedpdf-interaction'],
      },
    }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
    }),
    createPluginRegistration(SpreadPluginPackage, {
      defaultSpreadMode: resolveEmbedPdfSpreadMode(options.pdfViewerSpreadMode),
    }),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: resolveEmbedPdfZoomLevel(options),
    }),
    createPluginRegistration(ExportPluginPackage, {
      defaultFileName: documentName,
    }),
    createPluginRegistration(SearchPluginPackage, {
      showAllResults: true,
    }),
    createPluginRegistration(SelectionPluginPackage, {
      menuHeight: 34,
    }),
    createPluginRegistration(ThumbnailPluginPackage, {
      width: 96,
      gap: 10,
      labelHeight: 16,
      autoScroll: true,
      scrollBehavior: 'smooth',
      imagePadding: 0,
      paddingY: 8,
    }),
    createPluginRegistration(RenderPluginPackage),
  ]
}
