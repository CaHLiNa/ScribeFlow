import { createDocumentCitationRuntime } from '../domains/document/documentCitationRuntime.js'

const documentCitationRuntime = createDocumentCitationRuntime()

export function buildReferenceDropText(filePath, keys, options = {}) {
  return documentCitationRuntime.buildCitationText(filePath, keys, options)
}
