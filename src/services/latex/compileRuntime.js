import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export async function listenLatexCompileStream(handler = () => {}) {
  return listen('latex-compile-stream', (event) => {
    handler(event.payload || {})
  }).catch(() => () => {})
}

export async function listenLatexRuntimeCompileRequested(handler = () => {}) {
  return listen('latex-runtime-compile-requested', (event) => {
    handler(event.payload || {})
  }).catch(() => () => {})
}

export async function resolveLatexRuntimeSource(params = {}) {
  return invoke('latex_runtime_source_resolve', {
    params: {
      sourcePath: String(params.sourcePath || ''),
      workspacePath: String(params.workspacePath || ''),
      includeHidden: params.includeHidden !== false,
      contentOverrides: params.contentOverrides && typeof params.contentOverrides === 'object'
        ? params.contentOverrides
        : {},
      sourceContent: typeof params.sourceContent === 'string' ? params.sourceContent : null,
      customSystemTexPath: params.customSystemTexPath || null,
    },
  })
}

export async function resolveLatexRuntimeChange(params = {}) {
  return invoke('latex_runtime_change_resolve', {
    params: {
      changedPath: String(params.changedPath || ''),
      workspacePath: String(params.workspacePath || ''),
      includeHidden: params.includeHidden !== false,
      contentOverrides: params.contentOverrides && typeof params.contentOverrides === 'object'
        ? params.contentOverrides
        : {},
      sourceContent: typeof params.sourceContent === 'string' ? params.sourceContent : null,
      customSystemTexPath: params.customSystemTexPath || null,
    },
  })
}

export async function scheduleLatexRuntime(params = {}) {
  return invoke('latex_runtime_schedule', {
    params: {
      sourcePath: String(params.sourcePath || ''),
      targetPath: String(params.targetPath || ''),
      reason: String(params.reason || 'save'),
      buildExtraArgs: String(params.buildExtraArgs || ''),
      now: Number(params.now || Date.now()),
    },
  })
}

export async function executeLatexCompile(params = {}) {
  return invoke('latex_runtime_compile_execute', {
    params: {
      texPath: String(params.texPath || ''),
      targetPath: String(params.targetPath || ''),
      projectRootPath: String(params.projectRootPath || ''),
      projectPreviewPath: String(params.projectPreviewPath || ''),
      reason: String(params.reason || 'manual'),
      buildExtraArgs: String(params.buildExtraArgs || ''),
      now: Number(params.now || Date.now()),
      compilerPreference: params.compilerPreference || null,
      enginePreference: params.enginePreference || null,
      customSystemTexPath: params.customSystemTexPath || null,
      customTectonicPath: params.customTectonicPath || null,
    },
  })
}

export async function cancelLatexRuntime(targetPaths = []) {
  return invoke('latex_runtime_cancel', {
    params: {
      targetPaths: Array.isArray(targetPaths) ? targetPaths : [],
    },
  })
}
