import { invoke } from '@tauri-apps/api/core'

function normalizeFlatFiles(entries = []) {
  return entries
    .map((entry) => (typeof entry === 'string' ? entry : entry?.path || ''))
    .map((path) => String(path || '').trim())
    .filter(Boolean)
}

async function resolveFlatFiles(options = {}) {
  const explicit = normalizeFlatFiles(options.flatFiles || [])
  if (explicit.length > 0) return explicit

  const snapshot = normalizeFlatFiles(options.filesStore?.lastWorkspaceSnapshot?.flatFiles || [])
  if (snapshot.length > 0) return snapshot

  const cached = normalizeFlatFiles(options.filesStore?.flatFiles || [])
  if (cached.length > 0) return cached

  if (options.filesStore?.ensureFlatFilesReady) {
    const entries = await options.filesStore.ensureFlatFilesReady().catch(() => [])
    return normalizeFlatFiles(entries)
  }

  return []
}

export async function resolveDocumentOutlineItems(filePath, options = {}) {
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedPath) return []

  const flatFiles = await resolveFlatFiles(options)
  const contentOverrides = options.contentOverrides && typeof options.contentOverrides === 'object'
    ? options.contentOverrides
    : {}

  return invoke('document_outline_resolve', {
    params: {
      filePath: normalizedPath,
      content: String(options.content || ''),
      flatFiles,
      contentOverrides,
    },
  })
}
