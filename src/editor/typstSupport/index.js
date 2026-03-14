import { isTypst } from '../../utils/fileTypes.js'
import { createTypstCompletionSource, collectTypstReferenceOptions } from './completions.js'
import { typstHighlightExtension } from './highlight.js'
import { createTypstSnippetCompletions } from './snippets.js'
import { extractTypstLabels } from './utils.js'

export function supportsTypstEditorSupport(filePath) {
  return isTypst(filePath)
}

export {
  createTypstCompletionSource,
  collectTypstReferenceOptions,
  createTypstSnippetCompletions,
  extractTypstLabels,
  typstHighlightExtension,
}
