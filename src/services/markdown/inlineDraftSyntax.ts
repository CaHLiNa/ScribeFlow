const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g
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
  return null
}

function nextInlineDraftToken(text = '', cursor = 0) {
  const remaining = text.slice(cursor)
  if (!remaining) return null

  WIKI_LINK_RE.lastIndex = 0

  const candidates = [
    candidateFromMatch('wiki', WIKI_LINK_RE.exec(remaining), cursor),
  ].filter(Boolean)

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.start - b.start || a.end - b.end)
  return candidates[0]
}

function shouldSkipTextNode(node) {
  let parent = node.parentElement
  while (parent) {
    if (SKIP_PARENT_TAGS.has(parent.tagName)) return true
    if (parent.classList?.contains('md-preview-wikilink')) return true
    parent = parent.parentElement
  }
  return false
}

export function decorateInlineDraftSyntax(root) {
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
