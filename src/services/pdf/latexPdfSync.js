import { invoke } from '@tauri-apps/api/core'

function normalizeLatexForwardRecord(record = {}) {
  const page = Number(record.page || 0)
  const x = Number(record.x)
  const y = Number(record.y)
  const h = Number(record.h)
  const v = Number(record.v)
  const W = Number(record.W)
  const H = Number(record.H)

  if (!Number.isInteger(page) || page < 1) return null

  const nextRecord = {
    page,
    indicator: record.indicator !== false,
    strictLine: record.strictLine !== false,
  }

  if (Number.isFinite(x) && Number.isFinite(y)) {
    nextRecord.x = x
    nextRecord.y = y
  }

  if (Number.isFinite(h) && Number.isFinite(v) && Number.isFinite(W) && Number.isFinite(H)) {
    nextRecord.h = h
    nextRecord.v = v
    nextRecord.W = W
    nextRecord.H = H
    if (!Number.isFinite(nextRecord.x) || !Number.isFinite(nextRecord.y)) {
      nextRecord.x = h
      nextRecord.y = v
    }
  }

  if (!Number.isFinite(nextRecord.x) || !Number.isFinite(nextRecord.y)) return null
  return nextRecord
}

function normalizeLatexForwardSyncResult(result) {
  if (Array.isArray(result)) {
    const records = result
      .map((record) => normalizeLatexForwardRecord(record))
      .filter(Boolean)
    if (records.length === 0) return null
    const strictLine = records.every((record) => record.strictLine !== false)
    return {
      mode: 'rects',
      records,
      record: records[0],
      strictLine,
    }
  }

  const record = normalizeLatexForwardRecord(result || {})
  if (!record) return null
  if (
    Number.isFinite(record.h)
    && Number.isFinite(record.v)
    && Number.isFinite(record.W)
    && Number.isFinite(record.H)
  ) {
    return {
      mode: 'rects',
      records: [record],
      record,
      strictLine: record.strictLine !== false,
    }
  }
  return {
    mode: 'point',
    record,
    records: [record],
    strictLine: record.strictLine !== false,
  }
}

export async function requestLatexPdfBackwardSync(options = {}) {
  const synctexPath = String(options.synctexPath || '').trim()
  const page = Number(options.page || 0)
  const x = Number(options.x)
  const y = Number(options.y)
  if (
    !synctexPath
    || !Number.isInteger(page)
    || page < 1
    || !Number.isFinite(x)
    || !Number.isFinite(y)
  ) {
    return null
  }

  try {
    const result = await invoke('synctex_backward', {
      synctexPath,
      page,
      x,
      y,
    })
    return result
      ? {
          ...result,
          strictLine: result.strictLine !== false,
        }
      : null
  } catch {
    return null
  }
}

export async function requestLatexPdfForwardSync(options = {}) {
  const synctexPath = String(options.synctexPath || '').trim()
  const filePath = String(options.filePath || '').trim()
  const line = Number(options.line || 0)
  const column = Number(options.column || 0)
  if (!synctexPath || !filePath || !Number.isInteger(line) || line < 1) {
    return null
  }

  try {
    const result = await invoke('synctex_forward', {
      synctexPath,
      filePath,
      line,
      column: Number.isInteger(column) && column > 0 ? column : 1,
    })
    return normalizeLatexForwardSyncResult(result)
  } catch {
    return null
  }
}
