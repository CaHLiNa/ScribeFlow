function createAiSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return `ai-session:${globalThis.crypto.randomUUID()}`
  }
  return `ai-session:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeAiSessionMode(mode = 'agent') {
  return String(mode || 'agent').trim() === 'chat' ? 'chat' : 'agent'
}

export function normalizeAiSessionPermissionMode(value = '') {
  const normalized = String(value || '').trim()

  if (normalized === 'plan') return 'plan'
  if (normalized === 'acceptEdits' || normalized === 'accept-edits' || normalized === 'per-tool') {
    return 'accept-edits'
  }
  if (
    normalized === 'bypassPermissions' ||
    normalized === 'bypass-permissions' ||
    normalized === 'auto'
  ) {
    return 'bypass-permissions'
  }

  return 'accept-edits'
}

function normalizeAiSessionRecord(record = {}, fallbackTitle = 'New session') {
  const createdAt = Number(record.createdAt || Date.now())
  const updatedAt = Number(record.updatedAt || createdAt || Date.now())
  const mode = normalizeAiSessionMode(record.mode)

  return {
    id: String(record.id || createAiSessionId()).trim(),
    mode,
    permissionMode: normalizeAiSessionPermissionMode(
      record.permissionMode || record.runtimePermissionMode || record.approvalMode
    ),
    runtimeTransport: String(record.runtimeTransport || '').trim(),
    title: String(record.title || fallbackTitle).trim() || fallbackTitle,
    createdAt,
    updatedAt,
    promptDraft: String(record.promptDraft || ''),
    queuedPromptDraft: String(record.queuedPromptDraft || ''),
    messages: Array.isArray(record.messages) ? record.messages : [],
    artifacts: Array.isArray(record.artifacts) ? record.artifacts : [],
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    queuedAttachments: Array.isArray(record.queuedAttachments) ? record.queuedAttachments : [],
    permissionRequests: Array.isArray(record.permissionRequests) ? record.permissionRequests : [],
    askUserRequests: Array.isArray(record.askUserRequests) ? record.askUserRequests : [],
    exitPlanRequests: Array.isArray(record.exitPlanRequests) ? record.exitPlanRequests : [],
    backgroundTasks: Array.isArray(record.backgroundTasks) ? record.backgroundTasks : [],
    isCompacting: record.isCompacting === true,
    lastCompactAt: Number(record.lastCompactAt || 0) || 0,
    waitingResume: record.waitingResume === true,
    waitingResumeMessage: String(record.waitingResumeMessage || ''),
    planMode:
      record.planMode && typeof record.planMode === 'object'
        ? {
            active: record.planMode.active === true,
            summary: String(record.planMode.summary || ''),
            note: String(record.planMode.note || ''),
          }
        : {
            active: false,
            summary: '',
            note: '',
          },
    isRunning: record.isRunning === true,
    lastError: String(record.lastError || ''),
  }
}

export function deriveAiSessionTitle(value = '', fallbackTitle = 'New session') {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return fallbackTitle

  const withoutInvocation = normalized.replace(/^([/$][^\s]+)\s*/, '').trim()
  const candidate = withoutInvocation || normalized

  if (candidate.length <= 48) return candidate
  return `${candidate.slice(0, 48).trimEnd()}…`
}

export function createAiSessionRecord(options = {}) {
  return normalizeAiSessionRecord(
    options,
    String(options.title || 'New session').trim() || 'New session'
  )
}

export function ensureAiSessionsState({
  sessions = [],
  currentSessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  const normalizedSessions = (Array.isArray(sessions) ? sessions : [])
    .filter(Boolean)
    .map((session) => normalizeAiSessionRecord(session, fallbackTitle))

  if (normalizedSessions.length === 0) {
    const initialSession = createAiSessionRecord({ title: fallbackTitle })
    return {
      sessions: [initialSession],
      currentSessionId: initialSession.id,
    }
  }

  const resolvedCurrentSessionId = normalizedSessions.some(
    (session) => session.id === currentSessionId
  )
    ? currentSessionId
    : normalizedSessions[0].id

  return {
    sessions: normalizedSessions,
    currentSessionId: resolvedCurrentSessionId,
  }
}

export function updateAiSessionRecord(
  sessions = [],
  sessionId = '',
  updater = (session) => session
) {
  const normalizedId = String(sessionId || '').trim()
  if (!normalizedId) return Array.isArray(sessions) ? [...sessions] : []

  return (Array.isArray(sessions) ? sessions : []).map((session) => {
    if (!session || session.id !== normalizedId) return session

    const nextSession = typeof updater === 'function' ? updater(session) : session
    return normalizeAiSessionRecord(
      {
        ...session,
        ...nextSession,
        updatedAt: Date.now(),
      },
      session.title || 'New session'
    )
  })
}

export function removeAiSessionRecord(sessions = [], sessionId = '') {
  const normalizedId = String(sessionId || '').trim()
  if (!normalizedId) return Array.isArray(sessions) ? [...sessions] : []

  return (Array.isArray(sessions) ? sessions : []).filter(
    (session) => session && session.id !== normalizedId
  )
}
