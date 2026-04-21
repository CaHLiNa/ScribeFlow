import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { nanoid } from './utils'
import {
  buildAiContextBundle,
  normalizeAiSelection,
} from '../domains/ai/aiContextRuntime.js'
import {
  normalizeResearchTask,
  resolveSessionTaskSubtitle,
  resolveSessionTaskTitle,
} from '../domains/ai/researchTaskViewModel.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import { useWorkspaceStore } from './workspace'

async function loadAiConfig() {
  return invoke('ai_config_load')
}

async function resolveCodexCliState(config = {}) {
  return invoke('codex_cli_state_resolve', { params: { config } })
}

async function createClientSessionRust(params = {}) {
  return invoke('ai_client_session_create', { params })
}

async function ensureClientSessionThreadRust(params = {}) {
  return invoke('ai_client_session_ensure_thread', { params })
}

async function renameClientSessionRust(params = {}) {
  return invoke('ai_client_session_rename', { params })
}

async function deleteClientSessionRust(params = {}) {
  return invoke('ai_client_session_delete', { params })
}

async function createAiAttachmentRecord(path = '', { workspacePath = '' } = {}) {
  if (!String(path || '').trim()) return null
  return invoke('ai_attachment_create', {
    params: {
      path,
      workspacePath,
    },
  })
}

function getRuntimePendingState(runtimePendingSessions = {}, sessionId = '') {
  const state = runtimePendingSessions[String(sessionId || '').trim()]
  if (!state || typeof state !== 'object') return null
  return state
}

function normalizeSessionPermissionMode(value = '') {
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

function createInitialSessionRecord(title = 'New session') {
  return {
    id: `ai-session:${nanoid()}`,
    mode: 'agent',
    permissionMode: 'accept-edits',
    runtimeThreadId: '',
    runtimeTurnId: '',
    runtimeProviderId: '',
    runtimeTransport: '',
    title: String(title || 'New session').trim() || 'New session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    promptDraft: '',
    queuedPromptDraft: '',
    messages: [],
    artifacts: [],
    attachments: [],
    queuedAttachments: [],
    permissionRequests: [],
    askUserRequests: [],
    exitPlanRequests: [],
    backgroundTasks: [],
    isCompacting: false,
    lastCompactAt: 0,
    waitingResume: false,
    waitingResumeMessage: '',
    planMode: { active: false, summary: '', note: '', items: [] },
    activeTurn: null,
    researchTask: null,
    isRunning: false,
    lastError: '',
  }
}

function buildDefaultSessionTitle(count = 1) {
  return t('Run {count}', { count })
}

function summarizeSessionTitle(value = '', fallbackTitle = 'New session') {
  const normalized = String(value || '').trim()
  if (!normalized) return String(fallbackTitle || 'New session').trim() || 'New session'
  const chars = Array.from(normalized)
  if (chars.length <= 48) return normalized
  return `${chars.slice(0, 48).join('').trimEnd()}…`
}

function createInitialAgentSessionsState({ fallbackTitle = 'New session' } = {}) {
  const initialSession = createInitialSessionRecord(
    String(fallbackTitle || 'New session').trim() || 'New session'
  )

  return {
    currentSessionId: initialSession.id,
    sessions: [initialSession],
  }
}

function resolveAgentSessionRecord(sessions = [], sessionId = '') {
  const normalizedId = String(sessionId || '').trim()
  if (!Array.isArray(sessions) || sessions.length === 0) return null
  return sessions.find((session) => session?.id === normalizedId) || sessions[0] || null
}

function cloneMessageParts(message = null) {
  return Array.isArray(message?.parts)
    ? message.parts.map((part) => ({ ...part }))
    : []
}

function appendAssistantTextPart(message = null, text = '') {
  const normalizedText = String(text || '')
  const parts = cloneMessageParts(message)
  const textIndex = parts.findIndex((part) => part?.type === 'text')
  if (textIndex >= 0) {
    parts[textIndex] = {
      ...parts[textIndex],
      text: String(parts[textIndex]?.text || '') + normalizedText,
      isPlaceholder: false,
    }
  } else {
    parts.push({
      type: 'text',
      text: normalizedText,
    })
  }
  return parts
}

function isMeaningfulToolPayload(payload = {}) {
  const title = String(payload?.title || '').trim()
  const rawInput = payload?.rawInput ?? null
  const content = Array.isArray(payload?.content) ? payload.content : []
  const locations = Array.isArray(payload?.locations) ? payload.locations : []

  if (title) return true
  if (rawInput !== null) return true
  if (content.length > 0) return true
  if (locations.length > 0) return true
  return false
}

function upsertToolPart(message = null, payload = {}) {
  const toolCallId = String(payload?.toolCallId || '').trim()
  if (!toolCallId) return cloneMessageParts(message)
  if (!isMeaningfulToolPayload(payload)) return cloneMessageParts(message)

  const nextPart = {
    type: 'tool',
    toolId: toolCallId,
    status: String(payload?.status || 'pending').trim() || 'pending',
    label: String(payload?.title || '').trim(),
    context: '',
    detail: '',
    payload: {
      toolName: String(payload?.title || '').trim(),
      rawInput: payload?.rawInput || null,
      content: payload?.content || [],
      locations: payload?.locations || [],
      toolKind: String(payload?.toolKind || '').trim(),
    },
  }

  const parts = cloneMessageParts(message)
  const toolIndex = parts.findIndex(
    (part) => part?.type === 'tool' && String(part?.toolId || '').trim() === toolCallId
  )
  if (toolIndex >= 0) {
    parts[toolIndex] = {
      ...parts[toolIndex],
      ...nextPart,
      payload: {
        ...(parts[toolIndex]?.payload || {}),
        ...(nextPart.payload || {}),
      },
    }
  } else {
    parts.push(nextPart)
  }
  return parts
}

function clearPlaceholderParts(message = null) {
  const parts = cloneMessageParts(message).filter((part) => part?.isPlaceholder !== true)
  return parts.length > 0 ? parts : []
}

function createConversationMessage({
  id = '',
  role = 'assistant',
  createdAt = Date.now(),
  content = '',
  parts = [],
  metadata = {},
} = {}) {
  return {
    id: String(id || '').trim(),
    role,
    createdAt,
    content: String(content || ''),
    parts: Array.isArray(parts) ? parts : [],
    metadata: {
      ...(metadata || {}),
    },
  }
}

function replaceMessageById(messages = [], messageId = '', updater = (message) => message) {
  const normalizedId = String(messageId || '').trim()
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (String(message?.id || '').trim() !== normalizedId) return message
    const nextMessage = typeof updater === 'function' ? updater(message) : message
    return {
      ...message,
      ...nextMessage,
    }
  })
}

function upsertMessageById(messages = [], nextMessage = null) {
  const normalizedId = String(nextMessage?.id || '').trim()
  if (!normalizedId) return Array.isArray(messages) ? messages : []

  const list = Array.isArray(messages) ? messages : []
  const existingIndex = list.findIndex((message) => String(message?.id || '').trim() === normalizedId)
  if (existingIndex < 0) {
    return [...list, nextMessage]
  }

  const merged = {
    ...list[existingIndex],
    ...nextMessage,
    metadata: {
      ...(list[existingIndex]?.metadata || {}),
      ...(nextMessage?.metadata || {}),
    },
  }
  const nextList = list.slice()
  nextList[existingIndex] = merged
  return nextList
}

function buildToolMessageId(pendingAssistantId = '', toolCallId = '') {
  const baseId = String(pendingAssistantId || '').trim()
  const normalizedToolCallId = String(toolCallId || '').trim()
  if (!baseId || !normalizedToolCallId) return ''
  return `${baseId}:tool:${normalizedToolCallId}`
}

