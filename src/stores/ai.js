import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { nanoid } from './utils'
import {
  buildAiContextBundle,
  normalizeAiSelection,
  recommendAiSkills,
} from '../domains/ai/aiContextRuntime.js'
import {
  createAiSessionRecord,
  ensureAiSessionsState,
  normalizeAiSessionPermissionMode,
  updateAiSessionRecord,
} from '../domains/ai/aiSessionRuntime.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import {
  discoverAltalsSkills,
  isAltalsManagedFilesystemSkill,
} from '../services/ai/skillDiscovery.js'
import {
  getAiProviderConfig,
  getAiProviderDefinition,
  isAiProviderReady,
  loadAiApiKey,
  loadAiConfig,
  providerRequiresAiApiKey,
  saveAiConfig,
  setCurrentAiProvider,
} from '../services/ai/settings.js'
import { applyAiArtifactCapability } from '../services/ai/artifactCapabilities.js'
import { createAiAttachmentRecord } from '../services/ai/attachmentStore.js'
import {
  respondAnthropicAgentSdkAskUser,
  respondAnthropicAgentSdkExitPlan,
  respondAnthropicAgentSdkPermission,
} from '../services/ai/runtime/anthropicSdkBridge.js'
import {
  archiveCodexRuntimeThread,
  interruptCodexRuntimeTurn,
  listenCodexRuntimeEvents,
  listCodexRuntimeThreads,
  readCodexRuntimeThread,
  renameCodexRuntimeThread,
  resolveCodexRuntimeAskUser,
  resolveCodexRuntimeExitPlan,
  resolveCodexRuntimePermission,
  runCodexRuntimeTurn,
  startCodexRuntimeThread,
} from '../services/ai/runtime/codexRuntimeBridge.js'
import { useWorkspaceStore } from './workspace'

let codexRuntimeUnlisten = null
const pendingCodexRuntimeThreads = new Map()
const pendingCodexRuntimeThreadCreations = new Map()
const DEFAULT_AGENT_ACTION_ID = 'workspace-agent'

function buildDefaultSessionTitle(count = 1) {
  return t('Run {count}', { count })
}

