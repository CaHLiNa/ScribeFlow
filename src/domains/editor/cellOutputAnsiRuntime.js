const ANSI_FG_CLASS_BY_CODE = {
  30: 'output-ansi-fg-30',
  31: 'output-ansi-fg-31',
  32: 'output-ansi-fg-32',
  33: 'output-ansi-fg-33',
  34: 'output-ansi-fg-34',
  35: 'output-ansi-fg-35',
  36: 'output-ansi-fg-36',
  37: 'output-ansi-fg-37',
  90: 'output-ansi-fg-90',
  91: 'output-ansi-fg-91',
  92: 'output-ansi-fg-92',
  93: 'output-ansi-fg-93',
  94: 'output-ansi-fg-94',
  95: 'output-ansi-fg-95',
  96: 'output-ansi-fg-96',
  97: 'output-ansi-fg-97',
}

const ANSI_DECORATION_CLASS_BY_CODE = {
  1: 'output-ansi-bold',
  3: 'output-ansi-italic',
  4: 'output-ansi-underline',
}
const ANSI_SEQUENCE_PREFIX = `${String.fromCharCode(27)}[`

export function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function ansiToHtml(text) {
  if (!text) return ''

  const escaped = escapeHtml(text)
  const parts = escaped.split(ANSI_SEQUENCE_PREFIX)
  let result = ''
  let openSpans = 0

  for (let i = 0; i < parts.length; i += 1) {
    if (i === 0) {
      result += parts[i]
      continue
    }

    const mIdx = parts[i].indexOf('m')
    if (mIdx === -1) {
      result += parts[i]
      continue
    }

    const codes = parts[i]
      .slice(0, mIdx)
      .split(';')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
    const rest = parts[i].slice(mIdx + 1)
    const classNames = []

    for (const code of codes) {
      if (code === 0) {
        while (openSpans > 0) {
          result += '</span>'
          openSpans -= 1
        }
        continue
      }

      const decorationClass = ANSI_DECORATION_CLASS_BY_CODE[code]
      if (decorationClass) {
        classNames.push(decorationClass)
        continue
      }

      const fgClass = ANSI_FG_CLASS_BY_CODE[code]
      if (fgClass) {
        classNames.push(fgClass)
      }
    }

    if (classNames.length > 0) {
      result += `<span class="${classNames.join(' ')}">`
      openSpans += 1
    }

    result += rest
  }

  while (openSpans > 0) {
    result += '</span>'
    openSpans -= 1
  }

  return result
}