function buildToolMessage(payload = {}, pendingAssistantId = '', metadata = {}) {
  const toolCallId = String(payload?.toolCallId || '').trim()
  if (!toolCallId || !isMeaningfulToolPayload(payload)) return null
  const messageId = buildToolMessageId(pendingAssistantId, toolCallId)
  if (!messageId) return null

  const parts = upsertToolPart(null, payload)
  if (!parts.length) return null

  return createConversationMessage({
    id: messageId,
    role: 'assistant',
    createdAt: Date.now(),
    content: '',
    parts,
    metadata: {
      ...(metadata || {}),
      streamKind: 'tool',
      toolCallId,
    },
  })
}

function appendAssistantTextMessage(messages = [], pendingAssistantId = '', text = '', metadata = {}) {
  const normalizedId = String(pendingAssistantId || '').trim()
  const normalizedText = String(text || '')
  if (!normalizedId || !normalizedText) return Array.isArray(messages) ? messages : []

  const list = Array.isArray(messages) ? messages : []
  const existing = list.find((message) => String(message?.id || '').trim() === normalizedId) || null
  const nextParts = appendAssistantTextPart(
    existing ? { ...existing, parts: clearPlaceholderParts(existing) } : null,
    normalizedText
  )
  const nextMessage = createConversationMessage({
    id: normalizedId,
    role: 'assistant',
    createdAt: existing?.createdAt || Date.now(),
    content: `${String(existing?.content || '')}${normalizedText}`,
    parts: nextParts,
    metadata: {
      ...(existing?.metadata || {}),
      ...(metadata || {}),
      streamKind: 'assistant-text',
    },
  })
  return upsertMessageById(list, nextMessage)
}

function ensureManagedAgentSessionsState({
  sessions = [],
  currentSessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  return {
    sessions: Array.isArray(sessions) ? sessions : [],
    currentSessionId: String(currentSessionId || '').trim(),
    fallbackTitle,
  }
}

function mergeOverlaySessionState(existingSessions = [], nextSessions = [], fallbackTitle = 'New session') {
  const existingById = new Map(
    (Array.isArray(existingSessions) ? existingSessions : [])
      .filter((session) => session?.id)
      .map((session) => [session.id, session])
  )

  return ensureManagedAgentSessionsState({
    sessions: (Array.isArray(nextSessions) ? nextSessions : []).map((session) => {
      const existing = existingById.get(String(session?.id || '').trim())
      if (!existing) return session
      return {
        ...existing,
        ...session,
      }
    }),
    currentSessionId: '',
    fallbackTitle,
  }).sessions
}

async function restoreSessionOverlayState({
  workspacePath = '',
  fallbackTitle = 'New session',
} = {}) {
  return invoke('ai_session_overlay_restore', {
    params: {
      workspacePath,
      fallbackTitle,
    },
  })
}

async function saveSessionOverlayState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
} = {}) {
  return invoke('ai_session_overlay_save', {
    params: {
      workspacePath,
      state: {
        currentSessionId,
        sessions,
      },
    },
  })
}

async function switchSessionOverlayState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  sessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  return invoke('ai_session_overlay_switch', {
    params: {
      workspacePath,
      currentSessionId,
      sessions,
      sessionId,
      fallbackTitle,
    },
  })
}

async function prepareAgentRunFromCurrentConfigRust({
  activeSession = null,
  contextBundle = {},
  workspacePath = '',
} = {}) {
  return invoke('ai_agent_prepare_current_config', {
    params: {
      activeSession,
      contextBundle,
      workspacePath,
    },
  })
}

async function ensureCodexAcpSessionRust(params = {}) {
  return invoke('codex_acp_session_ensure', { params })
}

async function startCodexAcpPromptRust(params = {}) {
  return invoke('codex_acp_prompt_start', { params })
}

async function cancelCodexAcpPromptRust(params = {}) {
  return invoke('codex_acp_prompt_cancel', { params })
}

async function respondCodexAcpPermissionRust(params = {}) {
  return invoke('codex_acp_permission_respond', { params })
}

async function closeCodexAcpSessionRust(params = {}) {
  return invoke('codex_acp_session_close', { params })
}

async function mutateSessionLocalRust(session = {}, kind = '', payload = {}) {
  const response = await invoke('ai_session_local_mutate', {
    params: {
      session,
      kind,
      payload,
    },
  })
  return response?.session || session
}

