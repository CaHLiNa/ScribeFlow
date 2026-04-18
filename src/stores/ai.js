import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { nanoid } from './utils'
import {
  buildAiContextBundle,
  normalizeAiSelection,
} from '../domains/ai/aiContextRuntime.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import { useWorkspaceStore } from './workspace'

const CODEX_RUNTIME_EVENT = 'codex-runtime-event'
let codexRuntimeUnlisten = null

async function loadAiConfig() {
  return invoke('ai_config_load')
}

async function saveAiConfig(config = null) {
  return invoke('ai_config_save', { config: config || {} })
}

async function loadAiApiKey(providerId = 'openai') {
  return invoke('ai_provider_api_key_load', { providerId })
}

async function resolveAiProviderState(providerId = 'openai', providerConfig = {}, apiKey = '') {
  return invoke('ai_provider_state_resolve', {
    providerId,
    providerConfig,
    apiKey,
  })
}

async function listAiProviderModels(providerId = 'openai', providerConfig = {}, apiKey = '') {
  return invoke('ai_provider_models_list', {
    providerId,
    providerConfig,
    apiKey,
  })
}

async function listAiProviderDefinitions() {
  return invoke('ai_provider_catalog_list')
}

async function setCurrentAiProvider(providerId = 'openai') {
  const config = await loadAiConfig()
  const normalizedProviderId = String(providerId || '').trim().toLowerCase() || 'openai'
  const nextConfig = {
    ...(config || {}),
    currentProviderId: normalizedProviderId === 'openai-compatible' ? 'openai' : normalizedProviderId,
  }
  await saveAiConfig(nextConfig)
  return nextConfig
}

async function setCurrentAiProviderAndModel(providerId = 'openai', model = '') {
  const config = await loadAiConfig()
  const currentProviderId = String(providerId || config?.currentProviderId || 'openai').trim() || 'openai'
  const providerConfig = config?.providers?.[currentProviderId] || {}
  const normalizedModel = String(model || '').trim()
  const nextConfig = {
    ...(config || {}),
    currentProviderId,
    providers: {
      ...(config?.providers || {}),
      [currentProviderId]: {
        ...providerConfig,
        model: normalizedModel,
      },
    },
  }
  await saveAiConfig(nextConfig)
  return nextConfig
}

function buildUnifiedModelPoolKey(providerId = '', model = '') {
  return `${String(providerId || '').trim()}::${String(model || '').trim()}`
}

function parseUnifiedModelPoolKey(value = '') {
  const normalized = String(value || '').trim()
  const separatorIndex = normalized.indexOf('::')
  if (separatorIndex <= 0) {
    return { providerId: '', model: normalized }
  }
  return {
    providerId: normalized.slice(0, separatorIndex).trim(),
    model: normalized.slice(separatorIndex + 2).trim(),
  }
}

async function respondAnthropicAgentSdkPermission({
  streamId = '',
  requestId = '',
  behavior = 'deny',
  persist = false,
  message = '',
} = {}) {
  return invoke('respond_ai_anthropic_sdk_permission', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      behavior,
      persist,
      message,
    },
  })
}

async function respondAnthropicAgentSdkAskUser({ streamId = '', requestId = '', answers = {} } = {}) {
  return invoke('respond_ai_anthropic_sdk_ask_user', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      answers,
    },
  })
}

async function respondAnthropicAgentSdkExitPlan({
  streamId = '',
  requestId = '',
  action = 'deny',
  feedback = '',
} = {}) {
  return invoke('respond_ai_anthropic_sdk_exit_plan', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      action,
      feedback,
    },
  })
}