function createInitialAgentSessionsState({ fallbackTitle = 'New session' } = {}) {
  const initialSession = createAiSessionRecord({
    title: String(fallbackTitle || 'New session').trim() || 'New session',
  })

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
  return ensureAiSessionsState({
    sessions,
    currentSessionId,
    fallbackTitle,
  })
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

async function createSessionOverlayState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  title = '',
  activate = true,
  mode = 'agent',
  permissionMode = 'accept-edits',
  fallbackTitle = 'New session',
} = {}) {
  return invoke('ai_session_overlay_create', {
    params: {
      workspacePath,
      currentSessionId,
      sessions,
      title,
      activate,
      mode,
      permissionMode,
      fallbackTitle,
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

async function deleteSessionOverlayState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  sessionId = '',
  fallbackTitle = 'New session',
} = {}) {
  return invoke('ai_session_overlay_delete', {
    params: {
      workspacePath,
      currentSessionId,
      sessions,
      sessionId,
      fallbackTitle,
    },
  })
}

async function renameSessionOverlayState({
  workspacePath = '',
  currentSessionId = '',
  sessions = [],
  sessionId = '',
  title = '',
  fallbackTitle = 'New session',
} = {}) {
  return invoke('ai_session_overlay_rename', {
    params: {
      workspacePath,
      currentSessionId,
      sessions,
      sessionId,
      title,
      fallbackTitle,
    },
  })
}

async function prepareAgentRunRust({
  activeSession = null,
  activeSkill = null,
  builtInActions = [],
  altalsSkills = [],
  contextBundle = {},
  sessionMode = 'chat',
  providerState = {},
  providerId = '',
  providerConfig = {},
  apiKey = '',
  workspacePath = '',
  flatFiles = [],
} = {}) {
  return invoke('ai_agent_prepare', {
    params: {
      activeSession,
      activeSkill,
      builtInActions,
      altalsSkills,
      contextBundle,
      sessionMode,
      providerState,
      providerId,
      providerConfig,
      apiKey,
      workspacePath,
      flatFiles,
    },
  })
}

async function startAgentRunSessionRust(params = {}) {
  return invoke('ai_agent_session_start', { params })
}

async function applyAgentRunSessionEventRust(params = {}) {
  return invoke('ai_agent_session_apply_event', { params })
}

async function completeAgentRunSessionRust(params = {}) {
  return invoke('ai_agent_session_complete', { params })
}

async function failAgentRunSessionRust(params = {}) {
  return invoke('ai_agent_session_fail', { params })
}

async function finalizeAgentRunSessionRust(params = {}) {
  return invoke('ai_agent_session_finalize', { params })
}

async function mergeAgentRunToolEventStateRust(events = [], event = {}) {
  const response = await invoke('ai_agent_tool_events_merge', {
    params: {
      events,
      event,
    },
  })
  return Array.isArray(response?.events) ? response.events : []
}

async function resolveAiToolCatalogRust({ enabledTools = [], runtimeIntent = 'chat' } = {}) {
  return invoke('ai_tool_catalog_resolve', {
    params: {
      enabledTools,
      runtimeIntent,
    },
  })
}

async function listAiActionCatalogRust() {
  return invoke('ai_action_catalog_list')
}

async function syncRuntimeThreadSnapshotToSessionRust(params = {}) {
  return invoke('ai_runtime_thread_snapshot_to_session', { params })
}

async function reconcileRuntimeSessionRailRust(params = {}) {
  return invoke('ai_runtime_session_rail_reconcile', { params })
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

function findSessionByRuntimeThreadId(sessions = [], runtimeThreadId = '') {
  const normalizedThreadId = String(runtimeThreadId || '').trim()
  if (!normalizedThreadId) return null

  return (
    (Array.isArray(sessions) ? sessions : []).find(
      (session) => String(session?.runtimeThreadId || '').trim() === normalizedThreadId
    ) || null
  )
}

function shouldUseCodexRuntimeRun(preparedRun = null) {
  if (!preparedRun?.ok) return false
  if (String(preparedRun?.skill?.id || '').trim() !== DEFAULT_AGENT_ACTION_ID) return false

  if (
    String(preparedRun.providerId || '').trim() === 'anthropic' &&
    String(preparedRun?.config?.sdk?.runtimeMode || 'http').trim() === 'sdk'
  ) {
    return false
  }

  return true
}

function currentWorkspacePath() {
  return String(useWorkspaceStore().path || '').trim()
}

function buildArtifactRecord(skillId = '', artifact = null) {
  if (!artifact) return null
  return {
    id: `artifact:${nanoid()}`,
    skillId,
    status: 'pending',
    createdAt: Date.now(),
    ...artifact,
  }
}

function normalizeBackgroundTaskStatus(status = 'running') {
  const normalized = String(status || 'running')
    .trim()
    .toLowerCase()
  if (['failed', 'error'].includes(normalized)) return 'error'
  if (['done', 'completed', 'stopped'].includes(normalized)) return 'done'
  return 'running'
}

function findBackgroundTaskIndex(tasks = [], task = {}) {
  const normalizedId = String(task.id || '').trim()
  const normalizedTaskId = String(task.taskId || '').trim()
  const normalizedToolUseId = String(task.toolUseId || task.toolId || '').trim()

  return (Array.isArray(tasks) ? tasks : []).findIndex((entry) => {
    if (normalizedTaskId && String(entry.taskId || '').trim() === normalizedTaskId) return true
    if (normalizedToolUseId && String(entry.toolUseId || '').trim() === normalizedToolUseId)
      return true
    if (normalizedId && String(entry.id || '').trim() === normalizedId) return true
    return false
  })
}

function buildBackgroundTaskRecord(task = {}, previous = null) {
  const taskId = String(task.taskId || previous?.taskId || '').trim()
  const toolUseId = String(
    task.toolUseId || task.toolId || previous?.toolUseId || task.id || ''
  ).trim()
  const recordId = taskId ? `task:${taskId}` : toolUseId ? `tool:${toolUseId}` : ''
  const detail = String(
    task.detail || task.description || task.summary || previous?.detail || ''
  ).trim()
  const elapsedSeconds = Number(task.elapsedSeconds)
  const usage =
    task.usage && typeof task.usage === 'object'
      ? task.usage
      : previous?.usage && typeof previous.usage === 'object'
        ? previous.usage
        : null

  return {
    id: recordId,
    taskId,
    toolUseId,
    label: String(
      task.label ||
        task.title ||
        previous?.label ||
        task.lastToolName ||
        task.taskType ||
        toolUseId ||
        taskId ||
        t('Background task')
    ).trim(),
    status: normalizeBackgroundTaskStatus(task.status || previous?.status || 'running'),
    detail,
    taskType: String(task.taskType || previous?.taskType || '').trim(),
    lastToolName: String(task.lastToolName || previous?.lastToolName || '').trim(),
    outputFile: String(task.outputFile || previous?.outputFile || '').trim(),
    elapsedSeconds: Number.isFinite(elapsedSeconds)
      ? Math.max(0, Math.round(elapsedSeconds))
      : Number(previous?.elapsedSeconds || 0) || 0,
    usage,
    updatedAt: Date.now(),
  }
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
    return normalizeAiSessionPermissionMode(providerConfig?.sdk?.approvalMode || 'per-tool')
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

  return normalizeAiSessionPermissionMode(session?.permissionMode || fallback)
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
    builtInActionCatalog: [],
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
    runtimeAbortControllers: {},
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

    builtInActions() {
      return recommendAiSkills(this.currentContextBundle, this.builtInActionCatalog)
    },

    altalsSkills(state) {
      return state.altalsSkillCatalog.filter((skill) => isAltalsManagedFilesystemSkill(skill))
    },

    activeSkill(state) {
      return this.builtInActions[0] || state.builtInActionCatalog[0] || null
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
      this.sessions = Array.isArray(normalized?.sessions) ? normalized.sessions : []
      this.currentSessionId = String(normalized?.currentSessionId || '').trim()
    },

    resetTransientRuntimeState() {
      const normalized = ensureManagedAgentSessionsState({
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(
          Array.isArray(this.sessions) && this.sessions.length > 0 ? this.sessions.length : 1
        ),
      })

      this.sessions = normalized.sessions.map(scrubTransientAgentSessionState)
      this.currentSessionId = normalized.currentSessionId
      this.persistCurrentWorkspaceSessions()
    },

    ensureSessionState() {
      const normalized = ensureManagedAgentSessionsState({
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(
          Array.isArray(this.sessions) && this.sessions.length > 0 ? this.sessions.length : 1
        ),
      })

      this.sessions = normalized.sessions
      this.currentSessionId = normalized.currentSessionId
      this.persistCurrentWorkspaceSessions()
      return normalized
    },

    updateSessionById(sessionId = '', updater = (session) => session) {
      const normalized = this.ensureSessionState()
      const targetSessionId = String(sessionId || normalized.currentSessionId || '').trim()
      if (!targetSessionId) return null

      this.sessions = updateAiSessionRecord(normalized.sessions, targetSessionId, updater)
      this.persistCurrentWorkspaceSessions()
      return resolveAgentSessionRecord(this.sessions, targetSessionId)
    },

    async ensureCodexRuntimeThreadForSession(sessionId = '', preferredTitle = '') {
      const targetSession = resolveAgentSessionRecord(
        this.sessions,
        sessionId || this.currentSessionId
      )
      if (!targetSession) return ''

      const existingThreadId = String(targetSession.runtimeThreadId || '').trim()
      if (existingThreadId) return existingThreadId

      const normalizedSessionId = String(targetSession.id || '').trim()
      if (!normalizedSessionId) return ''

      if (pendingCodexRuntimeThreadCreations.has(normalizedSessionId)) {
        return pendingCodexRuntimeThreadCreations.get(normalizedSessionId)
      }

      const creationPromise = (async () => {
        await this.ensureCodexRuntimeBridge()

        const latestSession = resolveAgentSessionRecord(this.sessions, normalizedSessionId)
        const latestThreadId = String(latestSession?.runtimeThreadId || '').trim()
        if (latestThreadId) return latestThreadId

        const threadResponse = await startCodexRuntimeThread({
          title:
            String(preferredTitle || latestSession?.title || '').trim() ||
            buildDefaultSessionTitle(this.sessions.length),
          cwd: useWorkspaceStore().path || '',
        })
        const runtimeThreadId = String(threadResponse?.thread?.id || '').trim()
        if (!runtimeThreadId) return ''

        this.updateSessionById(normalizedSessionId, (session) => ({
          ...session,
          title: String(threadResponse?.thread?.title || '').trim() || session.title,
          runtimeThreadId,
          runtimeTurnId: String(threadResponse?.thread?.activeTurnId || '').trim(),
          runtimeTransport: 'codex-runtime',
          isRunning: String(threadResponse?.thread?.status || '').trim() === 'running',
        }))
        return runtimeThreadId
      })()

      pendingCodexRuntimeThreadCreations.set(normalizedSessionId, creationPromise)
      try {
        return await creationPromise
      } finally {
        pendingCodexRuntimeThreadCreations.delete(normalizedSessionId)
      }
    },

    async createSession({ title = '', activate = true } = {}) {
      const normalizedMode = 'agent'
      const nextState = await createSessionOverlayState({
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
      })

      this.sessions = Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : []
      this.currentSessionId = String(nextState?.state?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      void this.ensureCodexRuntimeThreadForSession(
        nextState?.session?.id,
        nextState?.session?.title || title
      )
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
      this.sessions = Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : []
      this.currentSessionId = String(nextState?.state?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      void this.syncSessionFromCodexRuntimeThread(this.currentSessionId)
      return true
    },

    async deleteSession(sessionId = '') {
      const targetSession = resolveAgentSessionRecord(this.sessions, sessionId || this.currentSessionId)
      const runtimeThreadId = String(targetSession?.runtimeThreadId || '').trim()
      if (runtimeThreadId) {
        void archiveCodexRuntimeThread(runtimeThreadId).catch(() => {})
      }

      const nextState = await deleteSessionOverlayState({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (nextState?.success !== true) return false

      this.sessions = Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : []
      this.currentSessionId = String(nextState?.state?.currentSessionId || '').trim()
      this.persistCurrentWorkspaceSessions()
      return true
    },

    async renameSession(sessionId = '', title = '') {
      const nextState = await renameSessionOverlayState({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId: sessionId || this.currentSessionId,
        title,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (nextState?.success !== true) return false

      this.sessions = Array.isArray(nextState?.state?.sessions) ? nextState.state.sessions : []
      this.persistCurrentWorkspaceSessions()
      if (!nextState?.session) return false

      try {
        const runtimeThreadId = await this.ensureCodexRuntimeThreadForSession(
          nextState.session.id,
          nextState.session.title
        )
        if (runtimeThreadId) {
          await renameCodexRuntimeThread({
            threadId: runtimeThreadId,
            title: nextState.session.title,
          })
          await this.syncSessionFromCodexRuntimeThread(nextState.session.id)
        }
      } catch {
        // Keep the optimistic local title and let a later runtime sync reconcile if needed.
      }

      return true
    },

    setSessionMode(_mode = 'agent', sessionId = '') {
      const updated = this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        mode: 'agent',
      }))
      return updated || null
    },

    setSessionPermissionMode(mode = 'accept-edits', sessionId = '') {
      const normalizedMode = normalizeAiSessionPermissionMode(mode)
      const updated = this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
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
      this.updateSessionById(this.currentSessionId, (session) => ({
        ...session,
        promptDraft: String(value || ''),
      }))
    },

    clearSession(sessionId = '') {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        promptDraft: '',
        queuedPromptDraft: '',
        messages: [],
        artifacts: [],
        attachments: [],
        queuedAttachments: [],
        lastError: '',
        isRunning: false,
        permissionRequests: [],
        askUserRequests: [],
        exitPlanRequests: [],
        backgroundTasks: [],
        isCompacting: false,
        lastCompactAt: 0,
        waitingResume: false,
        waitingResumeMessage: '',
        planMode: { active: false, summary: '', note: '' },
      }))
    },

    async addAttachmentFromPath(path = '', options = {}) {
      const attachment = await createAiAttachmentRecord(path, {
        workspacePath: useWorkspaceStore().path || '',
        ...options,
      })
      if (!attachment) return null

      this.updateSessionById(this.currentSessionId, (session) => ({
        ...session,
        attachments: [
          ...session.attachments.filter((entry) => entry.path !== attachment.path),
          attachment,
        ],
      }))
      return attachment
    },

    removeAttachment(attachmentId = '') {
      const normalizedAttachmentId = String(attachmentId || '').trim()
      if (!normalizedAttachmentId) return

      this.updateSessionById(this.currentSessionId, (session) => ({
        ...session,
        attachments: session.attachments.filter(
          (attachment) => attachment.id !== normalizedAttachmentId
        ),
      }))
    },

    clearAttachments(sessionId = '') {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        attachments: [],
      }))
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

      this.updateSessionById(targetSession.id, (session) => ({
        ...session,
        promptDraft: '',
        attachments: [],
        queuedPromptDraft: [queuedPromptDraft, promptDraft].filter((value) => String(value).trim()).join('\n\n'),
        queuedAttachments: [
          ...(Array.isArray(session.queuedAttachments) ? session.queuedAttachments : []),
          ...attachments.filter(
            (attachment) =>
              !(Array.isArray(session.queuedAttachments) ? session.queuedAttachments : []).some(
                (queued) => queued.id === attachment.id
              )
          ),
        ],
      }))
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

      this.updateSessionById(targetSession.id, (session) => ({
        ...session,
        promptDraft: queuedPromptDraft,
        attachments: queuedAttachments,
        queuedPromptDraft: '',
        queuedAttachments: [],
      }))
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

      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        askUserRequests: [
          ...(session.askUserRequests || []).filter((request) => request.requestId !== requestId),
          nextRequest,
        ],
      }))
    },

    clearAskUserRequest(requestId = '', sessionId = '') {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return

      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        askUserRequests: (session.askUserRequests || []).filter(
          (request) => request.requestId !== normalizedRequestId
        ),
      }))
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
          this.updateSessionById(targetSession.id, (session) => ({
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

      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        exitPlanRequests: [
          ...(session.exitPlanRequests || []).filter((request) => request.requestId !== requestId),
          nextRequest,
        ],
      }))
    },

    clearExitPlanRequest(requestId = '', sessionId = '') {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return

      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        exitPlanRequests: (session.exitPlanRequests || []).filter(
          (request) => request.requestId !== normalizedRequestId
        ),
      }))
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
          this.updateSessionById(targetSession.id, (session) => ({
            ...session,
            lastError: message,
          }))
        }
        useToastStore().show(message, { type: 'error' })
        return false
      }
    },

    setPlanModeState(sessionId = '', planMode = {}) {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        planMode: {
          active: planMode.active === true,
          summary: String(planMode.summary || '').trim(),
          note: String(planMode.note || '').trim(),
        },
      }))
    },

    setWaitingResumeState(sessionId = '', { active = false, message = '' } = {}) {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        waitingResume: active === true,
        waitingResumeMessage: active === true ? String(message || '').trim() : '',
      }))
    },

    setCompactionState(sessionId = '', { active = false } = {}) {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        isCompacting: active === true,
        lastCompactAt: active === true ? Number(session.lastCompactAt || 0) || 0 : Date.now(),
      }))
    },

    upsertBackgroundTask(task = {}, sessionId = '') {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        backgroundTasks: (() => {
          const entries = Array.isArray(session.backgroundTasks) ? [...session.backgroundTasks] : []
          const existingIndex = findBackgroundTaskIndex(entries, task)
          const previous = existingIndex >= 0 ? entries[existingIndex] : null
          const nextTask = buildBackgroundTaskRecord(task, previous)

          if (!String(nextTask.id || '').trim()) return entries

          if (existingIndex >= 0) {
            entries.splice(existingIndex, 1, nextTask)
          } else {
            entries.push(nextTask)
          }

          return entries
            .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
            .slice(0, 12)
        })(),
      }))
    },

    clearBackgroundTask(taskId = '', sessionId = '') {
      const normalizedTaskId = String(taskId || '').trim()
      if (!normalizedTaskId) return

      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        backgroundTasks: (session.backgroundTasks || []).filter(
          (task) => task.id !== normalizedTaskId
        ),
      }))
    },

    isToolEnabled(toolId = '') {
      return this.enabledToolIds.includes(String(toolId || '').trim())
    },

    async refreshAltalsSkills() {
      const workspace = useWorkspaceStore()
      this.isRefreshingAltalsSkills = true
      this.lastSkillCatalogError = ''

      try {
        const skills = await discoverAltalsSkills({
          workspacePath: workspace.path || '',
          globalConfigDir: workspace.globalConfigDir || '',
        })
        this.altalsSkillCatalog = skills
        return skills
      } catch (error) {
        this.lastSkillCatalogError =
          error instanceof Error
            ? error.message
            : String(error || t('Failed to load Altals skills.'))
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

      this.updateSessionById(sessionId || this.currentSessionId, (session) => {
        const remaining = (
          Array.isArray(session.permissionRequests) ? session.permissionRequests : []
        ).filter((request) => request.requestId !== requestId)

        return {
          ...session,
          permissionRequests: [...remaining, nextRequest],
        }
      })
    },

    clearPermissionRequest(requestId = '', sessionId = '') {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return

      const targetSession = sessionId
        ? resolveAgentSessionRecord(this.sessions, sessionId)
        : findSessionByPermissionRequestId(this.sessions, normalizedRequestId)

      if (!targetSession) return

      this.updateSessionById(targetSession.id, (session) => ({
        ...session,
        permissionRequests: (Array.isArray(session.permissionRequests)
          ? session.permissionRequests
          : []
        ).filter((request) => request.requestId !== normalizedRequestId),
      }))
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
          const anthropicConfig = getAiProviderConfig(config, 'anthropic')
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
          this.updateSessionById(targetSession.id, (session) => ({
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
      const providerConfig = getAiProviderConfig(config, currentProviderId)
      const providerDefinition = getAiProviderDefinition(currentProviderId)
      const apiKey = await loadAiApiKey(currentProviderId)
      const requiresApiKey = providerRequiresAiApiKey(currentProviderId, providerConfig)

      this.providerState = {
        ready: isAiProviderReady(currentProviderId, providerConfig, apiKey),
        hasKey: !!String(apiKey || '').trim(),
        requiresApiKey,
        currentProviderId,
        currentProviderLabel: providerDefinition?.label || currentProviderId,
        enabledToolIds: (
          await resolveAiToolCatalogRust({
            enabledTools: config?.enabledTools,
            runtimeIntent: 'chat',
          })
        )?.effectiveToolIds || [],
        baseUrl: String(providerConfig?.baseUrl || '').trim(),
        model: String(providerConfig?.model || '').trim(),
        approvalMode: String(providerConfig?.sdk?.approvalMode || 'per-tool').trim(),
      }
      return this.providerState
    },

    async refreshBuiltInActions() {
      try {
        const response = await listAiActionCatalogRust()
        this.builtInActionCatalog = Array.isArray(response?.builtInActions)
          ? response.builtInActions
          : []
      } catch {
        this.builtInActionCatalog = []
      }
      return this.builtInActionCatalog
    },

    async setCurrentProvider(providerId = '') {
      await setCurrentAiProvider(providerId)
      return this.refreshProviderState()
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
          sessions: Array.isArray(reconciled?.sessions) ? reconciled.sessions : [],
          currentSessionId: String(reconciled?.currentSessionId || '').trim(),
          fallbackTitle: buildDefaultSessionTitle(1),
        })
        this.sessions = normalized.sessions
        this.currentSessionId = normalized.currentSessionId
        this.persistCurrentWorkspaceSessions()
        return normalized.sessions
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
        this.updateSessionById(targetSession.id, () => mapped.session)
        return snapshot
      } catch {
        return null
      }
    },

    async applyAgentRunEventToSession(sessionId = '', event = {}, pendingAssistantId = '') {
      const targetSession = resolveAgentSessionRecord(this.sessions, sessionId)
      if (!targetSession) return null
      const response = await applyAgentRunSessionEventRust({
        session: targetSession,
        event,
        pendingAssistantId,
      })
      this.updateSessionById(targetSession.id, () => response.session)
      return response.session
    },

    async handleCodexRuntimeEvent(payload = {}) {
      const threadId = String(payload?.thread?.id || payload?.item?.threadId || '').trim()
      const turnId = String(payload?.turn?.id || payload?.item?.turnId || '').trim()
      if (payload.eventType === 'threadArchived' && threadId) {
        const archivedSession = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (archivedSession && this.sessions.length > 1) {
          void this.deleteSession(archivedSession.id)
        }
        return
      }

      if (payload.eventType === 'threadRenamed' && threadId) {
        const renamedSession = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!renamedSession) return
        void this.syncSessionFromCodexRuntimeThread(renamedSession.id)
        return
      }

      if (payload.eventType === 'permissionRequest' && payload.permissionRequest) {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        void this.syncSessionFromCodexRuntimeThread(session.id)
        return
      }

      if (payload.eventType === 'askUserRequest' && payload.askUserRequest) {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        void this.syncSessionFromCodexRuntimeThread(session.id)
        return
      }

      if (payload.eventType === 'exitPlanRequest' && payload.exitPlanRequest) {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        void this.syncSessionFromCodexRuntimeThread(session.id)
        return
      }

      if (payload.eventType === 'planModeStart' || payload.eventType === 'planModeEnd') {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        void this.syncSessionFromCodexRuntimeThread(session.id)
        return
      }

      const session =
        findSessionByRuntimeThreadId(this.sessions, threadId) ||
        resolveAgentSessionRecord(
          this.sessions,
          pendingCodexRuntimeThreads.get(threadId)?.sessionId || ''
        )
      if (!session) return

      if (payload.eventType === 'turnStarted' && threadId && turnId) {
        const pending = pendingCodexRuntimeThreads.get(threadId)
        this.updateSessionById(session.id, (currentSession) => ({
          ...currentSession,
          runtimeThreadId: threadId,
          runtimeTurnId: turnId,
          runtimeTransport: 'codex-runtime',
        }))
        return
      }

      const pending = pendingCodexRuntimeThreads.get(threadId) || null
      const pendingAssistantId = String(pending?.pendingAssistantId || '').trim()

      if (payload.eventType === 'itemDelta' && pendingAssistantId) {
        if (payload?.item?.kind === 'agentMessage') {
          await this.applyAgentRunEventToSession(
            session.id,
            {
              eventType: 'assistant-content',
              text: String(payload.item.text || ''),
              transport: 'codex-runtime',
            },
            pendingAssistantId
          )
          return
        }

        if (payload?.item?.kind === 'reasoning') {
          await this.applyAgentRunEventToSession(
            session.id,
            {
              eventType: 'assistant-reasoning',
              text: String(payload.item.text || ''),
              transport: 'codex-runtime',
            },
            pendingAssistantId
          )
        }
        return
      }

      if (payload.eventType === 'turnCompleted' && threadId) {
        pendingCodexRuntimeThreads.delete(threadId)
        void this.syncSessionFromCodexRuntimeThread(session.id)
        return
      }

      if ((payload.eventType === 'turnFailed' || payload.eventType === 'turnInterrupted') && threadId) {
        pendingCodexRuntimeThreads.delete(threadId)
        void this.syncSessionFromCodexRuntimeThread(session.id)
      }
    },

    async runActiveSkill(options = {}) {
      const toastStore = useToastStore()
      const filesStore = useFilesStore()
      if (!Array.isArray(this.builtInActionCatalog) || this.builtInActionCatalog.length === 0) {
        await this.refreshBuiltInActions()
      }
      const requestedSessionId = String(options?.sessionId || this.currentSessionId || '').trim()
      const activeSession =
        resolveAgentSessionRecord(this.sessions, requestedSessionId) ||
        (await this.createSession())
      const sessionId = activeSession.id
      let preparedRun = null
      let skill = null
      let providerState = null
      let contextBundle = this.currentContextBundle
      let pendingAssistantId = ''
      let liveToolEvents = []
      let runStarted = false
      const abortController = new AbortController()
      this.runtimeAbortControllers = {
        ...this.runtimeAbortControllers,
        [sessionId]: abortController,
      }

      try {
        providerState = await this.refreshProviderState()
        const fullConfig = await loadAiConfig()
        const currentProviderId = String(fullConfig?.currentProviderId || 'openai').trim()
        const providerConfig = getAiProviderConfig(fullConfig, currentProviderId)
        const apiKey = await loadAiApiKey(currentProviderId)

        preparedRun = await prepareAgentRunRust({
          activeSession,
          activeSkill: this.builtInActions[0] || this.activeSkill,
          builtInActions: this.builtInActions,
          altalsSkills: this.altalsSkills,
          contextBundle: this.currentContextBundle,
          sessionMode: 'agent',
          providerState,
          providerId: currentProviderId,
          providerConfig,
          apiKey,
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
          this.updateSessionById(sessionId, (session) => ({
            ...session,
            lastError: message,
          }))
          if (preparedRun.code !== 'SESSION_UNAVAILABLE') {
            toastStore.show(message, { type: 'warning' })
          }
          return null
        }

        ;({
          skill,
          providerState,
          contextBundle,
        } = preparedRun)
        const { userInstruction, effectivePermissionMode, promptDraft } = preparedRun
        const userMessageId = `message:${nanoid()}`
        pendingAssistantId = `message:${nanoid()}`
        const createdAt = Date.now()

        const startedSession = await startAgentRunSessionRust({
          session: resolveAgentSessionRecord(this.sessions, sessionId),
          skill,
          providerState,
          contextBundle,
          userInstruction,
          promptDraft,
          effectivePermissionMode,
          userMessageId,
          pendingAssistantId,
          createdAt,
          fallbackTitle: buildDefaultSessionTitle(this.sessions.length),
        })
        this.updateSessionById(sessionId, () => startedSession.session)
        runStarted = true
        const result = shouldUseCodexRuntimeRun(preparedRun)
          ? await (async () => {
              const runtimeThreadId = await this.ensureCodexRuntimeThreadForSession(
                sessionId,
                activeSession.title || buildDefaultSessionTitle(this.sessions.length)
              )
              this.updateSessionById(sessionId, (session) => ({
                ...session,
                runtimeThreadId,
                runtimeProviderId: preparedRun.providerId,
                runtimeTransport: 'codex-runtime',
              }))

              const promptResponse = await invoke('ai_agent_build_prompt', {
                params: {
                  skill,
                  contextBundle,
                  userInstruction: preparedRun.userInstruction,
                  conversation: preparedRun.priorConversation,
                  altalsSkills: this.altalsSkills,
                  supportFiles: [],
                  attachments: preparedRun.attachments || [],
                  referencedFiles: preparedRun.referencedFiles || [],
                  requestedTools: preparedRun.requestedTools || [],
                  enabledToolIds:
                    (
                      await resolveAiToolCatalogRust({
                        enabledTools: preparedRun.config?.enabledTools,
                        runtimeIntent: preparedRun.runtimeIntent,
                      })
                    )?.effectiveToolIds || [],
                  runtimeIntent: preparedRun.runtimeIntent,
                },
              })
              const systemPrompt = String(promptResponse?.systemPrompt || '')
              const userPrompt = String(promptResponse?.userPrompt || '')

              pendingCodexRuntimeThreads.set(runtimeThreadId, {
                sessionId,
                pendingAssistantId,
              })

              const runtimeResult = await invoke('ai_runtime_turn_run_wait', {
                params: {
                  threadId: runtimeThreadId,
                  userText: userPrompt,
                  provider: {
                    providerId: preparedRun.providerId,
                    baseUrl: preparedRun.config?.baseUrl || '',
                    apiKey: preparedRun.apiKey || '',
                    model: preparedRun.config?.model || '',
                    systemPrompt,
                    temperature: preparedRun.config?.temperature,
                  },
                  workspacePath: useWorkspaceStore().path || '',
                  enabledToolIds:
                    (
                      await resolveAiToolCatalogRust({
                        enabledTools: preparedRun.config?.enabledTools,
                        runtimeIntent: preparedRun.runtimeIntent,
                      })
                    )?.effectiveToolIds || [],
                },
              })

              this.updateSessionById(sessionId, (session) => ({
                ...session,
                runtimeThreadId,
                runtimeTurnId: String(runtimeResult?.turnId || '').trim(),
                runtimeProviderId: preparedRun.providerId,
                runtimeTransport: 'codex-runtime',
              }))

              pendingCodexRuntimeThreads.delete(runtimeThreadId)

              return {
                content: String(runtimeResult?.content || ''),
                reasoning: String(runtimeResult?.reasoning || ''),
                payload: null,
                transport: String(runtimeResult?.transport || 'codex-runtime'),
                events: [],
              }
            })()
          : await invoke('ai_agent_run', {
              params: {
                skill: preparedRun.skill,
                contextBundle: preparedRun.contextBundle,
                config: {
                  ...preparedRun.config,
                  providerId: preparedRun.providerId,
                  enabledTools:
                    (
                      await resolveAiToolCatalogRust({
                        enabledTools: preparedRun.config?.enabledTools,
                        runtimeIntent: preparedRun.runtimeIntent,
                      })
                    )?.effectiveToolIds || [],
                },
                apiKey: preparedRun.apiKey || '',
                userInstruction: preparedRun.userInstruction,
                conversation: preparedRun.priorConversation,
                altalsSkills: this.altalsSkills,
                attachments: preparedRun.attachments || [],
                referencedFiles: preparedRun.referencedFiles || [],
                requestedTools: preparedRun.requestedTools || [],
                runtimeIntent: preparedRun.runtimeIntent || 'chat',
              },
            })

        for (const event of Array.isArray(result?.events) ? result.events : []) {
          liveToolEvents = await mergeAgentRunToolEventStateRust(liveToolEvents, event)
          await this.applyAgentRunEventToSession(sessionId, event, pendingAssistantId)
        }

        const artifact = buildArtifactRecord(skill.id, result?.artifact || null)
        let assistantMessage = null
        const completedSession = await completeAgentRunSessionRust({
          session: resolveAgentSessionRecord(this.sessions, sessionId),
          pendingAssistantId,
          skill,
          result,
          artifact,
          providerState,
          contextBundle,
          createdAt: Date.now(),
        })
        assistantMessage = completedSession.assistantMessage
        this.updateSessionById(sessionId, () => completedSession.session)
        return { assistantMessage, artifact }
      } catch (error) {
        const wasAborted =
          error instanceof DOMException
            ? error.name === 'AbortError'
            : String(error?.name || '').trim() === 'AbortError'
        const message =
          wasAborted
            ? t('AI execution stopped.')
            : error instanceof Error
              ? error.message
              : String(error || t('AI execution failed.'))
        if (runStarted && pendingAssistantId) {
          const failedSession = await failAgentRunSessionRust({
            session: resolveAgentSessionRecord(this.sessions, sessionId),
            pendingAssistantId,
            skill,
            error: message,
            providerState,
            contextBundle,
            events: liveToolEvents,
            createdAt: Date.now(),
          })
          this.updateSessionById(sessionId, () => failedSession.session)
        } else {
          this.updateSessionById(sessionId, (session) => ({
            ...session,
            lastError: message,
          }))
        }
        if (!wasAborted) {
          toastStore.show(message, { type: 'error' })
        }
        return null
      } finally {
        if (this.runtimeAbortControllers[sessionId]) {
          const nextAbortControllers = { ...this.runtimeAbortControllers }
          delete nextAbortControllers[sessionId]
          this.runtimeAbortControllers = nextAbortControllers
        }
        if (runStarted) {
          const finalizedSession = await finalizeAgentRunSessionRust({
            session: resolveAgentSessionRecord(this.sessions, sessionId),
          })
          this.updateSessionById(sessionId, () => finalizedSession.session)
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

    stopCurrentRun(sessionId = '') {
      const targetSessionId = String(sessionId || this.currentSessionId || '').trim()
      if (!targetSessionId) return false
      const controller = this.runtimeAbortControllers[targetSessionId]
      if (controller) {
        controller.abort()
        return true
      }

      const session = resolveAgentSessionRecord(this.sessions, targetSessionId)
      if (
        session?.runtimeThreadId &&
        session?.runtimeTurnId &&
        session?.isRunning === true
      ) {
        void interruptCodexRuntimeTurn({
          threadId: session.runtimeThreadId,
          turnId: session.runtimeTurnId,
        }).catch(() => {})
        return true
      }

      return false
    },

    async applyArtifact(artifactId = '') {
      const targetSession = findSessionByArtifactId(this.sessions, artifactId)
      const artifact = targetSession?.artifacts?.find((item) => item.id === artifactId)
      if (!artifact || artifact.status === 'applied') return false

      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()

      try {
        const applied = await applyAiArtifactCapability(artifact, {
          enabledToolIds: this.enabledToolIds,
          filesStore,
          editorStore,
          toastStore,
          translate: t,
        })
        if (targetSession) {
          this.updateSessionById(targetSession.id, (session) => ({
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
          this.updateSessionById(targetSession.id, (session) => ({
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
