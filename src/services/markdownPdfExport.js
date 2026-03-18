import { invoke } from '@tauri-apps/api/core'

export function markdownPdfPathExists(path) {
  return invoke('path_exists', { path })
}

export function writeMarkdownExportFile(path, content) {
  return invoke('write_file', { path, content })
}

export async function materializeCustomCslStyle(sourcePath, styleId) {
  const response = await fetch(`/csl/${styleId}.csl`)
  if (!response.ok) {
    throw new Error(`Unable to load CSL style: ${styleId}`)
  }

  const cslContent = await response.text()
  const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
  const cslPath = `${dir}/${styleId}.csl`
  await writeMarkdownExportFile(cslPath, cslContent)
  return `${styleId}.csl`
}

export async function cleanupMarkdownExportArtifacts(tempMdPath) {
  if (!tempMdPath) return
  await cleanupMarkdownExportArtifactsInDir(
    tempMdPath.substring(0, tempMdPath.lastIndexOf('/')),
    { tempFilePath: tempMdPath },
  )
}

export async function cleanupMarkdownExportArtifactsInDir(dir, options = {}) {
  if (!dir) return

  if (options.tempFilePath) {
    await invoke('delete_path', { path: options.tempFilePath }).catch(() => {})
  }

  try {
    const entries = await invoke('read_dir_shallow', { path: dir })
    await Promise.all(
      (entries || [])
        .filter((entry) => !entry.is_dir && entry.name?.startsWith('_chunk_img_'))
        .map((entry) => invoke('delete_path', { path: entry.path }).catch(() => {})),
    )
  } catch {
    // Ignore temp cleanup failures.
  }
}
