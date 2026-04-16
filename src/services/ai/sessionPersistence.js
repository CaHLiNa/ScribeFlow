const AI_SESSION_STORAGE_PREFIX = 'altals.ai.workspaceSessions:'

function buildWorkspaceSessionStorageKey(workspacePath = '') {
  return `${AI_SESSION_STORAGE_PREFIX}${String(workspacePath || '').trim()}`
}

export function loadPersistedAiSessions(workspacePath = '') {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) return null

  try {
    const raw = localStorage.getItem(buildWorkspaceSessionStorageKey(normalizedWorkspacePath))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      currentSessionId: String(parsed.currentSessionId || '').trim(),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    }
  } catch {
    return null
  }
}

export function persistAiSessions(workspacePath = '', state = {}) {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) return

  const payload = {
    currentSessionId: String(state.currentSessionId || '').trim(),
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
  }

  localStorage.setItem(
    buildWorkspaceSessionStorageKey(normalizedWorkspacePath),
    JSON.stringify(payload)
  )
}
