import JSZip from 'jszip'
import { computeMinimalChange } from '../utils/textDiff'
import { base64ToUint8Array } from '../utils/docxBridge'

const FEATURE_MATRIX = [
  { id: 'headings', label: 'Heading levels', support: 'stable' },
  { id: 'formatting', label: 'Bold / italic', support: 'stable' },
  { id: 'lists', label: 'Lists', support: 'stable' },
  { id: 'images', label: 'Images', support: 'stable' },
  { id: 'tables', label: 'Tables', support: 'stable' },
  { id: 'footnotes', label: 'Footnotes', support: 'partial' },
  { id: 'comments', label: 'Comments', support: 'partial' },
  { id: 'trackedChanges', label: 'Tracked changes', support: 'partial' },
  { id: 'equations', label: 'Equations', support: 'risk' },
  { id: 'bibliography', label: 'Bibliography', support: 'partial' },
]

async function loadZip(base64 = '') {
  if (!base64) return null
  return JSZip.loadAsync(base64ToUint8Array(base64))
}

async function readXml(zip, path) {
  if (!zip) return ''
  const entry = zip.file(path)
  if (!entry) return ''
  return entry.async('string')
}

function parseXml(xml = '') {
  if (!xml || typeof DOMParser === 'undefined') return null
  try {
    return new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return null
  }
}

function getElements(doc, localName) {
  if (!doc) return []
  return [...doc.getElementsByTagNameNS('*', localName)]
}

function extractParagraphText(paragraph) {
  const parts = []
  const walker = (node) => {
    if (!node) return
    const name = node.localName || node.nodeName
    if (name === 't') {
      parts.push(node.textContent || '')
      return
    }
    if (name === 'tab') {
      parts.push('\t')
      return
    }
    if (name === 'br' || name === 'cr') {
      parts.push('\n')
      return
    }
    for (const child of [...(node.childNodes || [])]) walker(child)
  }
  walker(paragraph)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function paragraphSignature(text = '') {
  return String(text || '').trim()
}

export async function analyzeDocxRoundTrip(base64 = '') {
  const zip = await loadZip(base64)
  const documentXml = await readXml(zip, 'word/document.xml')
  const commentsXml = await readXml(zip, 'word/comments.xml')
  const footnotesXml = await readXml(zip, 'word/footnotes.xml')
  const combined = [documentXml, commentsXml, footnotesXml].join('\n')

  const features = FEATURE_MATRIX.map((feature) => {
    let present = false
    switch (feature.id) {
      case 'headings':
        present = /Heading[1-9]/i.test(combined)
        break
      case 'formatting':
        present = /<w:b\b|<w:i\b/i.test(combined)
        break
      case 'lists':
        present = /<w:numPr\b/i.test(combined)
        break
      case 'images':
        present = /<w:drawing\b|<a:blip\b/i.test(combined)
        break
      case 'tables':
        present = /<w:tbl\b/i.test(combined)
        break
      case 'footnotes':
        present = /<w:footnote\b/i.test(footnotesXml)
        break
      case 'comments':
        present = /<w:comment\b|<w:commentRangeStart\b/i.test(commentsXml || combined)
        break
      case 'trackedChanges':
        present = /<w:ins\b|<w:del\b|<w:moveFrom\b|<w:moveTo\b/i.test(combined)
        break
      case 'equations':
        present = /<m:oMath\b|<m:oMathPara\b/i.test(combined)
        break
      case 'bibliography':
        present = /Bibliography|References|Works Cited|cite:/i.test(combined)
        break
      default:
        present = false
    }
    return {
      ...feature,
      present,
    }
  })

  const presentCount = features.filter((item) => item.present).length
  const riskCount = features.filter((item) => item.present && item.support === 'risk').length
  const partialCount = features.filter((item) => item.present && item.support === 'partial').length

  return {
    features,
    presentCount,
    riskCount,
    partialCount,
  }
}

export async function extractDocxParagraphs(base64 = '') {
  const zip = await loadZip(base64)
  const documentXml = await readXml(zip, 'word/document.xml')
  const doc = parseXml(documentXml)
  if (!doc) return []

  return getElements(doc, 'p')
    .map(extractParagraphText)
    .map((text) => text.trim())
    .filter(Boolean)
}

function buildLcsMatrix(before = [], after = []) {
  const rows = before.length + 1
  const cols = after.length + 1
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      if (paragraphSignature(before[i]) === paragraphSignature(after[j])) {
        matrix[i][j] = matrix[i + 1][j + 1] + 1
      } else {
        matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1])
      }
    }
  }

  return matrix
}

function inlineDiff(before = '', after = '') {
  const change = computeMinimalChange(before, after)
  if (!change) {
    return {
      beforePrefix: before,
      beforeChanged: '',
      beforeSuffix: '',
      afterPrefix: after,
      afterChanged: '',
      afterSuffix: '',
    }
  }

  return {
    beforePrefix: before.slice(0, change.from),
    beforeChanged: before.slice(change.from, change.to),
    beforeSuffix: before.slice(change.to),
    afterPrefix: before.slice(0, change.from),
    afterChanged: change.insert,
    afterSuffix: before.slice(change.to),
  }
}

export function buildDocxParagraphDiff(beforeParagraphs = [], afterParagraphs = []) {
  const matrix = buildLcsMatrix(beforeParagraphs, afterParagraphs)
  const ops = []
  let i = 0
  let j = 0

  while (i < beforeParagraphs.length && j < afterParagraphs.length) {
    if (paragraphSignature(beforeParagraphs[i]) === paragraphSignature(afterParagraphs[j])) {
      ops.push({ type: 'equal', before: beforeParagraphs[i], after: afterParagraphs[j] })
      i += 1
      j += 1
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      ops.push({ type: 'delete', before: beforeParagraphs[i] })
      i += 1
    } else {
      ops.push({ type: 'insert', after: afterParagraphs[j] })
      j += 1
    }
  }

  while (i < beforeParagraphs.length) {
    ops.push({ type: 'delete', before: beforeParagraphs[i] })
    i += 1
  }

  while (j < afterParagraphs.length) {
    ops.push({ type: 'insert', after: afterParagraphs[j] })
    j += 1
  }

  const blocks = []
  for (let index = 0; index < ops.length; index += 1) {
    const current = ops[index]
    const next = ops[index + 1]

    if (current.type === 'delete' && next?.type === 'insert') {
      blocks.push({
        type: 'replace',
        before: current.before,
        after: next.after,
        inline: inlineDiff(current.before, next.after),
      })
      index += 1
      continue
    }

    if (current.type !== 'equal') {
      blocks.push(current)
    }
  }

  return blocks
}
