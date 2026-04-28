import { invoke } from '@tauri-apps/api/core'

export async function resolveLatexLintState(params = {}) {
  return invoke('latex_runtime_lint_resolve', {
    params: {
      texPath: String(params.texPath || ''),
      content: params.content ?? null,
      customSystemTexPath: params.customSystemTexPath || null,
      workspacePath: params.workspacePath || null,
    },
  })
}
