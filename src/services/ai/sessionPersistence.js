import { invoke } from '@tauri-apps/api/core'

export async function loadPersistedAiSessions(workspacePath = '') {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) return null

  try {
    const parsed = await invoke('ai_session_overlay_load', {
      params: {
        workspacePath: normalizedWorkspacePath,
      },
    })
    if (!parsed || typeof parsed !== 'object') return null
    return {
      currentSessionId: String(parsed.currentSessionId || '').trim(),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    }
  } catch {
    return null
  }
}

export async function persistAiSessions(workspacePath = '', state = {}) {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) return

  await invoke('ai_session_overlay_save', {
    params: {
      workspacePath: normalizedWorkspacePath,
      state: {
        currentSessionId: String(state.currentSessionId || '').trim(),
        sessions: Array.isArray(state.sessions) ? state.sessions : [],
      },
    },
  })
}
