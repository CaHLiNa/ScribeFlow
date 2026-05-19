import { invokeCommand as invoke } from './tauriBridge.ts'

export async function detectPythonRuntime() {
  return invoke('python_runtime_detect')
}

export async function listPythonRuntimes(interpreterPath = '') {
  return invoke('python_runtime_list', {
    params: {
      interpreterPath,
    },
  })
}

export async function compilePythonFile(filePath, interpreterPath = '') {
  return invoke('python_runtime_compile', {
    params: {
      filePath,
      interpreterPath,
    },
  })
}
