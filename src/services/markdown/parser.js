import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'

const markdownDraftParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)

function bibliographyKindForHeading(text = '') {
  const normalized = String(text || '').trim().toLowerCase()
  if (!normalized) return null
  if (['references', 'bibliography', 'works cited', '参考文献'].includes(normalized)) {
    return 'bibliography'
  }
  return null
}

export function parseMarkdownDraft(content = '') {
  const source = String(content || '')
  return markdownDraftParser.parse(source)
}

export function extractMarkdownHeadingItems(content = '') {
  const tree = parseMarkdownDraft(content)
  const items = []

  visit(tree, 'heading', (node) => {
    const text = toString(node).trim()
    if (!text) return

    const kind = bibliographyKindForHeading(text) || 'heading'

    items.push({
      kind,
      text,
      level: Math.max(1, Number(node.depth) || 1),
      displayLevel: Math.max(1, Number(node.depth) || 1),
      offset: node.position?.start?.offset || 0,
    })
  })

  return items
}

export function extractMarkdownHeadingTexts(content = '') {
  return extractMarkdownHeadingItems(content).map(item => ({
    text: item.text,
    level: item.level,
    offset: item.offset,
    kind: item.kind,
  }))
}
