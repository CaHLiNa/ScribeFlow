import { hoverTooltip, tooltips } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import katex from 'katex'

const FOOTNOTE_REF_RE = /\[\^([^\]\s]+)\]/g
const FOOTNOTE_DEF_RE = /^\[\^([^\]\s]+)\]:\s*(.*)$/gm
const DISPLAY_MATH_RE = /(^|[^\\])\$\$([\s\S]+?)\$\$/g
const INLINE_MATH_RE = /(^|[^\\$])\$([^\n$][\s\S]*?[^\n\\$]?)\$/g

function isInCodeContext(state, from, to) {
  let inCode = false
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const name = node.type.name
      if (
        name === 'CodeBlock' || name === 'FencedCode' || name === 'CodeText'
        || name === 'InlineCode' || name === 'CodeMark' || name === 'CodeInfo'
      ) {
        inCode = true
        return false
      }
    },
  })
  return inCode
}

function escapeHtml(text = '') {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createMathHoverDom(source, displayMode, labels) {
  const dom = document.createElement('div')
  dom.className = 'cm-markdown-draft-hover__body'

  const eyebrow = document.createElement('div')
  eyebrow.className = 'cm-markdown-draft-hover__eyebrow'
  eyebrow.textContent = displayMode ? labels.displayMath : labels.inlineMath
  dom.appendChild(eyebrow)

  const preview = document.createElement('div')
  preview.className = `cm-markdown-draft-hover__math${displayMode ? ' is-display' : ''}`
  try {
    preview.innerHTML = katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: 'ignore',
    })
  } catch {
    preview.textContent = source
  }
  dom.appendChild(preview)

  const code = document.createElement('div')
  code.className = 'cm-markdown-draft-hover__code'
  code.textContent = displayMode ? `$$${source}$$` : `$${source}$`
  dom.appendChild(code)

  return dom
}

function createFootnoteHoverDom(id, content, labels) {
  const dom = document.createElement('div')
  dom.className = 'cm-markdown-draft-hover__body'
  dom.innerHTML = `
    <div class="cm-markdown-draft-hover__eyebrow">${escapeHtml(labels.footnote)}</div>
    <div class="cm-markdown-draft-hover__title">[^${escapeHtml(id)}]</div>
    <div class="cm-markdown-draft-hover__headline">${escapeHtml(content || labels.footnoteNotFound)}</div>
  `
  return dom
}

function extractFootnoteMap(doc = '') {
  const source = String(doc || '')
  const map = new Map()

  FOOTNOTE_DEF_RE.lastIndex = 0
  let match
  while ((match = FOOTNOTE_DEF_RE.exec(source)) !== null) {
    const lines = [match[2].trim()]
    let cursor = match.index + match[0].length

    while (cursor < source.length) {
      const nextNewline = source.indexOf('\n', cursor)
      const lineEnd = nextNewline === -1 ? source.length : nextNewline
      const line = source.slice(cursor + 1, lineEnd)
      if (/^( {2,}|\t)/.test(line)) {
        lines.push(line.replace(/^( {2,}|\t)/, '').trim())
        cursor = lineEnd
        continue
      }
      break
    }

    map.set(match[1], lines.filter(Boolean).join('\n'))
  }

  return map
}

function findFootnoteAt(view, pos) {
  const doc = view.state.doc.toString()
  const footnotes = extractFootnoteMap(doc)

  FOOTNOTE_REF_RE.lastIndex = 0
  let match
  while ((match = FOOTNOTE_REF_RE.exec(doc)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (pos < start || pos > end) continue
    if (isInCodeContext(view.state, start, end)) continue
    return {
      id: match[1],
      from: start,
      to: end,
      content: footnotes.get(match[1]) || '',
    }
  }

  return null
}

function findMathAt(view, pos) {
  const doc = view.state.doc.toString()

  DISPLAY_MATH_RE.lastIndex = 0
  let match
  while ((match = DISPLAY_MATH_RE.exec(doc)) !== null) {
    const start = match.index + match[1].length
    const end = start + match[0].length - match[1].length
    if (pos < start || pos > end) continue
    if (isInCodeContext(view.state, start, end)) continue
    return {
      from: start,
      to: end,
      source: match[2].trim(),
      displayMode: true,
    }
  }

  INLINE_MATH_RE.lastIndex = 0
  while ((match = INLINE_MATH_RE.exec(doc)) !== null) {
    const start = match.index + match[1].length
    const end = start + match[0].length - match[1].length
    if (pos < start || pos > end) continue
    if (isInCodeContext(view.state, start, end)) continue
    return {
      from: start,
      to: end,
      source: match[2].trim(),
      displayMode: false,
    }
  }

  return null
}

function createFootnoteHoverExtension(labels) {
  return hoverTooltip((view, pos) => {
    const hit = findFootnoteAt(view, pos)
    if (!hit) return null

    return {
      pos: hit.from,
      end: hit.to,
      above: false,
      clip: false,
      class: 'cm-markdown-draft-hover',
      create() {
        const dom = createFootnoteHoverDom(hit.id, hit.content, labels)
        return { dom }
      },
    }
  }, {
    hoverTime: 220,
    hideOnChange: 'touch',
  })
}

function createMathHoverExtension(labels) {
  return hoverTooltip((view, pos) => {
    const hit = findMathAt(view, pos)
    if (!hit || !hit.source) return null

    return {
      pos: hit.from,
      end: hit.to,
      above: false,
      clip: false,
      class: 'cm-markdown-draft-hover',
      create() {
        const dom = createMathHoverDom(hit.source, hit.displayMode, labels)
        return { dom }
      },
    }
  }, {
    hoverTime: 220,
    hideOnChange: 'touch',
  })
}

export function createMarkdownDraftEditorExtensions(options = {}) {
  const t = typeof options.t === 'function' ? options.t : (value) => value
  const tooltipConfig = {
    position: 'fixed',
  }

  if (typeof document !== 'undefined' && document.body) {
    tooltipConfig.parent = document.body
  }

  const labels = {
    footnote: t('Footnote'),
    displayMath: t('Display math'),
    inlineMath: t('Inline math'),
    footnoteNotFound: t('Footnote not found'),
  }

  const extensions = [
    tooltips(tooltipConfig),
    createFootnoteHoverExtension(labels),
    createMathHoverExtension(labels),
  ]

  return extensions
}
