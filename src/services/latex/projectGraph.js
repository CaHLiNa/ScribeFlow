import { invoke } from '@tauri-apps/api/core'

export function stableContentFingerprint(value = '') {
  const text = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`
}

// Compatibility stubs for the pre-rustified document workspace path.
export function getCachedLatexProjectGraph() {
  return null
}

export async function resolveLatexProjectGraph() {
  return null
}

export function buildRelativeLatexInputPath(inputPath = '') {
  return String(inputPath || '')
}

export function resolveLatexCompileTargetsForChange() {
  return []
}

export async function resolveLatexProjectCompletion(params = {}) {
  return invoke('latex_project_completion_resolve', {
    params: {
      filePath: String(params.filePath || ''),
      workspacePath: String(params.workspacePath || ''),
      lineTextBeforeCursor: String(params.lineTextBeforeCursor || ''),
      includeHidden: params.includeHidden !== false,
      contentOverrides:
        params.contentOverrides && typeof params.contentOverrides === 'object'
          ? params.contentOverrides
          : {},
    },
  })
}
