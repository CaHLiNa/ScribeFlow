import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'
import DOMPurify from 'dompurify'
import { visit } from 'unist-util-visit'
import { formatInlineCitation } from '../citationFormatter.js'
import { isFastPath } from '../citationStyleRegistry.js'
import { extractCitationKeysFromRaw } from './citations.js'

const SOURCE_POSITION_NODE_TYPES = new Set([
  'heading',
  'paragraph',
  'blockquote',
  'code',
  'math',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'thematicBreak',
  'footnoteDefinition',
])

function remarkSourceAnchors() {
  return (tree) => {
    visit(tree, (node) => {
      if (!SOURCE_POSITION_NODE_TYPES.has(node?.type)) return

      const start = node.position?.start
      const end = node.position?.end
      if (!start || !end) return

      const data = node.data || (node.data = {})
      const existing = data.hProperties || {}
      const classNames = Array.isArray(existing.className)
        ? [...existing.className]
        : [existing.className].filter(Boolean)

      if (!classNames.includes('md-preview-source-anchor')) {
        classNames.push('md-preview-source-anchor')
      }

      data.hProperties = {
        ...existing,
        className: classNames,
        'data-source-kind': String(node.type || ''),
        'data-source-start-line': Number(start.line || 0),
        'data-source-end-line': Number(end.line || 0),
        'data-source-start-offset': Number(start.offset || 0),
        'data-source-end-offset': Number(end.offset || 0),
      }
    })
  }
}

const markdownPreviewProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkSourceAnchors)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeHighlight, { detect: true, ignoreMissing: true })
  .use(rehypeStringify)

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g
const BRACKET_CITATION_RE = /\[([^\[\]\n]*@[a-zA-Z][\w:-]*[^\[\]\n]*)\]/g
const BARE_CITATION_RE = /(^|[\s([{\u3000])@([a-zA-Z][\w:-]*)\b/g
const SKIP_PARENT_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA'])

function parseWikiLink(raw = '') {
  let target = String(raw || '')
  let display = null
  let heading = null

  const pipeIdx = target.indexOf('|')
  if (pipeIdx !== -1) {
    display = target.slice(pipeIdx + 1).trim()
    target = target.slice(0, pipeIdx)
  }

  const hashIdx = target.indexOf('#')
  if (hashIdx !== -1) {
    heading = target.slice(hashIdx + 1).trim()
    target = target.slice(0, hashIdx)
  }

  return {
    target: target.trim(),
    display: display || null,
    heading: heading || null,
  }
}

function createWikiLinkNode(document, raw = '') {
  const parsed = parseWikiLink(raw)
  const anchor = document.createElement('a')
  anchor.className = 'md-preview-wikilink'
  anchor.dataset.target = parsed.target
  if (parsed.heading) {
    anchor.dataset.heading = parsed.heading
  }
  anchor.textContent = parsed.display || parsed.target
  return anchor
}

function createCitationNode(document, raw = '', keys = []) {
  const span = document.createElement('span')
  span.className = 'md-preview-citation'
  span.dataset.keys = keys.join(',')
  span.dataset.raw = raw
  span.textContent = raw
  span.title = raw
  return span
}

function candidateFromMatch(type, match, cursor) {
  if (!match) return null
  if (type === 'wiki') {
    return {
      type,
      start: cursor + match.index,
      end: cursor + match.index + match[0].length,
      raw: match[1],
      matchedText: match[0],
    }
  }
  if (type === 'citation-group') {
    return {
      type,
      start: cursor + match.index,
      end: cursor + match.index + match[0].length,
      raw: match[0],
      keys: extractCitationKeysFromRaw(match[1]),
    }
  }

  const prefix = match[1] || ''
  const raw = `@${match[2]}`
  return {
    type,
    start: cursor + match.index + prefix.length,
    end: cursor + match.index + prefix.length + raw.length,
    raw,
    keys: [match[2]],
  }
}

function nextInlineDraftToken(text = '', cursor = 0) {
  const remaining = text.slice(cursor)
  if (!remaining) return null

  WIKI_LINK_RE.lastIndex = 0
  BRACKET_CITATION_RE.lastIndex = 0
  BARE_CITATION_RE.lastIndex = 0

  const candidates = [
    candidateFromMatch('wiki', WIKI_LINK_RE.exec(remaining), cursor),
    candidateFromMatch('citation-group', BRACKET_CITATION_RE.exec(remaining), cursor),
    candidateFromMatch('citation-bare', BARE_CITATION_RE.exec(remaining), cursor),
  ].filter(Boolean)

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.start - b.start || a.end - b.end)
  return candidates[0]
}

function shouldSkipTextNode(node) {
  let parent = node.parentElement
  while (parent) {
    if (SKIP_PARENT_TAGS.has(parent.tagName)) return true
    if (parent.classList?.contains('md-preview-citation')) return true
    if (parent.classList?.contains('md-preview-wikilink')) return true
    parent = parent.parentElement
  }
  return false
}

function decorateInlineDraftSyntax(root) {
  const document = root.ownerDocument
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes = []

  let currentNode = walker.nextNode()
  while (currentNode) {
    textNodes.push(currentNode)
    currentNode = walker.nextNode()
  }

  for (const node of textNodes) {
    const text = node.nodeValue || ''
    if (!text.trim()) continue
    if (shouldSkipTextNode(node)) continue

    const parts = []
    let cursor = 0
    let changed = false

    while (cursor < text.length) {
      const token = nextInlineDraftToken(text, cursor)
      if (!token) {
        parts.push(document.createTextNode(text.slice(cursor)))
        break
      }

      if (token.start > cursor) {
        parts.push(document.createTextNode(text.slice(cursor, token.start)))
      }

      if (token.type === 'wiki') {
        parts.push(createWikiLinkNode(document, token.raw))
        changed = true
      } else if (token.keys?.length) {
        parts.push(createCitationNode(document, token.raw, token.keys))
        changed = true
      } else {
        parts.push(document.createTextNode(text.slice(token.start, token.end)))
      }

      cursor = token.end
    }

    if (!changed) continue

    const fragment = document.createDocumentFragment()
    for (const part of parts) {
      fragment.appendChild(part)
    }
    node.parentNode?.replaceChild(fragment, node)
  }
}

function sanitize(html = '') {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'math', 'menclose', 'msqrt', 'mroot', 'mpadded', 'mphantom', 'mstyle'],
    ADD_ATTR: ['data-target', 'data-heading', 'data-keys', 'data-raw', 'data-source-kind', 'data-source-start-line', 'data-source-end-line', 'data-source-start-offset', 'data-source-end-offset', 'mathvariant', 'encoding', 'xmlns', 'display', 'accent', 'accentunder', 'columnalign', 'columnlines', 'columnspacing', 'rowspacing', 'rowlines', 'frame', 'separator', 'stretchy', 'symmetric', 'movablelimits', 'fence', 'lspace', 'rspace', 'linethickness', 'scriptlevel'],
  })
}

