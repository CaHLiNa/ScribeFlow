import { extractMarkdownHeadingItems } from './parser.ts'

export async function buildMarkdownOutlineItems(content = '') {
  return extractMarkdownHeadingItems(content)
}
