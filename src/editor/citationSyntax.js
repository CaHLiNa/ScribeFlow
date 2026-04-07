import { createDocumentCitationRuntime } from '../domains/document/documentCitationRuntime.js'

const documentCitationRuntime = createDocumentCitationRuntime()

export function supportsCitationInsertion(filePath) {
  return documentCitationRuntime.supportsInsertion(filePath)
}

export function buildCitationText(filePath, keys, options = {}) {
  return documentCitationRuntime.buildCitationText(filePath, keys, options)
}
