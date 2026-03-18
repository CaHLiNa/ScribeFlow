function parseWikiLink(raw = '') {
  let target = String(raw || '')
  let display = null
  let heading = null

  const pipeIdx = target.indexOf('|')
  if (pipeIdx !== -1) {
    display = target.slice(pipeIdx + 1).trim()
    target = target.slice(0, pipeIdx)
  }

  const hashIdx = target.indexOf('#')
  if (hashIdx !== -1) {
    heading = target.slice(hashIdx + 1).trim()
    target = target.slice(0, hashIdx)
  }

  return {
    target: target.trim(),
    display: display || null,
    heading: heading || null,
  }
}

function visibleWikiLinkText(raw = '') {
  const parsed = parseWikiLink(raw)
  return parsed.display || parsed.heading || parsed.target || raw
}

function isCitationBoundary(prevChar = '') {
  return !prevChar || /\s|[([{\u3000]/.test(prevChar)
}

function isCitationKeyChar(char = '') {
  return /[\w:-]/.test(char)
}

export function normalizeMarkdownDraftForExport(content = '') {
  const source = String(content || '')
  let result = ''
  let i = 0
  let inFence = false

  while (i < source.length) {
    const char = source[i]

    if ((i === 0 || source[i - 1] === '\n') && (source.startsWith('```', i) || source.startsWith('~~~', i))) {
      inFence = !inFence
    }

    if (!inFence && char === '`') {
      let ticks = 1
      while (source[i + ticks] === '`') ticks += 1
      const marker = '`'.repeat(ticks)
      result += marker
      i += ticks
      while (i < source.length) {
        if (source.startsWith(marker, i)) {
          result += marker
          i += ticks
          break
        }
        result += source[i]
        i += 1
      }
      continue
    }

    if (!inFence && source.startsWith('[[', i)) {
      const close = source.indexOf(']]', i + 2)
      if (close !== -1) {
        result += visibleWikiLinkText(source.slice(i + 2, close))
        i = close + 2
        continue
      }
    }

    if (
      !inFence
      && char === '@'
      && /[A-Za-z]/.test(source[i + 1] || '')
      && isCitationBoundary(source[i - 1] || '')
    ) {
      let j = i + 1
      while (isCitationKeyChar(source[j] || '')) j += 1
      const key = source.slice(i + 1, j)
      if (key) {
        result += `[@${key}]`
        i = j
        continue
      }
    }

    result += char
    i += 1
  }

  return result
}
