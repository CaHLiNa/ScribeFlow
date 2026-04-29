import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export function resolveLatexCompileRequest(params = {}) {
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

export function resolveLatexCompileTargets(params = {}) {
  return invoke('latex_compile_targets_resolve', {
    params: {
      changedPath: String(params.changedPath || ''),
      flatFiles: Array.isArray(params.flatFiles) ? params.flatFiles : [],
      contentOverrides: params.contentOverrides && typeof params.contentOverrides === 'object'
        ? params.contentOverrides
        : {},
    },
  })
}

export function resolveLatexLintState(params = {}) {
  return invoke('latex_runtime_lint_resolve', {
    params: {
      texPath: String(params.texPath || ''),
      content: params.content ?? null,
      customSystemTexPath: params.customSystemTexPath || null,
      workspacePath: params.workspacePath || null,
    },
  })
}

export function resolveLatexSyncTarget(params = {}) {
  return invoke('latex_sync_target_resolve', {
    params: {
      reportedFile: String(params.reportedFile || ''),
      sourcePath: String(params.sourcePath || ''),
      compileTargetPath: String(params.compileTargetPath || ''),
      workspacePath: String(params.workspacePath || ''),
    },
  })
}

export function scheduleLatexRuntime(params = {}) {
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

export function executeLatexRuntimeCompile(params = {}) {
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

export function cancelLatexRuntime(targetPaths = []) {
  return invoke('latex_runtime_cancel', {
    params: {
      targetPaths: Array.isArray(targetPaths) ? targetPaths : [],
    },
  })
}

export function checkLatexCompilers(params = {}) {
  return invoke('check_latex_compilers', {
    customSystemTexPath: params.customSystemTexPath || null,
    customTectonicPath: params.customTectonicPath || null,
  })
}

export function checkLatexTools(params = {}) {
  return invoke('check_latex_tools', {
    customSystemTexPath: params.customSystemTexPath || null,
  })
}

export function formatLatexDocument(params = {}) {
  return invoke('format_latex_document', {
    texPath: String(params.texPath || ''),
    content: String(params.content || ''),
    customSystemTexPath: params.customSystemTexPath || null,
  })
}

export function downloadTectonicBinary() {
  return invoke('download_tectonic')
}

export function listenLatexCompileStream(handler) {
  return listen('latex-compile-stream', handler)
}

export function listenLatexRuntimeCompileRequested(handler) {
  return listen('latex-runtime-compile-requested', handler)
}

export function listenTectonicDownloadProgress(handler) {
  return listen('tectonic-download-progress', handler)
}