function resolveCitationsFast(root, refs, style) {
  const nodes = root.querySelectorAll('.md-preview-citation')
  const isNumeric = style === 'ieee' || style === 'vancouver'
  const keyNumberMap = {}

  if (isNumeric) {
    let counter = 0
    const seen = new Set()
    nodes.forEach((node) => {
      const keys = String(node.dataset.keys || '').split(',').filter(Boolean)
      for (const key of keys) {
        if (seen.has(key)) continue
        seen.add(key)
        keyNumberMap[key] = ++counter
      }
    })
  }

  nodes.forEach((node) => {
    const keys = String(node.dataset.keys || '').split(',').filter(Boolean)
    const raw = node.dataset.raw || node.textContent || ''
    if (keys.length === 0) return

    const parts = keys.map((key) => {
      const ref = refs.getByKey(key)
      if (!ref) return `@${key}`
      return formatInlineCitation(ref, style, keyNumberMap[key])
    })

    let display
    if (isNumeric) {
      display = parts.join(', ')
    } else {
      const stripped = parts.map(part => part.replace(/^\(/, '').replace(/\)$/, ''))
      display = `(${stripped.join('; ')})`
    }

    node.textContent = display
    node.title = raw
  })
}

async function resolveCitationsCSL(root, refs, styleId) {
  const { formatWithCSL } = await import('../citationFormatterCSL.js')
  const nodes = [...root.querySelectorAll('.md-preview-citation')]
  const allKeys = []
  const seen = new Set()

  for (const node of nodes) {
    const keys = String(node.dataset.keys || '').split(',').filter(Boolean)
    for (const key of keys) {
      if (seen.has(key)) continue
      seen.add(key)
      allKeys.push(key)
    }
  }

  if (allKeys.length === 0) return

  const items = allKeys.map(key => refs.getByKey(key)).filter(Boolean)
  if (items.length === 0) return

  const inlineCache = {}
  for (const item of items) {
    const key = item._key || item.id
    try {
      inlineCache[key] = await formatWithCSL(styleId, 'inline', [item])
    } catch {
      inlineCache[key] = `@${key}`
    }
  }

  for (const node of nodes) {
    const raw = node.dataset.raw || node.textContent || ''
    const keys = String(node.dataset.keys || '').split(',').filter(Boolean)
    const display = keys.map(key => inlineCache[key] || `@${key}`).join('; ')
    node.textContent = display
    node.title = raw
  }
}

export async function renderMarkdownDraftPreview(md, refs, citationStyle = 'apa') {
  const processed = await markdownPreviewProcessor.process(String(md || ''))
  const parser = new DOMParser()
  const document = parser.parseFromString(`<body>${String(processed)}</body>`, 'text/html')
  const root = document.body

  decorateInlineDraftSyntax(root)

  if (refs) {
    if (isFastPath(citationStyle)) {
      resolveCitationsFast(root, refs, citationStyle)
    } else {
      await resolveCitationsCSL(root, refs, citationStyle)
    }
  }

  return sanitize(root.innerHTML)
}
