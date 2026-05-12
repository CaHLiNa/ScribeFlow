import { invoke } from '@tauri-apps/api/core'

export function storeReferencePdfWithOptions(
  globalConfigDir = '',
  reference = {},
  sourcePath = '',
  options = {}
) {
  return invoke('references_asset_store', {
    params: {
      globalConfigDir,
      reference,
      sourcePath,
      existingFulltextSourcePath: options.existingFulltextSourcePath || '',
    },
  })
}

export async function storeReferencePdf(globalConfigDir = '', reference = {}, sourcePath = '') {
  return storeReferencePdfWithOptions(globalConfigDir, reference, sourcePath)
}

export async function renameReferencePdfAsset(
  globalConfigDir = '',
  reference = {},
  nextBaseName = ''
) {
  const renamed = await invoke('references_asset_rename', {
    params: {
      globalConfigDir,
      reference,
      nextBaseName,
    },
  })
  return renamed && typeof renamed === 'object' ? renamed : reference
}
