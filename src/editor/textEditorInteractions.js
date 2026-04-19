import { isImage, relativePath } from '../utils/fileTypes'
import { basenamePath, stripExtension } from '../utils/path'

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

export function buildInsertText(paths, options) {
  const { filePath, isMarkdownFile, isLatexFile } = options

  return paths.map((path) => {
    const relPath = relativePath(filePath, path)
    const fileName = basenamePath(path)
    const nameNoExt = stripExtension(fileName)

    if (isMarkdownFile) {
      return isImage(path) ? `![${nameNoExt}](${relPath})` : `[${fileName}](${relPath})`
    }
    if (isLatexFile) {
      return isImage(path) ? `\\includegraphics{${relPath}}` : `\\input{${relPath}}`
    }
    return relPath
  }).join('\n')
}
