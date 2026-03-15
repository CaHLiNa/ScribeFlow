import { invoke } from '@tauri-apps/api/core'
import { t } from '../i18n'
import { useReferencesStore } from '../stores/references'
import { useReviewsStore } from '../stores/reviews'
import { useUxStatusStore } from '../stores/uxStatus'
import { useWorkspaceStore } from '../stores/workspace'

const hashCache = new Map()

async function hashText(text = '') {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(String(text))
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .slice(0, 12)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  const value = String(text)
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return `fallback:${hash}`
}

async function readFileHash(path) {
  if (!path) return '__missing__'

  const exists = await invoke('path_exists', { path }).catch(() => false)
  if (!exists) return '__missing__'

  const content = await invoke('read_file', { path }).catch(() => null)
  if (content == null) return '__unreadable__'
  return hashText(content)
}

function specsForWorkspace(workspace) {
  return [
    {
      id: 'pending-edits',
      path: workspace.shouldersDir ? `${workspace.shouldersDir}/pending-edits.json` : '',
      reload: () => useReviewsStore().loadPendingEdits(),
    },
    {
      id: 'references-library',
      path: workspace.projectDir ? `${workspace.projectDir}/references/library.json` : '',
      reload: () => useReferencesStore().loadLibrary(),
    },
    {
      id: 'instructions-root',
      path: workspace.instructionsFilePath || '',
      reload: () => workspace.loadInstructions(),
    },
    {
      id: 'instructions-internal',
      path: workspace.internalInstructionsPath || '',
      reload: () => workspace.loadInstructions(),
    },
  ]
}

export async function reconcileCriticalWorkspaceState({ announce = false } = {}) {
  const workspace = useWorkspaceStore()
  if (!workspace.isOpen) return { changed: [] }

  const changed = []
  const specs = specsForWorkspace(workspace).filter(spec => spec.path)
  for (const spec of specs) {
    const cacheKey = `${workspace.path}:${spec.id}:${spec.path}`
    const nextHash = await readFileHash(spec.path)
    const prevHash = hashCache.get(cacheKey)
    hashCache.set(cacheKey, nextHash)

    if (prevHash === undefined || prevHash === nextHash) continue
    changed.push(spec.id)
    await spec.reload()
  }

  if (changed.length > 0 && announce) {
    useUxStatusStore().showOnce('critical-workspace-sync', t('Synced external workspace changes.'), {
      type: 'success',
      duration: 2200,
    }, 5000)
  }

  return { changed }
}

export function resetCriticalWorkspaceState(workspacePath = '') {
  const prefix = workspacePath ? `${workspacePath}:` : ''
  for (const key of [...hashCache.keys()]) {
    if (!prefix || key.startsWith(prefix)) {
      hashCache.delete(key)
    }
  }
}
