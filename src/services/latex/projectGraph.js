import { invoke } from '@tauri-apps/api/core'

export {
  stableContentFingerprint,
  getCachedLatexProjectGraph,
  cacheLatexProjectGraph,
  buildLatexProjectGraphCacheKey,
} from './projectGraphCache.js'

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
