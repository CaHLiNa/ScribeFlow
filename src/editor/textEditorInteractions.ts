import { isBibFile, isImage, relativePath } from '../utils/fileTypes'
import { basenamePath, stripExtension } from '../utils/path'

function stripBibExtension(path = '') {
  return String(path || '').replace(/\.bib$/i, '')
}

function hasBibTeXStyle(documentText = '') {
  return /\\bibliographystyle\s*\{[^}]*\}/.test(String(documentText || ''))
}

function hasCitationCommand(documentText = '') {
  return /\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{[^}]*\}/.test(
    String(documentText || ''),
  )
}

function buildLatexBibliographyInsert(relPath = '', documentText = '') {
  const commands = []
  if (!hasBibTeXStyle(documentText)) commands.push('\\bibliographystyle{plain}')
  if (!hasCitationCommand(documentText)) commands.push('\\nocite{*}')
  commands.push(`\\bibliography{${stripBibExtension(relPath)}}`)
  return commands.join('\n')
}

export function buildInsertText(paths, options) {
  const { filePath, isMarkdownFile, isLatexFile, documentText = '' } = options

  return paths.map((path) => {
    const relPath = relativePath(filePath, path)
    const fileName = basenamePath(path)
    const nameNoExt = stripExtension(fileName)

    if (isMarkdownFile) {
      return isImage(path) ? `![${nameNoExt}](${relPath})` : `[${fileName}](${relPath})`
    }
    if (isLatexFile) {
      if (isBibFile(path)) return buildLatexBibliographyInsert(relPath, documentText)
      return isImage(path) ? `\\includegraphics{${relPath}}` : `\\input{${relPath}}`
    }
    return relPath
  }).join('\n')
}
