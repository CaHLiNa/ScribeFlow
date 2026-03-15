import { hoverTooltip } from '@codemirror/view'
import { requestTinymistHover } from '../../services/tinymist/session.js'
import {
  offsetToTinymistPosition,
  tinymistRangeToOffsets,
} from '../../services/tinymist/textEdits.js'
import { renderMarkdown } from '../../utils/chatMarkdown.js'

function normalizeHoverText(contents) {
  if (!contents) return ''
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents
      .map(item => normalizeHoverText(item))
      .filter(Boolean)
      .join('\n\n')
  }
  if (typeof contents.value === 'string') return contents.value
  if (typeof contents.language === 'string' && typeof contents.value === 'string') {
    return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``
  }
  return ''
}

function createHoverDom(text) {
  const dom = document.createElement('div')
  dom.className = 'cm-tinymist-hover__body'
  const rendered = renderMarkdown(text)

  if (rendered) {
    dom.innerHTML = rendered
  } else {
    dom.textContent = text
  }

  return dom
}

export function createTypstHoverExtension(options = {}) {
  const { filePath } = options
  if (!filePath) return []

  return [
    hoverTooltip(async (view, pos) => {
      const result = await requestTinymistHover(filePath, offsetToTinymistPosition(view.state, pos))
      if (!result) return null

      const text = normalizeHoverText(result.contents)
      if (!text.trim()) return null

      const offsets = tinymistRangeToOffsets(view.state, result.range || null)
      return {
        pos: offsets?.from ?? pos,
        end: offsets?.to ?? pos,
        above: true,
        class: 'cm-tinymist-hover',
        create() {
          const dom = createHoverDom(text)
          return { dom }
        },
      }
    }, {
      hoverTime: 250,
      hideOnChange: 'touch',
    }),
  ]
}
