import { invoke } from '@tauri-apps/api/core'

export async function readPdfArtifactBase64(filePath) {
  return invoke('workspace_read_file_base64', {
    params: { path: filePath },
  })
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

  const result = await invoke('workspace_synctex_backward', {
    synctexPath,
    page,
    x,
    y,
  })
  if (!result) return null
  const strictLine = result?.strictLine === true || result?.strict_line === true
  return {
    ...result,
    strictLine,
  }
}

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
  const resolveStrictLine = (value) => value?.strictLine === true || value?.strict_line === true

  if (Array.isArray(result)) {
    const records = result
      .map((record) => normalizeLatexForwardRecord(record))
      .filter(Boolean)
    if (records.length === 0) return null
    return {
      mode: 'rects',
      records,
      record: records[0],
      strictLine: result.some(resolveStrictLine),
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
      strictLine: resolveStrictLine(result),
    }
  }
  return {
    mode: 'point',
    record,
    records: [record],
    strictLine: resolveStrictLine(result),
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

  const result = await invoke('workspace_synctex_forward', {
    synctexPath,
    filePath,
    line,
    column: Number.isInteger(column) && column > 0 ? column : 1,
  })
  const normalizedResult = normalizeLatexForwardSyncResult(result)
  if (!normalizedResult) return null
  return {
    ...normalizedResult,
    strictLine: normalizedResult.strictLine === true,
  }
}

export async function writePdfArtifactBase64(filePath, data) {
  return invoke('workspace_write_file_base64', {
    params: { path: filePath, data },
  })
}
