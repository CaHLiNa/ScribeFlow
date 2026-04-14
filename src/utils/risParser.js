const TYPE_MAP = {
  JOUR: 'article-journal',
  BOOK: 'book',
  CHAP: 'chapter',
  CONF: 'paper-conference',
  RPRT: 'report',
  THES: 'thesis',
  ELEC: 'webpage',
  GEN: 'article',
  MGZN: 'article-magazine',
  NEWS: 'article-newspaper',
  UNPB: 'manuscript',
  ABST: 'article',
  ADVS: 'article',
  BILL: 'legislation',
  CASE: 'legal_case',
  DATA: 'dataset',
  ICOMM: 'personal_communication',
  INPR: 'article',
  MAP: 'map',
  MPCT: 'motion_picture',
  PAT: 'patent',
  PCOMM: 'personal_communication',
  SOUND: 'song',
  STAT: 'legislation',
  VIDEO: 'motion_picture',
}

export function parseRis(text = '') {
  const records = []
  const blocks = String(text || '').split(/^ER\s{2}-.*$/m)

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || !/^TY\s{2}-/m.test(trimmed)) continue

    try {
      const record = parseRisRecord(trimmed)
      if (record?.title) records.push(record)
    } catch (error) {
      console.warn('[risParser] Failed to parse RIS record:', error)
    }
  }

  return records
}

function parseRisRecord(text = '') {
  const lines = text.split('\n')
  const fields = {}
  let lastTag = null

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9]{1,3})\s{2}-\s?(.*)$/)
    if (match) {
      const [, tag, value] = match
      lastTag = tag
      if (!fields[tag]) fields[tag] = []
      fields[tag].push(value.trim())
      continue
    }

    if (lastTag && line.trim()) {
      const values = fields[lastTag]
      values[values.length - 1] += ` ${line.trim()}`
    }
  }

  const csl = {
    type: TYPE_MAP[fields.TY?.[0]] || 'article',
    title: fields.TI?.[0] || fields.T1?.[0] || '',
  }

  const authors = [...(fields.AU || []), ...(fields.A1 || [])]
  if (authors.length > 0) csl.author = authors.map(parseRisName)

  const editors = [...(fields.ED || []), ...(fields.A2 || [])]
  if (editors.length > 0) csl.editor = editors.map(parseRisName)

  const date = fields.DA?.[0] || fields.Y1?.[0]
  const year = fields.PY?.[0]
  if (date) {
    const parts = parseDateParts(date)
    if (parts) csl.issued = { 'date-parts': [parts] }
  } else if (year) {
    const normalizedYear = Number.parseInt(year, 10)
    if (!Number.isNaN(normalizedYear)) {
      csl.issued = { 'date-parts': [[normalizedYear]] }
    }
  }

  const container = fields.JO?.[0] || fields.JF?.[0] || fields.T2?.[0]
  if (container) csl['container-title'] = container
  if (fields.VL?.[0]) csl.volume = fields.VL[0]
  if (fields.IS?.[0]) csl.issue = fields.IS[0]

  const startPage = fields.SP?.[0]
  const endPage = fields.EP?.[0]
  if (startPage && endPage) csl.page = `${startPage}-${endPage}`
  else if (startPage) csl.page = startPage

  if (fields.DO?.[0]) csl.DOI = fields.DO[0].replace(/^https?:\/\/doi\.org\//i, '')
  if (fields.UR?.[0]) csl.URL = fields.UR[0]
  if (fields.AB?.[0] || fields.N2?.[0]) csl.abstract = fields.AB?.[0] || fields.N2?.[0]
  if (fields.PB?.[0]) csl.publisher = fields.PB[0]

  if (fields.SN?.[0]) {
    const normalized = fields.SN[0]
    if (normalized.replace(/-/g, '').length <= 9) csl.ISSN = normalized
    else csl.ISBN = normalized
  }

  if (fields.KW?.length > 0) {
    csl._tags = fields.KW.flatMap((item) =>
      item
        .split(/[;,]/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  }

  if (fields.LA?.[0]) csl.language = fields.LA[0]
  if (fields.N1?.[0]) csl.note = fields.N1[0]
  if (fields.T3?.[0]) csl['collection-title'] = fields.T3[0]

  return csl
}

function parseRisName(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return { family: 'Unknown' }

  if (normalized.includes(',')) {
    const [family, ...rest] = normalized.split(',')
    return { family: family.trim(), given: rest.join(',').trim() }
  }

  const words = normalized.split(/\s+/)
  if (words.length === 1) return { family: words[0] }
  return { family: words.at(-1), given: words.slice(0, -1).join(' ') }
}

function parseDateParts(value = '') {
  const cleaned = String(value || '').replace(/-/g, '/')
  const parts = cleaned
    .split('/')
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => !Number.isNaN(segment))
  return parts.length > 0 ? parts : null
}
