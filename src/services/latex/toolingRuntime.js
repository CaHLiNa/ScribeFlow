import { invoke } from '@tauri-apps/api/core'

export async function checkLatexCompilers(params = {}) {
  return invoke('check_latex_compilers', {
    customSystemTexPath: params.customSystemTexPath || null,
    customTectonicPath: params.customTectonicPath || null,
  })
}

export async function checkLatexTools(params = {}) {
  return invoke('check_latex_tools', {
    customSystemTexPath: params.customSystemTexPath || null,
  })
}

export async function formatLatexDocument(params = {}) {
  return invoke('format_latex_document', {
    texPath: String(params.texPath || ''),
    content: String(params.content || ''),
    customSystemTexPath: params.customSystemTexPath || null,
  })
}

export async function downloadTectonic() {
  return invoke('download_tectonic')
}
