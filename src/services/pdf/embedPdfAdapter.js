import { createPluginRegistration } from '@embedpdf/core'
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/vue'
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue'
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/vue'
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue'

export function decodePdfBase64ToArrayBuffer(base64 = '') {
  const binary = atob(String(base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
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
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
    }),
    createPluginRegistration(RenderPluginPackage),
  ]
}
