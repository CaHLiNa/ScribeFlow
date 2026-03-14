import { autocompletion } from '@codemirror/autocomplete'
import { isTypst } from '../../utils/fileTypes.js'
import { createTypstCompletionSource, collectTypstReferenceOptions } from './completions.js'
import { typstHighlightExtension } from './highlight.js'
import { createTypstSnippetCompletions } from './snippets.js'
import { extractTypstLabels } from './utils.js'

export function supportsTypstEditorSupport(filePath) {
  return isTypst(filePath)
}

export function createTypstEditorSupport(options = {}) {
  const completionSource = createTypstCompletionSource(options)

  return [
    ...typstHighlightExtension(options),
    autocompletion({
      override: [completionSource],
      activateOnTyping: true,
      activateOnTypingDelay: 0,
      defaultKeymap: true,
    }),
  ]
}

export {
  createTypstCompletionSource,
  collectTypstReferenceOptions,
  createTypstSnippetCompletions,
  extractTypstLabels,
  typstHighlightExtension,
}
