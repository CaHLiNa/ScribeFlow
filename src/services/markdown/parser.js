import { extractMarkdownHeadingItems as extractMarkdownHeadingItemsFromRuntime } from './runtimeBridge.js'

export async function extractMarkdownHeadingItems(content = '') {
  return extractMarkdownHeadingItemsFromRuntime(content)
}

export async function extractMarkdownHeadingTexts(content = '') {
  const items = await extractMarkdownHeadingItems(content)
  return items.map((item) => ({
    text: item.text,
    level: item.level,
    offset: item.offset,
    kind: item.kind,
  }))
}
