import { invokeCommand as invoke } from '../tauriBridge.ts'
import { locale } from '../../i18n'

export async function listExtensions(globalConfigDir = '', workspaceRoot = '') {
  return invoke('extension_registry_list', {
    params: {
      globalConfigDir,
      workspaceRoot,
      locale: locale.value,
    },
  })
}

export async function validateExtensionManifest(manifest = {}) {
  return invoke('extension_registry_validate_manifest', {
    manifest,
  })
}

export async function loadExtensionSettings(globalConfigDir = '', workspaceRoot = '', options = {}) {
  return invoke('extension_settings_load', {
    params: {
      globalConfigDir,
      workspaceRoot,
      hydrateSecrets: options?.hydrateSecrets,
    },
  })
}

export async function saveExtensionSettings(globalConfigDir = '', workspaceRoot = '', settings = {}) {
  return invoke('extension_settings_save', {
    params: {
      globalConfigDir,
      workspaceRoot,
      settings,
    },
  })
}
