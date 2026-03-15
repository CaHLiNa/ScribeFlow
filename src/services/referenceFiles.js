import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

export async function pickCitationStyleFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'CSL Style', extensions: ['csl'] }],
  })
  if (!selected || Array.isArray(selected)) return null
  return selected
}

export function readReferenceFile(path) {
  return invoke('read_file', { path })
}

export function writeReferenceFile(path, content) {
  return invoke('write_file', { path, content })
}

export async function saveReferenceExport(options) {
  const { format, title, content } = options
  const ext = format === 'ris' ? 'ris' : 'bib'
  const path = await save({
    title,
    defaultPath: `references.${ext}`,
    filters: [{ name: format === 'ris' ? 'RIS' : 'BibTeX', extensions: [ext] }],
  })
  if (!path) return null
  await writeReferenceFile(path, content)
  return path
}
