import { getGlobalConfigDir } from '../workspaceRuntime.js'

export async function resolveZoteroGlobalConfigDir(globalConfigDir = '') {
  if (String(globalConfigDir || '').trim()) {
    return String(globalConfigDir || '')
  }
  return getGlobalConfigDir()
}