async function normalizeSessionStateRust({
  sessions = [],
  currentSessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  return invoke('ai_session_state_normalize', {
    params: {
      sessions,
      currentSessionId,
      fallbackTitle,
    },
  })
}

async function runResearchVerificationRust(params = {}) {
  return invoke('research_verification_run', { params })
}

let aiAgentStreamUnlistenPromise = null
const codexEventQueues = new Map()
const codexEventProcessing = new Map()

async function ensureAiAgentStreamListener(store) {
  if (aiAgentStreamUnlistenPromise) {
    await aiAgentStreamUnlistenPromise
    return
  }

  aiAgentStreamUnlistenPromise = listen('ai-agent-stream', (event) => {
    void store.handleCodexAcpEvent(event?.payload || {})
  })

  await aiAgentStreamUnlistenPromise
}

function findSessionByPermissionRequestId(sessions = [], requestId = '') {
  const normalizedRequestId = String(requestId || '').trim()
  if (!normalizedRequestId) return null

  return (
    (Array.isArray(sessions) ? sessions : []).find(
      (session) =>
        Array.isArray(session?.permissionRequests) &&
        session.permissionRequests.some((request) => request.requestId === normalizedRequestId)
    ) || null
  )
}

function findSessionByArtifactId(sessions = [], artifactId = '') {
  const normalizedArtifactId = String(artifactId || '').trim()
  if (!normalizedArtifactId) return null

  return (
    (Array.isArray(sessions) ? sessions : []).find(
      (session) =>
        Array.isArray(session?.artifacts) &&
        session.artifacts.some((artifact) => artifact.id === normalizedArtifactId)
    ) || null
  )
}

function currentWorkspacePath() {
  return String(useWorkspaceStore().path || '').trim()
}

function resolveDefaultSessionPermissionMode({ mode = 'agent' } = {}) {
  if (String(mode || '').trim() === 'chat') {
    return 'accept-edits'
  }

  return 'accept-edits'
}

function resolveEffectiveSessionPermissionMode({ session = null, mode = '' } = {}) {
  if (String(mode || session?.mode || '').trim() === 'chat') {
    return 'chat'
  }

  return normalizeSessionPermissionMode(
    session?.permissionMode || resolveDefaultSessionPermissionMode({ mode: 'agent' })
  )
}

function scrubTransientAgentSessionState(session = {}) {
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
    planMode: { active: false, summary: '', note: '', items: [] },
    activeTurn: null,
  }
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    editorSelection: normalizeAiSelection(),
    ...createInitialAgentSessionsState({
      fallbackTitle: buildDefaultSessionTitle(1),
    }),
    restoredWorkspacePath: '',
    providerState: {
      ready: false,
      currentProviderId: 'codex-acp',
      currentProviderLabel: 'Codex ACP',
      commandPath: 'codex',
      model: '',
      runtimeBackend: 'codex-acp',
      installed: false,
      version: '',
    },
    runtimePendingSessions: {},
  }),

  getters: {
    currentSession(state) {
      return resolveAgentSessionRecord(state.sessions, state.currentSessionId)
    },

    sessionList(state) {
      return (Array.isArray(state.sessions) ? state.sessions : []).map((session) => ({
        id: session.id,
        mode: session.mode || 'agent',
        permissionMode: resolveEffectiveSessionPermissionMode({ session }),
        title: resolveSessionTaskTitle(session, t('Session')),
        subtitle: resolveSessionTaskSubtitle(session),
        researchTask: normalizeResearchTask(session.researchTask),
        isRunning: session.isRunning === true,
        hasError: !!String(session.lastError || '').trim(),
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
      }))
    },

    currentContextBundle(state) {
      const editorStore = useEditorStore()
      const referencesStore = useReferencesStore()
      const workspaceStore = useWorkspaceStore()

      return buildAiContextBundle({
        workspacePath: workspaceStore.path,
        activeFile: editorStore.activeTab,
        selection: state.editorSelection,
        selectedReference:
          workspaceStore.isWorkspaceSurface && workspaceStore.leftSidebarPanel === 'references'
            ? referencesStore.selectedReference
            : null,
        referenceActive:
          workspaceStore.isWorkspaceSurface && workspaceStore.leftSidebarPanel === 'references',
      })
    },

    promptDraft() {
      return String(this.currentSession?.promptDraft || '')
    },

    messages() {
      return Array.isArray(this.currentSession?.messages) ? this.currentSession.messages : []
    },

    artifacts() {
      return Array.isArray(this.currentSession?.artifacts) ? this.currentSession.artifacts : []
    },

    researchEvidence() {
      return Array.isArray(this.currentSession?.researchEvidence)
        ? this.currentSession.researchEvidence
        : []
    },

    researchVerifications() {
      return Array.isArray(this.currentSession?.researchVerifications)
        ? this.currentSession.researchVerifications
        : []
    },

    attachments() {
      return Array.isArray(this.currentSession?.attachments) ? this.currentSession.attachments : []
    },

    latestArtifact() {
      return this.artifacts[0] || null
    },

    lastError() {
      return String(this.currentSession?.lastError || '')
    },

    isRunning() {
      return this.currentSession?.isRunning === true
    },

    isGenerating() {
      return this.isRunning
    },

    activePermissionRequest() {
      return Array.isArray(this.currentSession?.permissionRequests)
        ? this.currentSession.permissionRequests[0] || null
        : null
    },

    activeAskUserRequest() {
      return Array.isArray(this.currentSession?.askUserRequests)
        ? this.currentSession.askUserRequests[0] || null
        : null
    },

    activeExitPlanRequest() {
      return Array.isArray(this.currentSession?.exitPlanRequests)
        ? this.currentSession.exitPlanRequests[0] || null
        : null
    },

    backgroundTasks() {
      return Array.isArray(this.currentSession?.backgroundTasks)
        ? this.currentSession.backgroundTasks
        : []
    },

    activeBackgroundTasks() {
      return this.backgroundTasks.filter((task) => task.status === 'running')
    },

    planModeState() {
      return this.currentSession?.planMode || { active: false, summary: '', note: '', items: [] }
    },

    activeTurnState() {
      return this.currentSession?.activeTurn || null
    },

    compactionState() {
      return {
        active: this.currentSession?.isCompacting === true,
        lastCompletedAt: Number(this.currentSession?.lastCompactAt || 0) || 0,
      }
    },

    currentSessionMode() {
      return 'agent'
    },

    currentPermissionMode() {
      return resolveEffectiveSessionPermissionMode({
        session: this.currentSession,
        mode: this.currentSession?.mode,
      })
    },

    resumeState() {
      const activeTurn = this.currentSession?.activeTurn || null
      const pendingKind = String(activeTurn?.pendingRequestKind || '').trim()
      if (pendingKind) {
        const summary = String(activeTurn?.summary || '').trim()
        return {
          active: true,
          message:
            summary ||
            (pendingKind === 'permission'
              ? t('Waiting for permission approval.')
              : pendingKind === 'ask-user'
                ? t('Waiting for user input.')
                : t('Waiting for plan confirmation.')),
        }
      }
      return {
        active: this.currentSession?.waitingResume === true,
        message: String(this.currentSession?.waitingResumeMessage || '').trim(),
      }
    },

  },

  actions: {
    persistCurrentWorkspaceSessions({ workspacePath = '', force = false } = {}) {
      const normalizedWorkspacePath = String(workspacePath || currentWorkspacePath()).trim()
      if (!normalizedWorkspacePath) return
      if (!force && String(this.restoredWorkspacePath || '').trim() !== normalizedWorkspacePath) {
        return
      }
      const targetWorkspacePath = normalizedWorkspacePath
      if (!targetWorkspacePath) return
      void saveSessionOverlayState({
        workspacePath: targetWorkspacePath,
        currentSessionId: this.currentSessionId,
        sessions: this.sessions,
      }).catch(() => {})
    },

    async initializeWorkspaceSessions(workspacePath = '') {
      const normalizedWorkspacePath = String(workspacePath || currentWorkspacePath()).trim()
      const restored = await restoreSessionOverlayState({
        workspacePath: normalizedWorkspacePath,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      const restoredSessions = Array.isArray(restored?.sessions) ? restored.sessions : []
      const restoredCurrentSessionId = String(restored?.currentSessionId || '').trim()
      const nextState = await normalizeSessionStateRust({
        sessions: restoredSessions.map(scrubTransientAgentSessionState),
        currentSessionId: restoredCurrentSessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      this.sessions = Array.isArray(nextState?.sessions) ? nextState.sessions : []
      this.currentSessionId = String(nextState?.currentSessionId || '').trim()
      this.restoredWorkspacePath = normalizedWorkspacePath
      this.persistCurrentWorkspaceSessions({
        workspacePath: normalizedWorkspacePath,
        force: true,
      })
      return {
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
      }
    },

    async restoreWorkspaceSessions(workspacePath = '') {
      const normalizedWorkspacePath = String(workspacePath || currentWorkspacePath()).trim()
      const normalized = await restoreSessionOverlayState({
        workspacePath: normalizedWorkspacePath,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      this.sessions = mergeOverlaySessionState(
        this.sessions,
        Array.isArray(normalized?.sessions) ? normalized.sessions : [],
        buildDefaultSessionTitle(1)
      )
      this.currentSessionId = String(normalized?.currentSessionId || '').trim()
      this.restoredWorkspacePath = normalizedWorkspacePath
    },

    async resetTransientRuntimeState() {
      const normalized = ensureManagedAgentSessionsState({
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(
          Array.isArray(this.sessions) && this.sessions.length > 0 ? this.sessions.length : 1
        ),
      })

      const nextState = await normalizeSessionStateRust({
        sessions: normalized.sessions.map(scrubTransientAgentSessionState),
        currentSessionId: normalized.currentSessionId,
        fallbackTitle: normalized.fallbackTitle,
      })
      this.sessions = Array.isArray(nextState?.sessions) ? nextState.sessions : []
      this.currentSessionId = String(nextState?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
    },

    async ensureSessionState() {
      const normalized = ensureManagedAgentSessionsState({
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(
          Array.isArray(this.sessions) && this.sessions.length > 0 ? this.sessions.length : 1
        ),
      })

      const nextState = await normalizeSessionStateRust({
        sessions: normalized.sessions,
        currentSessionId: normalized.currentSessionId,
        fallbackTitle: normalized.fallbackTitle,
      })
      this.sessions = Array.isArray(nextState?.sessions) ? nextState.sessions : []
      this.currentSessionId = String(nextState?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return {
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
      }
    },

    async updateSessionById(sessionId = '', updater = (session) => session) {
      const normalized = await this.ensureSessionState()
      const targetSessionId = String(sessionId || normalized.currentSessionId || '').trim()
      if (!targetSessionId) return null

      const nextSessions = (Array.isArray(normalized.sessions) ? normalized.sessions : []).map((session) => {
        if (!session || session.id !== targetSessionId) return session

        const nextSession = typeof updater === 'function' ? updater(session) : session
        return {
          ...session,
          ...nextSession,
          updatedAt: Date.now(),
        }
      })
      const nextState = await normalizeSessionStateRust({
        sessions: nextSessions,
        currentSessionId: normalized.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(nextSessions.length || 1),
      })
      this.sessions = Array.isArray(nextState?.sessions) ? nextState.sessions : []
      this.currentSessionId = String(nextState?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return resolveAgentSessionRecord(this.sessions, targetSessionId)
    },

    async mutateSessionById(sessionId = '', kind = '', payload = {}) {
      const normalized = await this.ensureSessionState()
      const targetSessionId = String(sessionId || normalized.currentSessionId || '').trim()
      if (!targetSessionId || !String(kind || '').trim()) return null

      const targetSession = resolveAgentSessionRecord(normalized.sessions, targetSessionId)
      if (!targetSession) return null

      const nextSession = await mutateSessionLocalRust(targetSession, kind, payload)
      const nextState = await normalizeSessionStateRust({
        sessions: (Array.isArray(normalized.sessions) ? normalized.sessions : []).map((session) =>
          session?.id === targetSessionId ? nextSession : session
        ),
        currentSessionId: normalized.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(
          Array.isArray(normalized.sessions) && normalized.sessions.length > 0
            ? normalized.sessions.length
            : 1
        ),
      })
      this.sessions = Array.isArray(nextState?.sessions) ? nextState.sessions : []
      this.currentSessionId = String(nextState?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return resolveAgentSessionRecord(this.sessions, targetSessionId)
    },

    async createSession({ title = '', activate = true } = {}) {
      const normalizedMode = 'agent'
      const nextState = await createClientSessionRust({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        title: String(title || '').trim() || buildDefaultSessionTitle(this.sessions.length + 1),
        activate,
        mode: normalizedMode,
        permissionMode: resolveDefaultSessionPermissionMode({ mode: normalizedMode }),
        fallbackTitle: buildDefaultSessionTitle(1),
        cwd: useWorkspaceStore().path || '',
      })

      this.sessions = mergeOverlaySessionState(
        this.sessions,
        Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : [],
        buildDefaultSessionTitle(1)
      )
      this.currentSessionId = String(nextState?.state?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return nextState?.session || null
    },

    async switchSession(sessionId = '') {
      const nextState = await switchSessionOverlayState({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (nextState?.success !== true) return false
      this.sessions = mergeOverlaySessionState(
        this.sessions,
        Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : [],
        buildDefaultSessionTitle(1)
      )
      this.currentSessionId = String(nextState?.state?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return true
    },

    async deleteSession(sessionId = '') {
      const targetSession = resolveAgentSessionRecord(this.sessions, sessionId || this.currentSessionId)
      if (targetSession?.runtimeTransport === 'codex-acp') {
        await closeCodexAcpSessionRust({
          sessionId: targetSession.id,
        }).catch(() => null)
      }

      const nextState = await deleteClientSessionRust({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (nextState?.success !== true) return false

      this.sessions = mergeOverlaySessionState(
        this.sessions,
        Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : [],
        buildDefaultSessionTitle(1)
      )
      this.currentSessionId = String(nextState?.state?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return true
    },

    async renameSession(sessionId = '', title = '') {
      const nextState = await renameClientSessionRust({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId: sessionId || this.currentSessionId,
        title,
        fallbackTitle: buildDefaultSessionTitle(1),
        cwd: useWorkspaceStore().path || '',
      })
      if (nextState?.success !== true) return false

      this.sessions = mergeOverlaySessionState(
        this.sessions,
        Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : [],
        buildDefaultSessionTitle(1)
      )
      this.persistCurrentWorkspaceSessions()
      return !!nextState?.session
    },

    async setSessionMode(_mode = 'agent', sessionId = '') {
      const updated = await this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        mode: 'agent',
      }))
      return updated || null
    },

    async setSessionPermissionMode(mode = 'accept-edits', sessionId = '') {
      const normalizedMode = normalizeSessionPermissionMode(mode)
      const updated = await this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        permissionMode: normalizedMode,
      }))
      return updated || null
    },

    updateEditorSelection(selection = null) {
      this.editorSelection = normalizeAiSelection(selection)
    },

    clearEditorSelection(filePath = '') {
      if (!filePath || this.editorSelection.filePath === filePath) {
        this.editorSelection = normalizeAiSelection()
      }
    },

    setPromptDraft(value = '') {
      void this.mutateSessionById(this.currentSessionId, 'setPromptDraft', {
        value: String(value || ''),
      })
    },

    clearSession(sessionId = '') {
      void this.mutateSessionById(sessionId || this.currentSessionId, 'clearSession', {})
    },

    async addAttachmentFromPath(path = '', options = {}) {
      const attachment = await createAiAttachmentRecord(path, {
        workspacePath: useWorkspaceStore().path || '',
        ...options,
      })
      if (!attachment) return null

      await this.mutateSessionById(this.currentSessionId, 'addAttachment', { attachment })
      return attachment
    },

    removeAttachment(attachmentId = '') {
      const normalizedAttachmentId = String(attachmentId || '').trim()
      if (!normalizedAttachmentId) return

      void this.mutateSessionById(this.currentSessionId, 'removeAttachment', {
        attachmentId: normalizedAttachmentId,
      })
    },

    clearAttachments(sessionId = '') {
      void this.mutateSessionById(sessionId || this.currentSessionId, 'clearAttachments', {})
    },

    queueCurrentSubmission(sessionId = '') {
      const targetSession = resolveAgentSessionRecord(
        this.sessions,
        sessionId || this.currentSessionId
      )
      if (!targetSession) return false

      const promptDraft = String(targetSession.promptDraft || '')
      const queuedPromptDraft = String(targetSession.queuedPromptDraft || '')
      const attachments = Array.isArray(targetSession.attachments) ? targetSession.attachments : []
      if (!promptDraft.trim() && attachments.length === 0) return false

      void this.mutateSessionById(targetSession.id, 'queueSubmission', {})
      return true
    },

    dequeueQueuedSubmission(sessionId = '') {
      const targetSession = resolveAgentSessionRecord(
        this.sessions,
        sessionId || this.currentSessionId
      )
      if (!targetSession) return false

      const queuedPromptDraft = String(targetSession.queuedPromptDraft || '')
      const queuedAttachments = Array.isArray(targetSession.queuedAttachments)
        ? targetSession.queuedAttachments
        : []
      if (!queuedPromptDraft.trim() && queuedAttachments.length === 0) return false

      void this.mutateSessionById(targetSession.id, 'dequeueSubmission', {})
      return true
    },

    queueAskUserRequest(event = {}, sessionId = '') {
      const requestId = String(event.requestId || '').trim()
      if (!requestId) return

      const nextRequest = {
        requestId,
        streamId: String(event.streamId || '').trim(),
        title: String(event.title || '').trim(),
        prompt: String(event.prompt || event.question || '').trim(),
        description: String(event.description || '').trim(),
        questions: Array.isArray(event.questions) ? event.questions : [],
        runtimeManaged: event.runtimeManaged === true,
      }

      void this.mutateSessionById(sessionId || this.currentSessionId, 'queueAskUserRequest', nextRequest)
    },

    clearAskUserRequest(requestId = '', sessionId = '') {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return

      void this.mutateSessionById(sessionId || this.currentSessionId, 'clearAskUserRequest', {
        requestId: normalizedRequestId,
      })
    },

    async respondToAskUserRequest({ requestId = '', answers = {}, sessionId = '' } = {}) {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return false

      const targetSession = sessionId
        ? resolveAgentSessionRecord(this.sessions, sessionId)
        : (Array.isArray(this.sessions) ? this.sessions : []).find(
            (session) =>
              Array.isArray(session?.askUserRequests) &&
              session.askUserRequests.some((request) => request.requestId === normalizedRequestId)
          ) || null
      const request = targetSession?.askUserRequests?.find(
        (item) => item.requestId === normalizedRequestId
      )
      if (!request) return false

      this.clearAskUserRequest(normalizedRequestId, targetSession?.id)
      return true
    },

    queueExitPlanRequest(event = {}, sessionId = '') {
      const requestId = String(event.requestId || '').trim()
      if (!requestId) return

      const nextRequest = {
        requestId,
        streamId: String(event.streamId || '').trim(),
        toolUseId: String(event.toolUseId || '').trim(),
        title: String(event.title || '').trim(),
        allowedPrompts: Array.isArray(event.allowedPrompts) ? event.allowedPrompts : [],
        runtimeManaged: event.runtimeManaged === true,
      }

      void this.mutateSessionById(sessionId || this.currentSessionId, 'queueExitPlanRequest', nextRequest)
    },

    clearExitPlanRequest(requestId = '', sessionId = '') {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return

      void this.mutateSessionById(sessionId || this.currentSessionId, 'clearExitPlanRequest', {
        requestId: normalizedRequestId,
      })
    },

    async respondToExitPlanRequest({
      requestId = '',
      action = 'deny',
      feedback = '',
      sessionId = '',
    } = {}) {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return false

      const targetSession = sessionId
        ? resolveAgentSessionRecord(this.sessions, sessionId)
        : (Array.isArray(this.sessions) ? this.sessions : []).find(
            (session) =>
              Array.isArray(session?.exitPlanRequests) &&
              session.exitPlanRequests.some((request) => request.requestId === normalizedRequestId)
          ) || null
      const request = targetSession?.exitPlanRequests?.find(
        (item) => item.requestId === normalizedRequestId
      )
      if (!request) return false

      this.clearExitPlanRequest(normalizedRequestId, targetSession?.id)
      return true
    },

    setPlanModeState(sessionId = '', planMode = {}) {
      void this.mutateSessionById(sessionId || this.currentSessionId, 'setPlanModeState', planMode)
    },

    setWaitingResumeState(sessionId = '', { active = false, message = '' } = {}) {
      void this.mutateSessionById(sessionId || this.currentSessionId, 'setWaitingResumeState', { active, message })
    },

    setCompactionState(sessionId = '', { active = false } = {}) {
      void this.mutateSessionById(sessionId || this.currentSessionId, 'setCompactionState', { active })
    },

    upsertBackgroundTask(task = {}, sessionId = '') {
      void this.mutateSessionById(sessionId || this.currentSessionId, 'upsertBackgroundTask', { task })
    },

    clearBackgroundTask(taskId = '', sessionId = '') {
      const normalizedTaskId = String(taskId || '').trim()
      if (!normalizedTaskId) return

      void this.mutateSessionById(sessionId || this.currentSessionId, 'clearBackgroundTask', {
        taskId: normalizedTaskId,
      })
    },

    queuePermissionRequest(event = {}, sessionId = '') {
      const requestId = String(event.requestId || event.toolUseId || '').trim()
      const streamId = String(event.streamId || '').trim()
      if (!requestId || (!streamId && event.runtimeManaged !== true)) return

      const nextRequest = {
        requestId,
        streamId,
        toolName: String(event.toolName || '').trim(),
        displayName: String(event.displayName || event.toolName || '').trim(),
        title: String(event.title || '').trim(),
        description: String(event.description || '').trim(),
        decisionReason: String(event.decisionReason || '').trim(),
        inputPreview: String(event.inputPreview || '').trim(),
        runtimeManaged: event.runtimeManaged === true,
      }

      void this.mutateSessionById(sessionId || this.currentSessionId, 'queuePermissionRequest', nextRequest)
    },

    clearPermissionRequest(requestId = '', sessionId = '') {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return

      const targetSession = sessionId
        ? resolveAgentSessionRecord(this.sessions, sessionId)
        : findSessionByPermissionRequestId(this.sessions, normalizedRequestId)

      if (!targetSession) return

      void this.mutateSessionById(targetSession.id, 'clearPermissionRequest', {
        requestId: normalizedRequestId,
      })
    },

    async respondToPermissionRequest({
      requestId = '',
      behavior = 'deny',
      persist = false,
      sessionId = '',
    } = {}) {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return false
      const targetSession = sessionId
        ? resolveAgentSessionRecord(this.sessions, sessionId)
        : findSessionByPermissionRequestId(this.sessions, normalizedRequestId)
      const request = targetSession?.permissionRequests?.find(
        (item) => item.requestId === normalizedRequestId
      )
      if (!request) return false
      const optionId = (() => {
        if (behavior === 'allow') {
          return persist ? request.allowAlwaysOptionId : request.allowOnceOptionId
        }
        return persist ? request.denyAlwaysOptionId : request.denyOnceOptionId
      })()
      if (!String(optionId || '').trim()) return false

      await respondCodexAcpPermissionRust({
        sessionId: targetSession.id,
        requestId: Number(normalizedRequestId),
        optionId,
      })
      this.clearPermissionRequest(normalizedRequestId, targetSession?.id)
      await this.updateSessionById(targetSession.id, (session) => ({
        ...session,
        activeTurn: session.activeTurn
          ? {
              ...session.activeTurn,
              status: 'running',
              phase: 'responding',
              pendingRequestKind: '',
              pendingRequestId: '',
              pendingRequestCount: 0,
              updatedAt: Date.now(),
            }
          : session.activeTurn,
      }))
      return true
    },

    async syncExternalFileWrite(path = '', content = '') {
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return

      const filesStore = useFilesStore()
      const editorStore = useEditorStore()
      filesStore.setInMemoryFileContent(normalizedPath, String(content || ''))

      const editorRuntime =
        editorStore.getAnyEditorRuntime?.(normalizedPath) ||
        editorStore.getAnyEditorView(normalizedPath)
      if (editorRuntime?.scribeflowApplyExternalContent) {
        await editorRuntime.scribeflowApplyExternalContent(String(content || ''))
      }
      editorStore.clearFileDirty(normalizedPath)
    },

    async handleCodexAcpEvent(payload = {}) {
      const sessionId = String(payload?.sessionId || '').trim()
      if (!sessionId) return

      const pending = codexEventQueues.get(sessionId) || []
      pending.push(payload)
      codexEventQueues.set(sessionId, pending)

      if (codexEventProcessing.get(sessionId) === true) {
        return
      }

      codexEventProcessing.set(sessionId, true)
      try {
        while ((codexEventQueues.get(sessionId) || []).length > 0) {
          const nextPayload = codexEventQueues.get(sessionId)?.shift() || null
          if (!nextPayload) continue
          await this.applyCodexAcpEvent(nextPayload)
        }
      } finally {
        codexEventProcessing.delete(sessionId)
        if ((codexEventQueues.get(sessionId) || []).length === 0) {
          codexEventQueues.delete(sessionId)
        }
      }
    },

    async applyCodexAcpEvent(payload = {}) {
      const sessionId = String(payload?.sessionId || '').trim()
      if (!sessionId) return
      const targetSession = resolveAgentSessionRecord(this.sessions, sessionId)
      if (!targetSession) return

      const kind = String(payload?.kind || '').trim()
      if (!kind) return

      if (kind === 'file-written') {
        await this.syncExternalFileWrite(payload?.path, payload?.content)
        return
      }

      if (kind === 'runtime-stderr' || kind === 'runtime-note') {
        return
      }

      if (kind === 'session-ready') {
        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          runtimeThreadId: String(payload?.runtimeSessionId || session.runtimeThreadId || '').trim(),
          runtimeProviderId: 'codex-acp',
          runtimeTransport: String(payload?.transport || 'codex-acp').trim(),
        }))
        return
      }

      if (kind === 'permission-request') {
        const options = Array.isArray(payload?.options) ? payload.options : []
        const allowAlways = options.find((item) => String(item?.kind || '').trim() === 'allow_always')
        const allowOnce = options.find((item) => String(item?.kind || '').trim() === 'allow_once')
        const denyAlways = options.find((item) => String(item?.kind || '').trim() === 'reject_always')
        const denyOnce = options.find((item) => String(item?.kind || '').trim() === 'reject_once')
        const rawInput = payload?.toolCall?.rawInput || null
        const inputPreview =
          String(payload?.inputPreview || '').trim()
          || (rawInput ? JSON.stringify(rawInput, null, 2) : '')

        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          permissionRequests: [
            {
              requestId: String(payload?.requestId || '').trim(),
              streamId: String(payload?.requestId || '').trim(),
              toolName: String(payload?.toolCall?.title || '').trim(),
              displayName: String(payload?.toolCall?.title || '').trim(),
              title: String(payload?.toolCall?.title || '').trim(),
              description: '',
              decisionReason: '',
              inputPreview,
              runtimeManaged: true,
              allowOnceOptionId: String(allowOnce?.optionId || '').trim(),
              allowAlwaysOptionId: String(allowAlways?.optionId || '').trim(),
              denyOnceOptionId: String(denyOnce?.optionId || '').trim(),
              denyAlwaysOptionId: String(denyAlways?.optionId || '').trim(),
            },
          ],
          activeTurn: session.activeTurn
            ? {
                ...session.activeTurn,
                status: 'waiting',
                phase: 'permission',
                pendingRequestKind: 'permission',
                pendingRequestId: String(payload?.requestId || '').trim(),
                pendingRequestCount: 1,
                lastToolName: String(payload?.toolCall?.title || '').trim(),
                updatedAt: Date.now(),
              }
            : session.activeTurn,
        }))
        return
      }

      if (kind === 'thinking-delta') {
        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          activeTurn: session.activeTurn
            ? {
                ...session.activeTurn,
                status: 'running',
                phase: 'thinking',
                summary: String(payload?.text || '').trim(),
                updatedAt: Date.now(),
              }
            : session.activeTurn,
        }))
        return
      }

      if (kind === 'tool-update') {
        await this.updateSessionById(sessionId, (session) => {
          const pendingAssistantId = String(session?.activeTurn?.pendingAssistantId || '').trim()
          const pendingAssistantMessage = Array.isArray(session.messages)
            ? session.messages.find((message) => message?.id === pendingAssistantId) || null
            : null
          const nextToolMessage = buildToolMessage(payload, pendingAssistantId, {
            contextChips: pendingAssistantMessage?.metadata?.contextChips || [],
          })
          const nextMessages = nextToolMessage
            ? upsertMessageById(session.messages, nextToolMessage)
            : session.messages

          return {
            ...session,
            messages: nextMessages,
            activeTurn: session.activeTurn
              ? {
                  ...session.activeTurn,
                  status: 'running',
                  phase: String(payload?.status || '').trim() === 'completed' ? 'responding' : 'tools',
                  lastToolName: String(payload?.title || '').trim(),
                  updatedAt: Date.now(),
                }
              : session.activeTurn,
          }
        })
        return
      }

      if (kind === 'assistant-delta') {
        await this.updateSessionById(sessionId, (session) => {
          const pendingAssistantId = String(session?.activeTurn?.pendingAssistantId || '').trim()
          const pendingAssistantMessage = Array.isArray(session.messages)
            ? session.messages.find((message) => message?.id === pendingAssistantId) || null
            : null
          const nextMessages = appendAssistantTextMessage(
            session.messages,
            pendingAssistantId,
            payload?.text,
            {
              contextChips: pendingAssistantMessage?.metadata?.contextChips || [],
            }
          )

          return {
            ...session,
            messages: nextMessages,
            permissionRequests: [],
            activeTurn: session.activeTurn
              ? {
                  ...session.activeTurn,
                  status: 'running',
                  phase: 'responding',
                  pendingRequestKind: '',
                  pendingRequestId: '',
                  pendingRequestCount: 0,
                  updatedAt: Date.now(),
                }
              : session.activeTurn,
          }
        })
        return
      }

      if (kind === 'prompt-finished') {
        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          isRunning: false,
          permissionRequests: [],
          activeTurn: null,
          lastError: '',
        }))
        return
      }

      if (kind === 'prompt-cancelled') {
        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          isRunning: false,
          permissionRequests: [],
          activeTurn: null,
        }))
        return
      }

      if (kind === 'prompt-error' || kind === 'session-exit') {
        const message = String(payload?.error || payload?.text || t('AI execution failed.')).trim()
        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          isRunning: false,
          permissionRequests: [],
          activeTurn: null,
          lastError: message,
        }))
        if (message) {
          useToastStore().show(message, { type: 'error' })
        }
      }
    },

    async refreshProviderState() {
      const config = await loadAiConfig()
      const resolvedState = await resolveCodexCliState(config?.codexCli || {})
      this.providerState = {
        ready: resolvedState?.ready === true,
        currentProviderId: 'codex-acp',
        currentProviderLabel: 'Codex ACP',
        commandPath: String(resolvedState?.commandPath || 'codex').trim() || 'codex',
        model: String(resolvedState?.model || '').trim(),
        runtimeBackend: 'codex-acp',
        installed: resolvedState?.installed === true,
        version: String(resolvedState?.version || '').trim(),
      }
      return this.providerState
    },

    async runActiveSkill(options = {}) {
      const toastStore = useToastStore()
      const requestedSessionId = String(options?.sessionId || this.currentSessionId || '').trim()
      const activeSession =
        resolveAgentSessionRecord(this.sessions, requestedSessionId) ||
        (await this.createSession())
      const sessionId = activeSession.id
      let preparedRun = null
      let pendingAssistantId = ''
      let runStarted = false
      this.runtimePendingSessions = {
        ...this.runtimePendingSessions,
        [sessionId]: {
          pendingAssistantId: '',
          stopRequested: false,
        },
      }

      try {
        preparedRun = await prepareAgentRunFromCurrentConfigRust({
          activeSession,
          contextBundle: this.currentContextBundle,
          workspacePath: useWorkspaceStore().path || '',
        })

        if (!preparedRun.ok) {
          const message = t('AI execution failed.')
          await this.updateSessionById(sessionId, (session) => ({
            ...session,
            lastError: message,
          }))
          toastStore.show(message, { type: 'warning' })
          return null
        }

        const userMessageId = `message:${nanoid()}`
        pendingAssistantId = `message:${nanoid()}`
        runStarted = true
        await ensureAiAgentStreamListener(this)
        const rawUserInstruction = String(
          preparedRun?.userInstruction || preparedRun?.promptDraft || activeSession?.promptDraft || ''
        ).trim()
        const dispatchPrompt = String(preparedRun?.dispatchPrompt || rawUserInstruction).trim()
        const contextChips = Array.isArray(preparedRun?.contextSummary?.chips)
          ? preparedRun.contextSummary.chips
          : []
        const preferredTitle = summarizeSessionTitle(
          rawUserInstruction,
          buildDefaultSessionTitle(this.sessions.length)
        )

        this.runtimePendingSessions = {
          ...this.runtimePendingSessions,
          [sessionId]: {
            ...(getRuntimePendingState(this.runtimePendingSessions, sessionId) || {}),
            pendingAssistantId,
            stopRequested: false,
          },
        }

        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          runtimeTransport: 'codex-acp',
          runtimeProviderId: 'codex-acp',
          title:
            Array.isArray(session.messages) && session.messages.length > 0
              ? session.title
              : preferredTitle,
          permissionRequests: [],
          messages: [
            ...(Array.isArray(session.messages) ? session.messages : []),
            {
              id: userMessageId,
              role: 'user',
              createdAt: Date.now(),
              content: rawUserInstruction,
              parts: [
                {
                  type: 'text',
                  text: rawUserInstruction,
                },
              ],
              metadata: {
                skillId: '',
                skillLabel: '',
                contextChips,
              },
            },
          ],
          isRunning: true,
          lastError: '',
          promptDraft: '',
          attachments: [],
          activeTurn: {
            id: `turn:${nanoid()}`,
            threadId: String(
              session.runtimeTransport === 'codex-acp' ? session.runtimeThreadId || '' : ''
            ).trim(),
            runtimeTurnId: '',
            status: 'starting',
            phase: 'dispatch',
            label: t('Codex'),
            summary: '',
            userInstruction: rawUserInstruction,
            pendingAssistantId,
            pendingRequestKind: '',
            pendingRequestId: '',
            pendingRequestCount: 0,
            lastToolName: '',
            transport: 'codex-acp',
            route: null,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          },
        }))

        const ensuredSession = await ensureCodexAcpSessionRust({
          sessionId,
          runtimeSessionId:
            activeSession?.runtimeTransport === 'codex-acp'
              ? String(activeSession?.runtimeThreadId || '').trim()
              : '',
          workspacePath: currentWorkspacePath(),
          cwd: useWorkspaceStore().path || '',
          title: preferredTitle,
          config: preparedRun?.config || {},
        })

        await this.updateSessionById(sessionId, (session) => ({
          ...session,
          runtimeThreadId: String(
            ensuredSession?.runtimeSessionId || session.runtimeThreadId || ''
          ).trim(),
          runtimeTransport: 'codex-acp',
          runtimeProviderId: 'codex-acp',
          activeTurn: session.activeTurn
            ? {
                ...session.activeTurn,
                threadId: String(
                  ensuredSession?.runtimeSessionId || session.runtimeThreadId || ''
                ).trim(),
                status: 'running',
                phase: 'waiting',
                updatedAt: Date.now(),
              }
            : session.activeTurn,
        }))

        await startCodexAcpPromptRust({
          sessionId,
          prompt: dispatchPrompt,
          pendingAssistantId,
        })

        return {
          assistantMessage: null,
          artifact: null,
        }
      } catch (error) {
        const normalizedErrorMessage =
          error instanceof Error
            ? String(error.message || '').trim()
            : String(error || '').trim()
        const wasAborted =
          error instanceof DOMException
            ? error.name === 'AbortError'
            : String(error?.name || '').trim() === 'AbortError' ||
              normalizedErrorMessage === 'AI execution stopped.'
        const message =
          wasAborted
            ? t('AI execution stopped.')
            : error instanceof Error
              ? error.message
              : String(error || t('AI execution failed.'))
        if (!runStarted) {
          await this.updateSessionById(sessionId, (session) => ({
            ...session,
            lastError: wasAborted ? '' : message,
          }))
        }
        if (!wasAborted) {
          toastStore.show(message, { type: 'error' })
        }
        return null
      } finally {
        if (getRuntimePendingState(this.runtimePendingSessions, sessionId)) {
          const nextPendingSessions = { ...this.runtimePendingSessions }
          delete nextPendingSessions[sessionId]
          this.runtimePendingSessions = nextPendingSessions
        }
        if (this.dequeueQueuedSubmission(sessionId)) {
          queueMicrotask(() => {
            const queuedSession = resolveAgentSessionRecord(this.sessions, sessionId)
            if (queuedSession?.isRunning !== true) {
              void this.runActiveSkill({ sessionId })
            }
          })
        }
      }
    },

    async stopCurrentRun(sessionId = '') {
      const targetSessionId = String(sessionId || this.currentSessionId || '').trim()
      if (!targetSessionId) return false
      const targetSession = resolveAgentSessionRecord(this.sessions, targetSessionId)
      if (!targetSession) return false
      const runtimePendingState = getRuntimePendingState(this.runtimePendingSessions, targetSessionId)
      if (runtimePendingState) {
        this.runtimePendingSessions = {
          ...this.runtimePendingSessions,
          [targetSessionId]: {
            ...runtimePendingState,
            stopRequested: true,
          },
        }
      }

      const response =
        await cancelCodexAcpPromptRust({
          sessionId: targetSession.id,
        }).catch(() => null)
      if (response?.ok === true) {
        return true
      }

      return !!runtimePendingState
    },

    async applyArtifact(artifactId = '') {
      const targetSession = findSessionByArtifactId(this.sessions, artifactId)
      const artifact = targetSession?.artifacts?.find((item) => item.id === artifactId)
      if (!artifact || artifact.status === 'applied') return false

      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()
      const referencesStore = useReferencesStore()

      try {
        let applied = false
        let verification = null
        let verificationTask = null
        if (artifact.type === 'doc_patch' || artifact.type === 'citation_insert') {
          let currentContent = ''
          const editorRuntime = editorStore.getAnyEditorRuntime?.(artifact.filePath)
            || editorStore.getAnyEditorView(artifact.filePath)
          if (editorRuntime?.scribeflowGetContent) {
            currentContent = editorRuntime.scribeflowGetContent()
          } else if (artifact.filePath in filesStore.fileContents) {
            currentContent = filesStore.fileContents[artifact.filePath]
          } else {
            currentContent = await filesStore.readFile(artifact.filePath)
          }

          const citationText = artifact.type === 'citation_insert'
            ? await (async () => {
              const reference = referencesStore.getByKey(artifact.referenceId || artifact.citationKey)
              if (!reference?.id) {
                throw new Error(t('Failed to apply AI artifact.'))
              }
              return referencesStore.formatReferenceCitationAsync(reference.id, 'inline')
            })()
            : ''
          const response = artifact.type === 'citation_insert'
            ? await (async () => {
              return invoke('ai_artifact_apply_citation_insert', {
                params: {
                  content: currentContent,
                  artifact,
                  citationText,
                },
              })
            })()
            : await invoke('ai_artifact_apply_doc_patch', {
              params: {
                content: currentContent,
                artifact,
              },
            })
          const nextContent = String(response?.content || '')
          const saved = await filesStore.saveFile(artifact.filePath, nextContent)
          if (!saved) {
            throw new Error(t('Failed to save AI patch to the document.'))
          }
          if (editorRuntime?.scribeflowApplyExternalContent) {
            await editorRuntime.scribeflowApplyExternalContent(nextContent)
          }
          editorStore.clearFileDirty(artifact.filePath)
          artifact.status = 'applied'
          artifact.verificationStatus = 'pending'
          artifact.rollbackSupported = true
          artifact.appliedAt = Date.now()
          if (artifact.type === 'citation_insert') {
            const insertAt = Number(artifact.insertAt ?? artifact.to ?? -1)
            if (insertAt >= 0) {
              artifact.appliedInsertAt = insertAt
              artifact.appliedCitationText = nextContent.slice(
                insertAt,
                insertAt + Math.max(0, nextContent.length - currentContent.length)
              )
            }
          }
          const verificationResponse = await runResearchVerificationRust({
            workspacePath: currentWorkspacePath(),
            taskId: artifact.taskId,
            artifactId: artifact.id,
            artifact,
            content: nextContent,
            citationText,
            references: referencesStore.references,
            citationStyle: referencesStore.citationStyle,
            filePath: artifact.filePath,
          }).catch(() => null)
          verification = verificationResponse?.verification || null
          verificationTask = verificationResponse?.task || null
          artifact.verificationStatus = String(verification?.status || 'pending').trim() || 'pending'
          toastStore.show(
            artifact.type === 'citation_insert'
              ? t('Citation inserted into the active document.')
              : t('AI patch applied to the active document.'),
            { type: 'success' }
          )
          applied = true
        } else if (artifact.type === 'reference_patch') {
          const referenceId = String(artifact.referenceId || '').trim()
          const updates = artifact.updates && typeof artifact.updates === 'object' ? artifact.updates : null
          if (!referenceId || !updates) {
            throw new Error(t('Failed to apply AI artifact.'))
          }
          const originalReference =
            artifact.originalReference
            || referencesStore.references.find((entry) => entry.id === referenceId)
            || null
          if (originalReference) {
            artifact.originalReference = JSON.parse(JSON.stringify(originalReference))
          }
          const updated = await referencesStore.updateReference(currentWorkspacePath(), referenceId, updates)
          if (!updated) {
            throw new Error(t('Failed to apply AI artifact.'))
          }
          artifact.status = 'applied'
          artifact.verificationStatus = 'pending'
          artifact.rollbackSupported = true
          artifact.appliedAt = Date.now()
          const reference = referencesStore.references.find((entry) => entry.id === referenceId) || null
          const verificationResponse = await runResearchVerificationRust({
            workspacePath: currentWorkspacePath(),
            taskId: artifact.taskId,
            artifactId: artifact.id,
            artifact,
            reference,
            references: referencesStore.references,
            citationStyle: referencesStore.citationStyle,
            filePath: editorStore.activeTab || '',
          }).catch(() => null)
          verification = verificationResponse?.verification || null
          verificationTask = verificationResponse?.task || null
          artifact.verificationStatus = String(verification?.status || 'pending').trim() || 'pending'
          toastStore.show(t('Reference updated from AI artifact.'), { type: 'success' })
          applied = true
        } else if (
          artifact.type === 'note_draft'
          || artifact.type === 'related_work_outline'
          || artifact.type === 'reading_note_bundle'
          || artifact.type === 'claim_evidence_map'
          || artifact.type === 'compile_fix'
          || artifact.type === 'comparison_table'
        ) {
          const draftPath = filesStore.createDraftFile({
            ext: '.md',
            suggestedName: artifact.suggestedName || 'ai-note.md',
            initialContent: artifact.content,
          })
          editorStore.openFile(draftPath)
          artifact.status = 'applied'
          artifact.verificationStatus = 'pending'
          artifact.rollbackSupported = true
          artifact.appliedPath = draftPath
          artifact.appliedAt = Date.now()
          const verificationResponse = await runResearchVerificationRust({
            workspacePath: currentWorkspacePath(),
            taskId: artifact.taskId,
            artifactId: artifact.id,
            artifact,
            createdPath: draftPath,
          }).catch(() => null)
          verification = verificationResponse?.verification || null
          verificationTask = verificationResponse?.task || null
          artifact.verificationStatus = String(verification?.status || 'pending').trim() || 'pending'
          toastStore.show(
            artifact.type === 'related_work_outline'
              ? t('Related work outline opened as a draft.')
              : artifact.type === 'reading_note_bundle'
                ? t('Reading note opened as a draft.')
                : artifact.type === 'claim_evidence_map'
                  ? t('Claim evidence map opened as a draft.')
                  : artifact.type === 'compile_fix'
                    ? t('Compile fix opened as a draft.')
                    : artifact.type === 'comparison_table'
                      ? t('Comparison table opened as a draft.')
                : t('AI note opened as a draft.'),
            { type: 'success' }
          )
          applied = true
        }
        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            artifacts: [...session.artifacts],
            researchVerifications: verification
              ? [
                  verification,
                  ...(Array.isArray(session.researchVerifications)
                    ? session.researchVerifications.filter((entry) => entry.id !== verification.id)
                    : []),
                ]
              : session.researchVerifications,
            researchTask: verificationTask
              ? {
                  ...(session.researchTask || {}),
                  ...verificationTask,
                }
              : verification
                ? {
                    ...(session.researchTask || {}),
                    verificationSummary: String(verification.summary || '').trim(),
                    blockedReason: verification.blocking ? String(verification.summary || '').trim() : '',
                    phase: 'verification',
                    status: verification.blocking ? 'blocked' : String(session.researchTask?.status || 'active'),
                  }
                : session.researchTask,
          }))
        }
        return applied
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error || t('Failed to apply AI artifact.'))
        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            lastError: message,
          }))
        }
        toastStore.show(message, { type: 'error' })
        return false
      }
    },

    async dismissArtifact(artifactId = '') {
      const targetSession = findSessionByArtifactId(this.sessions, artifactId)
      const artifact = targetSession?.artifacts?.find((item) => item.id === artifactId)
      if (!artifact) return false
      const status = String(artifact.status || '').trim()
      if (status === 'applied' || status === 'dismissed' || status === 'rolled-back') return false

      artifact.status = 'dismissed'
      artifact.verificationStatus = artifact.verificationRequired === false ? 'not-required' : 'dismissed'
      artifact.dismissedAt = Date.now()

      if (targetSession) {
        await this.updateSessionById(targetSession.id, (session) => ({
          ...session,
          artifacts: [...session.artifacts],
        }))
      }
      useToastStore().show(t('Artifact dismissed.'), { type: 'success' })
      return true
    },

    async rollbackArtifact(artifactId = '') {
      const targetSession = findSessionByArtifactId(this.sessions, artifactId)
      const artifact = targetSession?.artifacts?.find((item) => item.id === artifactId)
      if (!artifact) return false
      if (artifact.rollbackSupported !== true || String(artifact.status || '').trim() !== 'applied') {
        return false
      }

      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()
      const referencesStore = useReferencesStore()

      try {
        if (artifact.type === 'doc_patch') {
          const currentContent = await filesStore.readFile(artifact.filePath)
          const replacementText = String(artifact.replacementText || '')
          const inverseArtifact = {
            from: Number(artifact.from),
            to: Number(artifact.from) + replacementText.length,
            originalText: replacementText,
            replacementText: String(artifact.originalText || ''),
          }
          const response = await invoke('ai_artifact_apply_doc_patch', {
            params: {
              content: currentContent,
              artifact: inverseArtifact,
            },
          })
          const nextContent = String(response?.content || '')
          const saved = await filesStore.saveFile(artifact.filePath, nextContent)
          if (!saved) throw new Error(t('Failed to rollback AI artifact.'))
          const editorRuntime = editorStore.getAnyEditorRuntime?.(artifact.filePath)
            || editorStore.getAnyEditorView(artifact.filePath)
          if (editorRuntime?.scribeflowApplyExternalContent) {
            await editorRuntime.scribeflowApplyExternalContent(nextContent)
          }
          editorStore.clearFileDirty(artifact.filePath)
        } else if (artifact.type === 'citation_insert') {
          const currentContent = await filesStore.readFile(artifact.filePath)
          const removeText = String(artifact.appliedCitationText || '')
          const insertAt = Number(artifact.appliedInsertAt ?? artifact.insertAt ?? -1)
          if (!removeText || insertAt < 0) {
            throw new Error(t('Failed to rollback AI artifact.'))
          }
          const inverseArtifact = {
            from: insertAt,
            to: insertAt + removeText.length,
            originalText: removeText,
            replacementText: '',
          }
          const response = await invoke('ai_artifact_apply_doc_patch', {
            params: {
              content: currentContent,
              artifact: inverseArtifact,
            },
          })
          const nextContent = String(response?.content || '')
          const saved = await filesStore.saveFile(artifact.filePath, nextContent)
          if (!saved) throw new Error(t('Failed to rollback AI artifact.'))
          const editorRuntime = editorStore.getAnyEditorRuntime?.(artifact.filePath)
            || editorStore.getAnyEditorView(artifact.filePath)
          if (editorRuntime?.scribeflowApplyExternalContent) {
            await editorRuntime.scribeflowApplyExternalContent(nextContent)
          }
          editorStore.clearFileDirty(artifact.filePath)
        } else if (artifact.type === 'reference_patch') {
          const referenceId = String(artifact.referenceId || '').trim()
          const originalReference = artifact.originalReference && typeof artifact.originalReference === 'object'
            ? artifact.originalReference
            : null
          if (!referenceId || !originalReference) {
            throw new Error(t('Failed to rollback AI artifact.'))
          }
          const restored = await referencesStore.updateReference(
            currentWorkspacePath(),
            referenceId,
            originalReference
          )
          if (!restored) throw new Error(t('Failed to rollback AI artifact.'))
        } else {
          const appliedPath = String(artifact.appliedPath || '').trim()
          if (!appliedPath || !filesStore.isDraftFile(appliedPath)) {
            throw new Error(t('Failed to rollback AI artifact.'))
          }
          editorStore.closeFileFromAllPanes(appliedPath)
          filesStore.clearDraftFile(appliedPath)
        }

        artifact.status = 'rolled-back'
        artifact.verificationStatus = 'rolled-back'
        artifact.rolledBackAt = Date.now()

        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            artifacts: [...session.artifacts],
          }))
        }

        toastStore.show(t('Artifact rolled back.'), { type: 'success' })
        return true
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error || t('Failed to rollback AI artifact.'))
        toastStore.show(message, { type: 'error' })
        return false
      }
    },
  },
})
