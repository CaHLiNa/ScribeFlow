import { invoke } from '@tauri-apps/api/core'
import DOMPurify from 'dompurify'
import { decorateInlineDraftSyntax } from './inlineDraftSyntax.js'

function sanitize(html = '') {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'math', 'menclose', 'msqrt', 'mroot', 'mpadded', 'mphantom', 'mstyle', 'msubsup'],
    ADD_ATTR: ['data-target', 'data-heading', 'data-source-kind', 'data-source-start-line', 'data-source-end-line', 'data-source-start-offset', 'data-source-end-offset', 'mathvariant', 'encoding', 'xmlns', 'display', 'accent', 'accentunder', 'columnalign', 'columnlines', 'columnspacing', 'rowspacing', 'rowlines', 'frame', 'separator', 'stretchy', 'symmetric', 'movablelimits', 'fence', 'lspace', 'rspace', 'linethickness', 'scriptlevel', 'width'],
  })
}

export async function renderMarkdownDraftPreview(md) {
  const html = await invoke('markdown_preview_render', {
    content: String(md || ''),
    options: null,
  })

  const parser = new DOMParser()
  const document = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const root = document.body

  decorateInlineDraftSyntax(root)

  return sanitize(root.innerHTML)
}
