import { extractMarkdownHeadingItems } from './parser.js'

export async function buildMarkdownOutlineItems(content = '') {
  return extractMarkdownHeadingItems(content)
}