async function createClientSessionRust(params = {}) {
  return invoke('ai_client_session_create', { params })
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

async function readCodexRuntimeThread(threadId = '') {
  return invoke('runtime_thread_read', {
    params: {
      threadId,
    },
  })
}

async function resolveCodexRuntimePermission(request = {}) {
  return invoke('runtime_permission_resolve', { params: request })
}

async function resolveCodexRuntimeAskUser(request = {}) {
  return invoke('runtime_ask_user_resolve', { params: request })
}

async function resolveCodexRuntimeExitPlan(request = {}) {
  return invoke('runtime_exit_plan_resolve', { params: request })
}

async function listenCodexRuntimeEvents(onEvent = () => {}) {
  return listen(CODEX_RUNTIME_EVENT, (event) => {
    onEvent(event?.payload || {})
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
    planMode: { active: false, summary: '', note: '' },
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
  activeSkill = null,
  altalsSkills = [],
  contextBundle = {},
  sessionMode = 'chat',
  workspacePath = '',
  flatFiles = [],
} = {}) {
  return invoke('ai_agent_prepare_current_config', {
    params: {
      activeSession,
      activeSkill,
      altalsSkills,
      contextBundle,
      sessionMode,
      workspacePath,
      flatFiles,
    },
  })
}

async function runPreparedAgentSessionRust(params = {}) {
  return invoke('ai_agent_run_prepared_session', { params })
}

async function resolveAiToolCatalogRust({ enabledTools = [], runtimeIntent = 'chat' } = {}) {
  return invoke('ai_tool_catalog_resolve', {
    params: {
      enabledTools,
      runtimeIntent,
    },
  })
}

async function syncRuntimeThreadSnapshotToSessionRust(params = {}) {
  return invoke('ai_runtime_thread_snapshot_to_session', { params })
}

async function interruptRuntimeSessionRust(params = {}) {
  return invoke('ai_runtime_interrupt_session', { params })
}

async function routeRuntimeEventRust(params = {}) {
  return invoke('ai_runtime_event_route', { params })
}

async function reconcileRuntimeSessionRailRust(params = {}) {
  return invoke('ai_runtime_session_rail_reconcile', { params })
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

function resolveDefaultSessionPermissionMode({
  mode = 'agent',
  providerId = '',
  providerConfig = null,
} = {}) {
  if (String(mode || '').trim() === 'chat') {
    return 'accept-edits'
  }

  if (String(providerId || '').trim() === 'anthropic') {
    return normalizeSessionPermissionMode(providerConfig?.sdk?.approvalMode || 'per-tool')
  }

  return 'accept-edits'
}

function resolveEffectiveSessionPermissionMode({
  session = null,
  mode = '',
  providerId = '',
  providerConfig = null,
} = {}) {
  if (String(mode || session?.mode || '').trim() === 'chat') {
    return 'chat'
  }

  const fallback = resolveDefaultSessionPermissionMode({
    mode: 'agent',
    providerId,
    providerConfig,
  })

  return normalizeSessionPermissionMode(session?.permissionMode || fallback)
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
    planMode: { active: false, summary: '', note: '' },
  }
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    editorSelection: normalizeAiSelection(),
    ...createInitialAgentSessionsState({
      fallbackTitle: buildDefaultSessionTitle(1),
    }),
    altalsSkillCatalog: [],
    isRefreshingAltalsSkills: false,
    lastSkillCatalogError: '',
    providerState: {
      ready: false,
      hasKey: false,
      requiresApiKey: true,
      currentProviderId: 'openai',
      currentProviderLabel: 'OpenAI',
      enabledToolIds: [],
      baseUrl: '',
      model: '',
      approvalMode: 'per-tool',
    },
    unifiedModelPoolOptions: [],
    unifiedModelPoolLoading: false,
    unifiedModelPoolError: '',
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
        title: session.title || t('Session'),
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

    altalsSkills(state) {
      return Array.isArray(state.altalsSkillCatalog) ? state.altalsSkillCatalog : []
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
      return this.currentSession?.planMode || { active: false, summary: '', note: '' }
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
        providerId: this.providerState.currentProviderId,
        providerConfig: {
          sdk: {
            approvalMode: this.providerState.approvalMode,
          },
        },
      })
    },

    resumeState() {
      return {
        active: this.currentSession?.waitingResume === true,
        message: String(this.currentSession?.waitingResumeMessage || '').trim(),
      }
    },

    enabledToolIds(state) {
      return Array.isArray(state.providerState.enabledToolIds)
        ? state.providerState.enabledToolIds
        : []
    },
  },

  actions: {
    persistCurrentWorkspaceSessions() {
      const workspacePath = currentWorkspacePath()
      if (!workspacePath) return
      void saveSessionOverlayState({
        workspacePath,
        currentSessionId: this.currentSessionId,
        sessions: this.sessions,
      }).catch(() => {})
    },

    async restoreWorkspaceSessions(workspacePath = '') {
      const normalized = await restoreSessionOverlayState({
        workspacePath: String(workspacePath || currentWorkspacePath()).trim(),
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      this.sessions = mergeOverlaySessionState(
        this.sessions,
        Array.isArray(normalized?.sessions) ? normalized.sessions : [],
        buildDefaultSessionTitle(1)
      )
      this.currentSessionId = String(normalized?.currentSessionId || '').trim()
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
        permissionMode: resolveDefaultSessionPermissionMode({
          mode: normalizedMode,
          providerId: this.providerState.currentProviderId,
          providerConfig: {
            sdk: {
              approvalMode: this.providerState.approvalMode,
            },
          },
        }),
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
      void this.syncSessionFromCodexRuntimeThread(this.currentSessionId)
      return true
    },

    async deleteSession(sessionId = '') {
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

      try {
        if (request.runtimeManaged === true) {
          await resolveCodexRuntimeAskUser({
            requestId: request.requestId,
            answers: answers && typeof answers === 'object' ? answers : {},
          })
        } else {
          await respondAnthropicAgentSdkAskUser({
            streamId: request.streamId,
            requestId: request.requestId,
            answers: answers && typeof answers === 'object' ? answers : {},
          })
        }
        this.clearAskUserRequest(normalizedRequestId, targetSession?.id)
        return true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || t('AI execution failed.'))
        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            lastError: message,
          }))
        }
        useToastStore().show(message, { type: 'error' })
        return false
      }
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

      try {
        if (request.runtimeManaged === true) {
          await resolveCodexRuntimeExitPlan({
            requestId: request.requestId,
            action,
            feedback,
          })
        } else {
          await respondAnthropicAgentSdkExitPlan({
            streamId: request.streamId,
            requestId: request.requestId,
            action,
            feedback,
          })
        }
        this.clearExitPlanRequest(normalizedRequestId, targetSession?.id)
        return true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || t('AI execution failed.'))
        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            lastError: message,
          }))
        }
        useToastStore().show(message, { type: 'error' })
        return false
      }
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

    isToolEnabled(toolId = '') {
      return this.enabledToolIds.includes(String(toolId || '').trim())
    },

    async refreshAltalsSkills() {
      const workspace = useWorkspaceStore()
      this.isRefreshingAltalsSkills = true
      this.lastSkillCatalogError = ''

      try {
        const response = await invoke('ai_skill_catalog_load', {
          params: {
            workspacePath: workspace.path || '',
            globalConfigDir: workspace.globalConfigDir || '',
          },
        })
        const skills = Array.isArray(response?.skills) ? response.skills : []
        this.altalsSkillCatalog = skills
        return skills
      } catch (error) {
        this.lastSkillCatalogError =
          error instanceof Error
            ? error.message
            : String(error || t('Failed to load skills.'))
        return []
      } finally {
        this.isRefreshingAltalsSkills = false
      }
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

      try {
        if (request.runtimeManaged === true) {
          await resolveCodexRuntimePermission({
            requestId: request.requestId,
            behavior,
            persist,
            message: '',
          })
        } else if (persist && this.providerState.currentProviderId === 'anthropic' && request.toolName) {
          const config = await loadAiConfig()
          const anthropicConfig = config?.providers?.anthropic || {}
          await saveAiConfig({
            ...config,
            providers: {
              ...config.providers,
              anthropic: {
                ...anthropicConfig,
                sdk: {
                  ...(anthropicConfig.sdk || {}),
                  toolPolicies: {
                    ...((anthropicConfig.sdk && anthropicConfig.sdk.toolPolicies) || {}),
                    [request.toolName]: 'allow',
                  },
                },
              },
            },
          })
          await this.refreshProviderState()
        }

        if (request.runtimeManaged !== true) {
          await respondAnthropicAgentSdkPermission({
            streamId: request.streamId,
            requestId: request.requestId,
            behavior,
            persist,
          })
        }
        this.clearPermissionRequest(normalizedRequestId, targetSession?.id)
        return true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || t('AI execution failed.'))
        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            lastError: message,
          }))
        }
        useToastStore().show(message, { type: 'error' })
        return false
      }
    },

    async refreshProviderState() {
      const config = await loadAiConfig()
      const currentProviderId = String(config?.currentProviderId || 'openai').trim()
      const providerConfig = config?.providers?.[currentProviderId] || {}
      const apiKey = await loadAiApiKey(currentProviderId)
      const resolvedState = await resolveAiProviderState(currentProviderId, providerConfig, apiKey)

      this.providerState = {
        ready: resolvedState?.ready === true,
        hasKey: !!String(apiKey || '').trim(),
        requiresApiKey: resolvedState?.requiresApiKey !== false,
        currentProviderId,
        currentProviderLabel: String(resolvedState?.label || currentProviderId).trim(),
        enabledToolIds: (
          await resolveAiToolCatalogRust({
            enabledTools: config?.enabledTools,
            runtimeIntent: 'chat',
          })
        )?.effectiveToolIds || [],
        baseUrl: String(resolvedState?.baseUrl || providerConfig?.baseUrl || '').trim(),
        model: String(resolvedState?.model || providerConfig?.model || '').trim(),
        approvalMode: String(resolvedState?.approvalMode || providerConfig?.sdk?.approvalMode || 'per-tool').trim(),
      }
      return this.providerState
    },

    async setCurrentProvider(providerId = '') {
      await setCurrentAiProvider(providerId)
      return this.refreshProviderState()
    },

    async refreshUnifiedModelPool({ force = false } = {}) {
      if (this.unifiedModelPoolLoading) {
        return this.unifiedModelPoolOptions
      }
      if (!force && Array.isArray(this.unifiedModelPoolOptions) && this.unifiedModelPoolOptions.length > 0) {
        return this.unifiedModelPoolOptions
      }

      this.unifiedModelPoolLoading = true
      this.unifiedModelPoolError = ''

      try {
        const [config, catalog] = await Promise.all([loadAiConfig(), listAiProviderDefinitions()])
        const providerDefinitions = Array.isArray(catalog?.providers) ? catalog.providers : []
        const options = []

        for (const provider of providerDefinitions) {
          const providerId = String(provider?.id || '').trim()
          if (!providerId) continue

          const providerConfig = config?.providers?.[providerId] || {}
          const baseUrl = String(providerConfig?.baseUrl || provider?.defaultBaseUrl || '').trim()
          if (!baseUrl) continue

          const apiKey = await loadAiApiKey(providerId).catch(() => '')
          const response = await listAiProviderModels(providerId, providerConfig, apiKey).catch(() => null)
          const providerOptions = Array.isArray(response?.options) ? response.options : []

          for (const option of providerOptions) {
            const modelValue = String(option?.value || '').trim()
            if (!modelValue) continue
            const modelLabel = String(option?.label || modelValue).trim() || modelValue
            const providerLabel = String(provider?.label || providerId).trim() || providerId
            options.push({
              value: buildUnifiedModelPoolKey(providerId, modelValue),
              label: `${modelLabel} · ${providerLabel}`,
              triggerLabel: modelLabel,
              providerId,
              providerLabel,
              model: modelValue,
              modelLabel,
            })
          }
        }

        options.sort((left, right) => {
          const leftLabel = String(left?.modelLabel || left?.triggerLabel || '').trim()
          const rightLabel = String(right?.modelLabel || right?.triggerLabel || '').trim()
          if (leftLabel === rightLabel) {
            return String(left?.providerLabel || left?.providerId || '').localeCompare(
              String(right?.providerLabel || right?.providerId || '').trim()
            )
          }
          return leftLabel.localeCompare(rightLabel)
        })

        this.unifiedModelPoolOptions = options
        return this.unifiedModelPoolOptions
      } catch (error) {
        this.unifiedModelPoolOptions = []
        this.unifiedModelPoolError =
          error instanceof Error ? error.message : String(error || t('Failed to load models.'))
        return []
      } finally {
        this.unifiedModelPoolLoading = false
      }
    },

    async setCurrentModel(modelSelection = '') {
      const { providerId, model } = parseUnifiedModelPoolKey(modelSelection)
      const targetProviderId = providerId || this.providerState.currentProviderId || 'openai'
      await setCurrentAiProviderAndModel(targetProviderId, model)
      await this.refreshProviderState()
      return this.providerState
    },

    async ensureCodexRuntimeBridge() {
      if (typeof codexRuntimeUnlisten !== 'function') {
        const store = this
        codexRuntimeUnlisten = await listenCodexRuntimeEvents((payload = {}) => {
          void store.handleCodexRuntimeEvent(payload)
        })
      }

      await this.refreshCodexRuntimeSessions()
    },

    async refreshCodexRuntimeSessions() {
      try {
        const reconciled = await reconcileRuntimeSessionRailRust({
          sessions: this.sessions,
          currentSessionId: this.currentSessionId,
          fallbackTitle: buildDefaultSessionTitle(1),
        })
        const normalized = ensureManagedAgentSessionsState({
          sessions: mergeOverlaySessionState(
            this.sessions,
            Array.isArray(reconciled?.sessions) ? reconciled.sessions : [],
            buildDefaultSessionTitle(1)
          ),
          currentSessionId: String(reconciled?.currentSessionId || '').trim(),
          fallbackTitle: buildDefaultSessionTitle(1),
        })
        const nextState = await normalizeSessionStateRust({
          sessions: normalized.sessions,
          currentSessionId: normalized.currentSessionId,
          fallbackTitle: normalized.fallbackTitle,
        })
        this.sessions = Array.isArray(nextState?.sessions) ? nextState.sessions : []
        this.currentSessionId = String(nextState?.currentSessionId || '').trim()
        this.persistCurrentWorkspaceSessions()
        return this.sessions
      } catch {
        return []
      }
    },

    async syncSessionFromCodexRuntimeThread(sessionId = '') {
      const targetSession = resolveAgentSessionRecord(
        this.sessions,
        sessionId || this.currentSessionId
      )
      const runtimeThreadId = String(targetSession?.runtimeThreadId || '').trim()
      if (!targetSession || !runtimeThreadId) return null

      try {
        const response = await readCodexRuntimeThread(runtimeThreadId)
        const snapshot = response?.snapshot || null
        if (!snapshot?.thread) return null

        const mapped = await syncRuntimeThreadSnapshotToSessionRust({
          session: targetSession,
          snapshot,
        })
        await this.updateSessionById(targetSession.id, () => mapped.session)
        return snapshot
      } catch {
        return null
      }
    },

    async handleCodexRuntimeEvent(payload = {}) {
      const routed = await routeRuntimeEventRust({
        sessions: this.sessions,
        payload,
        pendingSessions: Object.entries(this.runtimePendingSessions || {}).map(
          ([sessionId, state]) => ({
            sessionId,
            pendingAssistantId: String(state?.pendingAssistantId || '').trim(),
            stopRequested: state?.stopRequested === true,
          })
        ),
      })
      if (routed?.handled !== true) return

      if (String(routed?.deleteSessionId || '').trim()) {
        if (this.sessions.length > 1) {
          void this.deleteSession(routed.deleteSessionId)
        }
        return
      }

      const targetSessionId = String(routed?.targetSessionId || '').trim()
      if (!targetSessionId) return

      if (routed?.session) {
        await this.updateSessionById(targetSessionId, () => routed.session)
      }

      if (routed?.stopRequested === true) {
        void this.stopCurrentRun(targetSessionId)
      }
    },

    async runActiveSkill(options = {}) {
      const toastStore = useToastStore()
      const filesStore = useFilesStore()
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
          activeSkill: null,
          altalsSkills: this.altalsSkills,
          contextBundle: this.currentContextBundle,
          sessionMode: 'agent',
          workspacePath: useWorkspaceStore().path || '',
          flatFiles: filesStore.flatFiles,
        })

        if (!preparedRun.ok) {
          const errorMessageByCode = {
            SESSION_UNAVAILABLE: t('AI execution failed.'),
            AI_SKILL_UNAVAILABLE: t('AI skill is not available.'),
            MISSING_CONTEXT: t('The selected AI skill is missing required context.'),
            PROVIDER_NOT_READY:
              preparedRun.providerState?.requiresApiKey === false
                ? t('Agent runtime is not ready. Configure the provider and model before sending.')
                : t(
                    'Agent runtime is not ready. Configure the provider, model, and API key before sending.'
                  ),
          }
          const message = errorMessageByCode[preparedRun.code] || t('AI execution failed.')
          await this.updateSessionById(sessionId, (session) => ({
            ...session,
            lastError: message,
          }))
          if (preparedRun.code !== 'SESSION_UNAVAILABLE') {
            toastStore.show(message, { type: 'warning' })
          }
          return null
        }

        const userMessageId = `message:${nanoid()}`
        pendingAssistantId = `message:${nanoid()}`
        runStarted = true

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
          title:
            Array.isArray(session.messages) && session.messages.length > 0
              ? session.title
              : summarizeSessionTitle(
                  preparedRun?.userInstruction || preparedRun?.promptDraft || session.promptDraft,
                  buildDefaultSessionTitle(this.sessions.length)
                ),
          messages: [
            ...(Array.isArray(session.messages) ? session.messages : []),
            {
              id: userMessageId,
              role: 'user',
              createdAt: Date.now(),
              content: String(preparedRun?.userInstruction || preparedRun?.promptDraft || '').trim(),
              parts: [
                {
                  type: 'text',
                  text: String(preparedRun?.userInstruction || preparedRun?.promptDraft || '').trim(),
                },
              ],
              metadata: {
                skillId: '',
                skillLabel: '',
                contextChips: [],
              },
            },
            {
              id: pendingAssistantId,
              role: 'assistant',
              createdAt: Date.now() + 1,
              content: '',
              parts: [],
              metadata: {
                skillId: String(preparedRun?.skill?.id || '').trim(),
                skillLabel: String(
                  preparedRun?.skill?.name
                    || preparedRun?.skill?.slug
                    || preparedRun?.skill?.id
                    || ''
                ).trim(),
                contextChips: [],
              },
            },
          ],
          isRunning: true,
          lastError: '',
          promptDraft: '',
          attachments: [],
        }))

        const runResponse = await runPreparedAgentSessionRust({
          session: resolveAgentSessionRecord(this.sessions, sessionId),
          preparedRun,
          altalsSkills: this.altalsSkills,
          pendingAssistantId,
          userMessageId,
          createdAt: Date.now(),
          fallbackTitle: buildDefaultSessionTitle(this.sessions.length),
          cwd: useWorkspaceStore().path || '',
        })

        await this.updateSessionById(sessionId, () => runResponse?.session)

        if (runResponse?.ok !== true) {
          if (runResponse?.stopped === true) return null
          const message = String(runResponse?.error || t('AI execution failed.'))
          toastStore.show(message, { type: 'error' })
          return null
        }

        return {
          assistantMessage: runResponse?.assistantMessage || null,
          artifact: runResponse?.artifact || null,
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

      const response = await interruptRuntimeSessionRust({
        session: targetSession,
      }).catch(() => null)
      if (response?.interrupted === true) {
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

      try {
        const capabilityToolId = String(artifact.capabilityToolId || '').trim()
        if (capabilityToolId && !this.enabledToolIds.includes(capabilityToolId)) {
          throw new Error(t('The required artifact capability is disabled.'))
        }

        let applied = false
        if (artifact.type === 'doc_patch') {
          let currentContent = ''
          const editorRuntime = editorStore.getAnyEditorRuntime?.(artifact.filePath)
            || editorStore.getAnyEditorView(artifact.filePath)
          if (editorRuntime?.altalsGetContent) {
            currentContent = editorRuntime.altalsGetContent()
          } else if (artifact.filePath in filesStore.fileContents) {
            currentContent = filesStore.fileContents[artifact.filePath]
          } else {
            currentContent = await filesStore.readFile(artifact.filePath)
          }

          const response = await invoke('ai_artifact_apply_doc_patch', {
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
          if (editorRuntime?.altalsApplyExternalContent) {
            await editorRuntime.altalsApplyExternalContent(nextContent)
          }
          editorStore.clearFileDirty(artifact.filePath)
          artifact.status = 'applied'
          toastStore.show(t('AI patch applied to the active document.'), { type: 'success' })
          applied = true
        } else if (artifact.type === 'note_draft') {
          const draftPath = filesStore.createDraftFile({
            ext: '.md',
            suggestedName: artifact.suggestedName || 'ai-note.md',
            initialContent: artifact.content,
          })
          editorStore.openFile(draftPath)
          artifact.status = 'applied'
          toastStore.show(t('AI note opened as a draft.'), { type: 'success' })
          applied = true
        }
        if (targetSession) {
          await this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            artifacts: [...session.artifacts],
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
  },
})
