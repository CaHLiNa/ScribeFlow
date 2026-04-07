import { getDocumentAdapterForFile } from '../../services/documentWorkflow/adapters/index.js'
import { isMarkdown } from '../../utils/fileTypes.js'

function defaultCitationText(keys = []) {
  const joined = keys.map((key) => `@${key}`).join('; ')
  return `[${joined}]`
}

export function createDocumentCitationRuntime() {
  function resolveAdapter(filePath = '') {
    return filePath ? getDocumentAdapterForFile(filePath) : null
  }

  function supportsInsertion(filePath = '') {
    const adapter = resolveAdapter(filePath)
    if (adapter?.citationSyntax?.supportsInsertion) {
      return !!adapter.citationSyntax.supportsInsertion(filePath)
    }
    return isMarkdown(filePath)
  }

  function buildCitationText(filePath, keys, options = {}) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
    if (list.length === 0) return ''

    const adapter = resolveAdapter(filePath)
    if (adapter?.citationSyntax?.buildText) {
      return adapter.citationSyntax.buildText(filePath, list, options)
    }

    return isMarkdown(filePath) ? defaultCitationText(list) : ''
  }

  return {
    resolveAdapter,
    supportsInsertion,
    buildCitationText,
  }
}
