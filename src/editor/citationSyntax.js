import { getDocumentAdapterForFile } from '../services/documentWorkflow/adapters/index.js'

function defaultCitationText(keys) {
  const joined = keys.map(key => `@${key}`).join('; ')
  return `[${joined}]`
}

export function supportsCitationInsertion(filePath) {
  if (!filePath) return false
  return !!getDocumentAdapterForFile(filePath)?.citationSyntax?.supportsInsertion?.(filePath)
}

export function buildCitationText(filePath, keys, options = {}) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
  if (list.length === 0) return ''

  const adapter = getDocumentAdapterForFile(filePath)
  if (adapter?.citationSyntax?.buildText) {
    return adapter.citationSyntax.buildText(filePath, list, options)
  }
  return defaultCitationText(list)
}
