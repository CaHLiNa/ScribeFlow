import { Decoration, ViewPlugin } from '@codemirror/view'
import { buildTypstLabelSet } from '../../../editor/typstDocument.js'
import {
  subscribeTinymistSemanticTokens,
  subscribeTinymistStatus,
} from '../session.js'
import { tinymistPositionToOffset } from '../textEdits.js'

const HEADING_RE = /^(={1,6})(\s+)(.+)$/gm
const COMMENT_RE = /\/\/.*$/gm
const MATH_RE = /\$[^$\n]+\$/g
const COMMAND_RE = /#([A-Za-z][\w-]*)/g
const RAW_RE = /`[^`\n]+`/g
const LABEL_RE = /<([A-Za-z][\w:-]*)>/g
const CITE_RE = /(^|[^\w])@([A-Za-z][\w:-]*)/gm

function addMark(decorations, from, to, className) {
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
    decorations.push(Decoration.mark({ class: className }).range(from, to))
  }
}

function semanticTokenClassNames(tokenType, modifierMask, legend = {}) {
  const classes = []
  if (tokenType) {
    classes.push(`cm-tinymist-token-${tokenType}`)
  }

  const modifiers = Array.isArray(legend?.tokenModifiers) ? legend.tokenModifiers : []
  modifiers.forEach((modifier, index) => {
    if ((modifierMask & (1 << index)) !== 0) {
      classes.push(`cm-tinymist-mod-${modifier}`)
    }
  })

  return classes.join(' ')
}

function buildSemanticTokenDecorations(state, semanticPayload = null) {
  const legend = semanticPayload?.legend
  const data = semanticPayload?.tokens?.data
  if (!legend || !Array.isArray(legend.tokenTypes) || !Array.isArray(data) || data.length === 0) {
    return []
  }

  const decorations = []
  let line = 0
  let character = 0

  for (let index = 0; index < data.length; index += 5) {
    const deltaLine = data[index]
    const deltaStart = data[index + 1]
    const length = data[index + 2]
    const tokenTypeIndex = data[index + 3]
    const modifierMask = data[index + 4]

    line += deltaLine
    character = deltaLine === 0 ? character + deltaStart : deltaStart

    const tokenType = legend.tokenTypes[tokenTypeIndex]
    const className = semanticTokenClassNames(tokenType, modifierMask, legend)
    if (!className) continue

    const from = tinymistPositionToOffset(state, { line, character })
    addMark(decorations, from, from + length, className)
  }

  return decorations
}

function buildReferenceDecorations(view, options = {}, labelSet = new Set()) {
  const decorations = []
  const { from, to } = view.viewport
  const start = view.state.doc.lineAt(Math.max(0, from)).from
  const end = view.state.doc.lineAt(Math.min(view.state.doc.length, to)).to
  const text = view.state.doc.sliceString(start, end)
  const getReferenceByKey = options.getReferenceByKey || (() => null)

  let match
  CITE_RE.lastIndex = 0
  while ((match = CITE_RE.exec(text)) !== null) {
    const boundaryLength = match[1]?.length || 0
    const key = match[2]
    const citeFrom = start + match.index + boundaryLength
    const citeTo = citeFrom + key.length + 1
    if (labelSet.has(key)) continue

    const ref = getReferenceByKey(key)
    const className = !ref
      ? 'cm-citation-key-broken'
      : ref._needsReview
        ? 'cm-citation-key-review'
        : 'cm-citation-key'

    addMark(decorations, citeFrom, citeTo, className)
  }

  return decorations
}

function buildFallbackDecorations(view, options = {}, labelSet = new Set()) {
  const decorations = []
  const { from, to } = view.viewport
  const start = view.state.doc.lineAt(Math.max(0, from)).from
  const end = view.state.doc.lineAt(Math.min(view.state.doc.length, to)).to
  const text = view.state.doc.sliceString(start, end)
  const getReferenceByKey = options.getReferenceByKey || (() => null)

  let match
  COMMENT_RE.lastIndex = 0
  while ((match = COMMENT_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-comment')
  }

  HEADING_RE.lastIndex = 0
  while ((match = HEADING_RE.exec(text)) !== null) {
    const headingFrom = start + match.index
    addMark(decorations, headingFrom, headingFrom + match[1].length, 'cm-typst-heading-mark')
    addMark(
      decorations,
      headingFrom + match[1].length + match[2].length,
      headingFrom + match[0].length,
      'cm-typst-heading',
    )
  }

  COMMAND_RE.lastIndex = 0
  while ((match = COMMAND_RE.exec(text)) !== null) {
    const commandFrom = start + match.index
    addMark(decorations, commandFrom, commandFrom + match[0].length, 'cm-typst-command')
  }

  RAW_RE.lastIndex = 0
  while ((match = RAW_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-raw')
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
    if (labelSet.has(key)) {
      addMark(decorations, citeFrom, citeTo, 'cm-typst-reference')
      continue
    }

    const ref = getReferenceByKey(key)
    const className = !ref
      ? 'cm-citation-key-broken'
      : ref._needsReview
        ? 'cm-citation-key-review'
        : 'cm-citation-key'
    addMark(decorations, citeFrom, citeTo, className)
  }

  MATH_RE.lastIndex = 0
  while ((match = MATH_RE.exec(text)) !== null) {
    addMark(decorations, start + match.index, start + match.index + match[0].length, 'cm-typst-math')
  }

  return decorations
}

export function createTinymistTypstHighlightExtension(options = {}) {
  return [
    ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.labelSet = buildTypstLabelSet(view.state.doc.toString())
          this.semanticPayload = null
          this.tinymistActive = false
          this.cleanupSemanticTokens = subscribeTinymistSemanticTokens(options.filePath, (payload) => {
            this.semanticPayload = payload
            this.decorations = this.rebuildDecorations(view)
          })
          this.cleanupTinymistStatus = subscribeTinymistStatus((status) => {
            this.tinymistActive = status.available === true
            this.decorations = this.rebuildDecorations(view)
          })
          this.decorations = this.rebuildDecorations(view)
        }

        rebuildDecorations(view) {
          const semanticDecorations = this.tinymistActive
            ? buildSemanticTokenDecorations(view.state, this.semanticPayload)
            : []
          const extraDecorations = this.tinymistActive && semanticDecorations.length > 0
            ? buildReferenceDecorations(view, options, this.labelSet)
            : []
          const fallbackDecorations = (!this.tinymistActive || semanticDecorations.length === 0)
            ? buildFallbackDecorations(view, options, this.labelSet)
            : []
          return Decoration.set(
            [...semanticDecorations, ...extraDecorations, ...fallbackDecorations]
              .sort((left, right) => left.from - right.from),
          )
        }

        update(update) {
          if (update.docChanged) {
            this.labelSet = buildTypstLabelSet(update.state.doc.toString())
          }
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.rebuildDecorations(update.view)
          }
        }

        destroy() {
          this.cleanupSemanticTokens?.()
          this.cleanupTinymistStatus?.()
        }
      },
      { decorations: plugin => plugin.decorations },
    ),
  ]
}
