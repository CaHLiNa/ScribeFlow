import { invokeCommand as invoke } from '../tauriBridge.ts'

export function storeReferencePdfWithOptions(
  globalConfigDir = '',
  reference = {},
  sourcePath = '',
  options = {}
) {
  const references = Array.isArray(options.references) ? options.references : []
  return invoke('references_asset_store', {
    params: {
      globalConfigDir,
      reference,
      references,
      referenceId: options.referenceId || '',
      sourcePath,
      existingFulltextSourcePath: options.existingFulltextSourcePath || '',
    },
  })
}

export async function storeReferencePdf(
  globalConfigDir = '',
  reference = {},
  sourcePath = '',
  options = {}
) {
  return storeReferencePdfWithOptions(globalConfigDir, reference, sourcePath, options)
}

export async function renameReferencePdfAsset(
  globalConfigDir = '',
  reference = {},
  nextBaseName = '',
  options = {}
) {
  const references = Array.isArray(options.references) ? options.references : []
  return invoke('references_asset_rename', {
    params: {
      globalConfigDir,
      reference,
      references,
      referenceId: options.referenceId || '',
      nextBaseName,
    },
  })
}
