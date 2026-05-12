import { invoke } from '@tauri-apps/api/core'

export async function readPdfArtifactBase64(filePath) {
  return invoke('workspace_read_file_base64', {
    params: { path: filePath },
  })
}

export async function requestLatexPdfBackwardSync(options = {}) {
  return invoke('workspace_synctex_backward', {
    params: options,
  })
}

export async function requestLatexPdfForwardSync(options = {}) {
  return invoke('workspace_synctex_forward', {
    params: options,
  })
}

export async function writePdfArtifactBase64(filePath, data) {
  return invoke('workspace_write_file_base64', {
    params: { path: filePath, data },
  })
}
