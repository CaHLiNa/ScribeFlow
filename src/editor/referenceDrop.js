import { isLatex, isMarkdown, isTypst } from '../utils/fileTypes.js'

export function buildReferenceDropText(filePath, keys) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
  if (list.length === 0) return ''
  if (isMarkdown(filePath)) {
    return `[${list.map((key) => `@${key}`).join('; ')}]`
  }
  if (isLatex(filePath)) {
    return `\\cite{${list.join(', ')}}`
  }
  if (isTypst(filePath)) {
    return list.map((key) => `@${key}`).join(' ')
  }
  return ''
}
