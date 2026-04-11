import { autocompletion } from '@codemirror/autocomplete'
import { isTypst } from '../../../utils/fileTypes.js'
import { createTinymistTypstCompletionSource } from './completions.js'
import { createTinymistTypstHighlightExtension } from './highlight.js'
import { createTinymistTypstInlayHintsExtension } from './inlayHints.js'

export function supportsTinymistTypstEditor(filePath) {
  return isTypst(filePath)
}

export function createTinymistTypstEditorExtensions(options = {}) {
  const completionSource = createTinymistTypstCompletionSource(options)

  return [
    ...createTinymistTypstHighlightExtension(options),
    ...createTinymistTypstInlayHintsExtension(options),
    autocompletion({
      override: [completionSource],
      activateOnTyping: true,
      activateOnTypingDelay: 0,
      defaultKeymap: true,
    }),
  ]
}
