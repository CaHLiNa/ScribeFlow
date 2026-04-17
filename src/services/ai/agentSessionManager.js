import { invoke } from '@tauri-apps/api/core'
import {
  createAiSessionRecord,
  ensureAiSessionsState,
} from '../../domains/ai/aiSessionRuntime.js'
import { loadPersistedAiSessions, persistAiSessions } from './sessionPersistence.js'

function scrubRestoredAgentSession(session = {}) {
  if (!session || typeof session !== 'object') return session

  return {
    ...session,
    runtimeThreadId: String(session.runtimeThreadId || '').trim(),
    runtimeTurnId: '',
    runtimeProviderId: String(session.runtimeProviderId || '').trim(),
    runtimeTransport: String(session.runtimeTransport || '').trim(),
    isRunning: false,
    messages: [],
    artifacts: [],
    queuedPromptDraft: String(session.queuedPromptDraft || ''),
    queuedAttachments: Array.isArray(session.queuedAttachments) ? session.queuedAttachments : [],
    permissionRequests: [],
    askUserRequests: [],
    exitPlanRequests: [],
    backgroundTasks: [],
    isCompacting: false,
    lastCompactAt: 0,
    waitingResume: false,
    waitingResumeMessage: '',
    planMode: { active: false, summary: '', note: '' },
    lastError: '',
  }
}

function buildPersistedAgentSession(session = {}) {
  if (!session || typeof session !== 'object') return null

  return {
    id: String(session.id || '').trim(),
    mode: String(session.mode || 'agent').trim() || 'agent',
    permissionMode: String(session.permissionMode || '').trim(),
    runtimeThreadId: String(session.runtimeThreadId || '').trim(),
    runtimeProviderId: String(session.runtimeProviderId || '').trim(),
    runtimeTransport: String(session.runtimeTransport || '').trim(),
    title: String(session.title || '').trim(),
    createdAt: Number(session.createdAt || Date.now()),
    updatedAt: Number(session.updatedAt || Date.now()),
    promptDraft: String(session.promptDraft || ''),
    queuedPromptDraft: String(session.queuedPromptDraft || ''),
    attachments: Array.isArray(session.attachments) ? session.attachments : [],
    queuedAttachments: Array.isArray(session.queuedAttachments) ? session.queuedAttachments : [],
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

export async function restoreAgentSessionsState({
  workspacePath = '',
  fallbackTitle = 'New session',
  loadState = async (normalizedWorkspacePath, normalizedFallbackTitle) =>
    invoke('ai_session_overlay_restore', {
      params: {
        workspacePath: normalizedWorkspacePath,
        fallbackTitle: normalizedFallbackTitle,
      },
    }),
} = {}) {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) {
    return createInitialAgentSessionsState({ fallbackTitle })
  }

  const persisted = await loadState(normalizedWorkspacePath, fallbackTitle)
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

function buildSessionMutationPayload({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  fallbackTitle = 'New session',
} = {}) {
  return {
    workspacePath: String(workspacePath || '').trim(),
    currentSessionId: String(currentSessionId || '').trim(),
    sessions: Array.isArray(sessions) ? sessions : [],
    fallbackTitle: String(fallbackTitle || 'New session').trim() || 'New session',
  }
}

export async function persistAgentSessionsState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  persistState = persistAiSessions,
} = {}) {
  const normalizedWorkspacePath = String(workspacePath || '').trim()
  if (!normalizedWorkspacePath) return

  await persistState(normalizedWorkspacePath, {
    currentSessionId: String(currentSessionId || '').trim(),
    sessions: (Array.isArray(sessions) ? sessions : [])
      .map((session) => buildPersistedAgentSession(session))
      .filter(Boolean),
  })
}

export async function createAgentSessionState({
  sessions = [],
  currentSessionId = '',
  title = '',
  activate = true,
  mode = 'agent',
  permissionMode = 'accept-edits',
  fallbackTitle = 'New session',
  workspacePath = '',
  runCreate = async (payload) =>
    invoke('ai_session_overlay_create', {
      params: payload,
    }),
} = {}) {
  const response = await runCreate({
    ...buildSessionMutationPayload({
      workspacePath,
      currentSessionId,
      sessions,
      fallbackTitle,
    }),
    title: String(title || '').trim() || fallbackTitle,
    activate: activate === true,
    mode,
    permissionMode,
  })

  return {
    sessions: Array.isArray(response?.state?.sessions) ? response.state.sessions : [],
    currentSessionId: String(response?.state?.currentSessionId || '').trim(),
    session: response?.session || createAiSessionRecord({ title }),
  }
}

export async function switchAgentSessionState({
  sessions = [],
  currentSessionId = '',
  sessionId = '',
  workspacePath = '',
  fallbackTitle = 'New session',
  runSwitch = async (payload) =>
    invoke('ai_session_overlay_switch', {
      params: payload,
    }),
} = {}) {
  const response = await runSwitch({
    ...buildSessionMutationPayload({
      workspacePath,
      currentSessionId,
      sessions,
      fallbackTitle,
    }),
    sessionId: String(sessionId || '').trim(),
  })
  return {
    success: response?.success === true,
    sessions: Array.isArray(response?.state?.sessions) ? response.state.sessions : [],
    currentSessionId: String(response?.state?.currentSessionId || '').trim(),
  }
}

export async function deleteAgentSessionState({
  sessions = [],
  currentSessionId = '',
  sessionId = '',
  fallbackTitle = 'New session',
  workspacePath = '',
  runDelete = async (payload) =>
    invoke('ai_session_overlay_delete', {
      params: payload,
    }),
} = {}) {
  const response = await runDelete({
    ...buildSessionMutationPayload({
      workspacePath,
      currentSessionId,
      sessions,
      fallbackTitle,
    }),
    sessionId: String(sessionId || currentSessionId || '').trim(),
  })
  return {
    success: response?.success === true,
    sessions: Array.isArray(response?.state?.sessions) ? response.state.sessions : [],
    currentSessionId: String(response?.state?.currentSessionId || '').trim(),
  }
}

export async function renameAgentSessionState({
  sessions = [],
  currentSessionId = '',
  sessionId = '',
  title = '',
  fallbackTitle = 'New session',
  workspacePath = '',
  runRename = async (payload) =>
    invoke('ai_session_overlay_rename', {
      params: payload,
    }),
} = {}) {
  const response = await runRename({
    ...buildSessionMutationPayload({
      workspacePath,
      currentSessionId,
      sessions,
      fallbackTitle,
    }),
    sessionId: String(sessionId || '').trim(),
    title: String(title || '').trim(),
  })
  return {
    success: response?.success === true,
    sessions: Array.isArray(response?.state?.sessions) ? response.state.sessions : [],
    session: response?.session || resolveAgentSessionRecord(sessions, sessionId),
  }
}
