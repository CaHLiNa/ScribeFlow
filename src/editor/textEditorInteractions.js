import { isImage, relativePath } from '../utils/fileTypes'

const TYPST_CITATION_RE = /@([a-zA-Z][\w.-]*)/g
export const TYPST_CITATION_GROUP_RE = /@[a-zA-Z][\w.-]*(?:\s+@[a-zA-Z][\w.-]*)*/g

export function parseCitationGroup(text) {
  const inner = text.slice(1, -1)
  const parts = inner.split(/\s*;\s*|\s*,\s*(?=@)/).map((part) => part.trim()).filter(Boolean)
  const cites = []

  for (const part of parts) {
    const keyMatch = part.match(/@([a-zA-Z][\w]*)/)
    if (!keyMatch) continue

    const key = keyMatch[1]
    const afterKey = part.substring(part.indexOf(keyMatch[0]) + keyMatch[0].length).replace(/^[\s,]+/, '')
    const prefix = part.substring(0, part.indexOf(keyMatch[0])).trim()
    cites.push({ key, locator: afterKey, prefix })
  }

  return cites
}

export function parseTypstCitationGroup(text) {
  TYPST_CITATION_RE.lastIndex = 0
  const cites = []
  let match

  while ((match = TYPST_CITATION_RE.exec(text)) !== null) {
    cites.push({ key: match[1], locator: '', prefix: '' })
  }

  return cites
}

export function buildInsertText(paths, options) {
  const { filePath, isMarkdownFile, isLatexFile } = options

  return paths.map((path) => {
    const relPath = relativePath(filePath, path)
    const fileName = path.split('/').pop()
    const nameNoExt = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName

    if (isMarkdownFile) {
      return isImage(path) ? `![${nameNoExt}](${relPath})` : `[${fileName}](${relPath})`
    }
    if (isLatexFile) {
      return isImage(path) ? `\\includegraphics{${relPath}}` : `\\input{${relPath}}`
    }
    return relPath
  }).join('\n')
}
