import { Decoration, ViewPlugin } from '@codemirror/view'
import { buildTypstLabelSet } from './utils.js'

const HEADING_RE = /^(={1,6})(\s+)(.+)$/gm
const COMMENT_RE = /\/\/.*$/gm
const COMMAND_RE = /#([A-Za-z][\w-]*)/g
const CITE_RE = /(^|[^\w])@([A-Za-z][\w:-]*)/gm
const LABEL_RE = /<([A-Za-z][\w:-]*)>/g
const STRING_RE = /"(?:[^"\\]|\\.)*"/g
const MATH_RE = /\$(?:[^$\n\\]|\\.)+\$/g

function addMark(decorations, from, to, className) {
  if (to > from) {
    decorations.push(Decoration.mark({ class: className }).range(from, to))
  }
}

function buildDecorations(view, options = {}, labelSet = new Set()) {
  const decorations = []
  const { from, to } = view.viewport
  const start = view.state.doc.lineAt(Math.max(0, from)).from
  const end = view.state.doc.lineAt(Math.min(view.state.doc.length, to)).to
  const text = view.state.doc.sliceString(start, end)
  const getReferenceByKey = options.getReferenceByKey || (() => null)

  HEADING_RE.lastIndex = 0
  let match
  while ((match = HEADING_RE.exec(text)) !== null) {
    const lineStart = start + match.index
    addMark(decorations, lineStart, lineStart + match[1].length, 'cm-typst-heading-mark')
    addMark(
      decorations,
      lineStart + match[1].length + match[2].length,
      lineStart + match[0].length,
      'cm-typst-heading-text',
    )
  }

  COMMENT_RE.lastIndex = 0
  while ((match = COMMENT_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-comment')
  }

  COMMAND_RE.lastIndex = 0
  while ((match = COMMAND_RE.exec(text)) !== null) {
    const commandStart = start + match.index
    addMark(decorations, commandStart, commandStart + 1, 'cm-typst-command-mark')
    addMark(decorations, commandStart + 1, commandStart + match[0].length, 'cm-typst-command')
  }

  LABEL_RE.lastIndex = 0
  while ((match = LABEL_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-label')
  }

  CITE_RE.lastIndex = 0
  while ((match = CITE_RE.exec(text)) !== null) {
    const boundaryLength = match[1]?.length || 0
    const key = match[2]
    const citeFrom = start + match.index + boundaryLength
    const citeTo = citeFrom + key.length + 1
    const className = labelSet.has(key)
      ? 'cm-typst-label-ref'
      : (() => {
          const ref = getReferenceByKey(key)
          if (!ref) return 'cm-citation-key-broken'
          if (ref._needsReview) return 'cm-citation-key-review'
          return 'cm-citation-key'
        })()

    addMark(decorations, citeFrom, citeTo, className)
  }

  STRING_RE.lastIndex = 0
  while ((match = STRING_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-string')
  }

  MATH_RE.lastIndex = 0
  while ((match = MATH_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-math')
  }

  return Decoration.set(decorations.sort((a, b) => a.from - b.from))
}

export function typstHighlightExtension(options = {}) {
  return [
    ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.labelSet = buildTypstLabelSet(view.state.doc.toString())
          this.decorations = buildDecorations(view, options, this.labelSet)
        }

        update(update) {
          if (update.docChanged) {
            this.labelSet = buildTypstLabelSet(update.state.doc.toString())
          }
          if (update.docChanged || update.viewportChanged) {
            this.decorations = buildDecorations(update.view, options, this.labelSet)
          }
        }
      },
      { decorations: plugin => plugin.decorations },
    ),
  ]
}
