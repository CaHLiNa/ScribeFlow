import { invoke } from '@tauri-apps/api/core'

export async function refreshReferenceMetadata(target = {}) {
  const targetOptions = target && typeof target === 'object' && (
    Object.prototype.hasOwnProperty.call(target, 'reference') ||
    Object.prototype.hasOwnProperty.call(target, 'references') ||
    Object.prototype.hasOwnProperty.call(target, 'referenceId')
  )
  const params = targetOptions
    ? {
        reference: target.reference || {},
        references: Array.isArray(target.references) ? target.references : [],
        referenceId: target.referenceId || '',
      }
    : {
        reference: target,
      }

  return invoke('references_refresh_metadata', {
    params,
  })
}
