import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

const markdownDraftParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)

export function parseMarkdownDraft(content = '') {
  const source = String(content || '')
  return markdownDraftParser.parse(source)
}
