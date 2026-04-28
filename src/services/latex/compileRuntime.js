import { invoke } from '@tauri-apps/api/core'

export async function resolveLatexCompileRequest(params = {}) {
  return invoke('latex_compile_request_resolve', {
    params: {
      sourcePath: String(params.sourcePath || ''),
      flatFiles: Array.isArray(params.flatFiles) ? params.flatFiles : [],
      contentOverrides: params.contentOverrides && typeof params.contentOverrides === 'object'
        ? params.contentOverrides
        : {},
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
