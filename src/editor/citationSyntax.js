import { isLatex, isMarkdown, isTypst } from '../utils/fileTypes'

export function supportsCitationInsertion(filePath) {
  if (!filePath) return false
  return isMarkdown(filePath) || isLatex(filePath) || isTypst(filePath)
}

export function buildCitationText(filePath, keys, options = {}) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
  if (list.length === 0) return ''

  if (filePath && isLatex(filePath)) {
    const command = options.latexCommand || 'cite'
    return `\\${command}{${list.join(', ')}}`
  }

  if (filePath && isTypst(filePath)) {
    return list.map(key => `@${key}`).join(' ')
  }

  const joined = list.map(key => `@${key}`).join('; ')
  return `[${joined}]`
}
