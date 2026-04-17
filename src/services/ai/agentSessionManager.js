import {
  createAiSessionRecord,
  ensureAiSessionsState,
  removeAiSessionRecord,
  updateAiSessionRecord,
} from '../../domains/ai/aiSessionRuntime.js'
import { loadPersistedAiSessions, persistAiSessions } from './sessionPersistence.js'

function scrubRestoredAgentSession(session = {}) {
  if (!session || typeof session !== 'object') return session

  return {
    ...session,
    isRunning: false,
    queuedPromptDraft: '',
    queuedAttachments: [],
    permissionRequests: [],
    askUserRequests: [],
    exitPlanRequests: [],
    backgroundTasks: [],
    isCompacting: false,
    lastCompactAt: 0,
    waitingResume: false,
    waitingResumeMessage: '',
    planMode: { active: false, summary: '', note: '' },
  }
}

export function buildDefaultAgentSessionTitle(translate = (key) => key, count = 1) {
  return translate('Run {count}', { count })
}

export function createInitialAgentSessionsState({ fallbackTitle = 'New session' } = {}) {
  const initialSession = createAiSessionRecord({
    title: String(fallbackTitle || 'New session').trim() || 'New session',
  })

  return {
    currentSessionId: initialSession.id,
    sessions: [initialSession],
  }
}

export function resolveAgentSessionRecord(sessions = [], sessionId = '') {
  const normalizedId = String(sessionId || '').trim()
  if (!Array.isArray(sessions) || sessions.length === 0) return null
  return sessions.find((session) => session?.id === normalizedId) || sessions[0] || null
}

export function restoreAgentSessionsState({
  workspacePath = '',
  fallbackTitle = 'New session',
  loadState = loadPersistedAiSessions,
} = {}) {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) {
    return createInitialAgentSessionsState({ fallbackTitle })
  }

  const persisted = loadState(normalizedWorkspacePath)
  if (!persisted) {
    return createInitialAgentSessionsState({ fallbackTitle })
  }

  return ensureAiSessionsState({
    sessions: (Array.isArray(persisted.sessions) ? persisted.sessions : []).map(
      scrubRestoredAgentSession
    ),
    currentSessionId: persisted.currentSessionId,
    fallbackTitle,
  })
}

export function ensureManagedAgentSessionsState({
  sessions = [],
  currentSessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  return ensureAiSessionsState({
    sessions,
    currentSessionId,
    fallbackTitle,
  })
}

export function persistAgentSessionsState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  persistState = persistAiSessions,
} = {}) {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) return

  persistState(normalizedWorkspacePath, {
    currentSessionId: String(currentSessionId || '').trim(),
    sessions: Array.isArray(sessions) ? sessions : [],
  })
}

export function createAgentSessionState({
  sessions = [],
  currentSessionId = '',
  title = '',
  activate = true,
  mode = 'agent',
  permissionMode = 'accept-edits',
  fallbackTitle = 'New session',
} = {}) {
  const nextSession = createAiSessionRecord({
    mode,
    permissionMode,
    title: String(title || '').trim() || fallbackTitle,
  })

  return {
    sessions: [nextSession, ...(Array.isArray(sessions) ? sessions : [])],
    currentSessionId: activate ? nextSession.id : String(currentSessionId || '').trim(),
    session: nextSession,
  }
}

export function switchAgentSessionState({
  sessions = [],
  currentSessionId = '',
  sessionId = '',
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) {
    return {
      success: false,
      sessions: Array.isArray(sessions) ? sessions : [],
      currentSessionId: String(currentSessionId || '').trim(),
    }
  }

  const hasSession = (Array.isArray(sessions) ? sessions : []).some(
    (session) => session?.id === normalizedSessionId
  )
  return {
    success: hasSession,
    sessions: Array.isArray(sessions) ? sessions : [],
    currentSessionId: hasSession ? normalizedSessionId : String(currentSessionId || '').trim(),
  }
}

export function deleteAgentSessionState({
  sessions = [],
  currentSessionId = '',
  sessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  const normalizedSessionId = String(sessionId || currentSessionId || '').trim()
  if (!normalizedSessionId || !Array.isArray(sessions) || sessions.length <= 1) {
    return {
      success: false,
      sessions: Array.isArray(sessions) ? sessions : [],
      currentSessionId: String(currentSessionId || '').trim(),
    }
  }

  const nextSessions = removeAiSessionRecord(sessions, normalizedSessionId)
  const nextCurrentSessionId =
    String(currentSessionId || '').trim() === normalizedSessionId
      ? nextSessions[0]?.id || ''
      : String(currentSessionId || '').trim()

  const normalizedState = ensureAiSessionsState({
    sessions: nextSessions,
    currentSessionId: nextCurrentSessionId,
    fallbackTitle,
  })

  return {
    success: true,
    ...normalizedState,
  }
}

export function renameAgentSessionState({ sessions = [], sessionId = '', title = '' } = {}) {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) {
    return {
      success: false,
      sessions: Array.isArray(sessions) ? sessions : [],
    }
  }

  const nextSessions = updateAiSessionRecord(sessions, sessionId, (session) => ({
    ...session,
    title: normalizedTitle,
  }))

  return {
    success: true,
    sessions: nextSessions,
    session: resolveAgentSessionRecord(nextSessions, sessionId),
  }
}
