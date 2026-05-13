import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { normalizeLatexCompileExecution } from './compileNormalize.js'

export function resolveLatexCompileRequest(params = {}) {
  return invoke('latex_compile_request_resolve', {
    params: {
      sourcePath: params.sourcePath,
      workspacePath: params.workspacePath,
      flatFiles: params.flatFiles,
      contentOverrides: params.contentOverrides,
      sourceContent: params.sourceContent,
    },
  })
}

export function resolveLatexCompileTargets(params = {}) {
  return invoke('latex_compile_targets_resolve', {
    params: {
      changedPath: params.changedPath,
      workspacePath: params.workspacePath,
      flatFiles: params.flatFiles,
      contentOverrides: params.contentOverrides,
      sourceContent: params.sourceContent,
    },
  })
}

export function resolveLatexLintState(params = {}) {
  return invoke('latex_runtime_lint_resolve', {
    params: {
      texPath: params.texPath,
      content: params.content,
      customSystemTexPath: params.customSystemTexPath,
      workspacePath: params.workspacePath,
    },
  })
}

export function resolveLatexSyncTarget(params = {}) {
  return invoke('latex_sync_target_resolve', {
    params: {
      reportedFile: params.reportedFile,
      sourcePath: params.sourcePath,
      compileTargetPath: params.compileTargetPath,
      workspacePath: params.workspacePath,
    },
  })
}

export function resolveLatexExistingSynctex(params = {}) {
  return invoke('latex_existing_synctex_resolve', {
    params: {
      pdfPath: params.pdfPath,
    },
  })
}

export function scheduleLatexRuntime(params = {}) {
  return invoke('latex_runtime_schedule', {
    params: {
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      reason: params.reason,
      buildExtraArgs: params.buildExtraArgs,
      now: params.now,
    },
  })
}

export async function executeLatexRuntimeCompile(params = {}) {
  const execution = await invoke('latex_runtime_compile_execute', {
    params: {
      texPath: params.texPath,
      targetPath: params.targetPath,
      projectRootPath: params.projectRootPath,
      projectPreviewPath: params.projectPreviewPath,
      reason: params.reason,
      buildExtraArgs: params.buildExtraArgs,
      now: params.now,
      compilerPreference: params.compilerPreference,
      enginePreference: params.enginePreference,
      customSystemTexPath: params.customSystemTexPath,
      customTectonicPath: params.customTectonicPath,
    },
  })
  return normalizeLatexCompileExecution(execution)
}

export function cancelLatexRuntime(targetPaths = []) {
  return invoke('latex_runtime_cancel', {
    params: {
      targetPaths,
    },
  })
}

export function checkLatexCompilers(params = {}) {
  return invoke('check_latex_compilers', {
    params: {
      customSystemTexPath: params.customSystemTexPath,
      customTectonicPath: params.customTectonicPath,
    },
  })
}

export function checkLatexTools(params = {}) {
  return invoke('check_latex_tools', {
    params: {
      customSystemTexPath: params.customSystemTexPath,
    },
  })
}

export function formatLatexDocument(params = {}) {
  return invoke('format_latex_document', {
    params: {
      texPath: params.texPath,
      content: params.content,
      customSystemTexPath: params.customSystemTexPath,
    },
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
