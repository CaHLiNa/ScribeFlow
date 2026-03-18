import { extractMarkdownHeadingItems } from './parser.js'

export function buildMarkdownOutlineItems(content = '') {
  return extractMarkdownHeadingItems(content)
}
