import { invoke } from '@tauri-apps/api/core'

export async function detectPythonRuntime() {
  return invoke('python_runtime_detect')
}

export async function listPythonRuntimes(interpreterPath = '') {
  return invoke('python_runtime_list', {
    params: {
      interpreterPath: String(interpreterPath || ''),
    },
  })
}

export async function compilePythonFile(filePath, interpreterPath = '') {
  return invoke('python_runtime_compile', {
    params: {
      filePath: String(filePath || ''),
      interpreterPath: String(interpreterPath || ''),
    },
  })
}
