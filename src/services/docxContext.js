/** Full document text for AI (chat tools, @file refs).
 * Walks the doc manually to skip text nodes with trackDelete marks (pending
 * tracked-change deletions). Including them causes the AI to see both old and
 * new text concatenated, leading to cascading garbled edits. */
export function extractDocumentText(state) {
  const parts = []
  state.doc.descendants((node) => {
    if (node.isText) {
      if (!node.marks.some(m => m.type.name === 'trackDelete')) parts.push(node.text)
      return false
    }
    if (node.isBlock && parts.length && parts[parts.length - 1] !== '\n') parts.push('\n')
    return true
  })
  return parts.join('')
}

/** Numbered block list for DOCX AI editing.
 * Returns one entry per non-empty paragraph/heading, in document order.
 * The `num` field (1-indexed) is stable within a single read — use it as
 * the address in edit_file's paragraph_number param. */
export function extractBlockList(state) {
  const blocks = []
  state.doc.descendants((node) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) blocks.push({ num: blocks.length + 1, node, text })
      return false
    }
    return true
  })
  return blocks
}
