import { defineStore } from 'pinia'
import { nanoid } from './utils'
import { normalizeAiArtifact } from '../domains/ai/aiArtifactRuntime.js'
import {
  buildSessionAskUserRequestsFromRuntimeSnapshot,
  buildSessionExitPlanRequestsFromRuntimeSnapshot,
  buildSessionMessagesFromRuntimeSnapshot,
  buildSessionPermissionRequestsFromRuntimeSnapshot,
  buildSessionPlanModeFromRuntimeSnapshot,
} from '../domains/ai/aiRuntimeThreadMapping.js'
import {
  buildAiContextBundle,
  normalizeAiSelection,
  recommendAiSkills,
  skillHasRequiredContext,
} from '../domains/ai/aiContextRuntime.js'
import {
  applyAgentRunEventToSessionState,
  completeAgentRunSessionState,
  failAgentRunSessionState,
  finalizeAgentRunSessionState,
  startAgentRunSessionState,
} from '../domains/ai/aiAgentRunSessionRuntime.js'
import { mergeAgentRunToolEventState } from '../domains/ai/aiAgentRunEventState.js'
import {
  createAiSessionRecord,
  normalizeAiSessionPermissionMode,
  updateAiSessionRecord,
} from '../domains/ai/aiSessionRuntime.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import { AI_AGENT_ACTION_DEFINITIONS } from '../services/ai/skillRegistry.js'
import { DEFAULT_AGENT_ACTION_ID } from '../services/ai/builtInActions.js'
import {
  discoverAltalsSkills,
  isAltalsManagedFilesystemSkill,
} from '../services/ai/skillDiscovery.js'
import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
} from '../services/ai/agentPromptBuilder.js'
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
  createWorkspaceFile as createWorkspaceFileTool,
  deleteWorkspacePath as deleteWorkspacePathTool,
  openWorkspaceFile as openWorkspaceFileTool,
  listWorkspaceDirectory,
  readWorkspaceFile,
  searchWorkspaceFiles,
  writeWorkspaceFile as writeWorkspaceFileTool,
} from '../services/ai/runtime/workspaceFileTools.js'
import { resolveEffectiveAiToolIds } from '../services/ai/toolRegistry.js'
import {
  buildDefaultAgentSessionTitle,
  createAgentSessionState,
  createInitialAgentSessionsState,
  deleteAgentSessionState,
  ensureManagedAgentSessionsState,
  persistAgentSessionsState,
  renameAgentSessionState,
  resolveAgentSessionRecord,
  restoreAgentSessionsState,
  switchAgentSessionState,
} from '../services/ai/agentSessionManager.js'
import { executePreparedAgentRun, prepareAgentRun } from '../services/ai/agentOrchestrator.js'
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
const pendingCodexRuntimeTurns = new Map()
const pendingCodexRuntimeThreadCreations = new Map()

function buildDefaultSessionTitle(count = 1) {
  return buildDefaultAgentSessionTitle(t, count)
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

async function readActiveDocumentRuntime(contextBundle = {}, filesStore, editorStore) {
  const filePath = String(contextBundle?.document?.filePath || '').trim()
  if (!filePath) {
    return { available: false }
  }

  let content = ''
  const view = editorStore?.getAnyEditorView?.(filePath)
  if (view?.altalsGetContent) {
    content = String(view.altalsGetContent() || '')
  } else if (filePath in (filesStore?.fileContents || {})) {
    content = String(filesStore.fileContents[filePath] || '')
  } else {
    try {
      content = String((await filesStore?.readFile?.(filePath)) || '')
    } catch {
      content = ''
    }
  }

  return {
    available: true,
    filePath,
    label: contextBundle?.document?.label || '',
    extension: contextBundle?.document?.extension || '',
    content,
  }
}

function readEditorSelectionRuntime(contextBundle = {}) {
  if (!contextBundle?.selection?.available) {
    return { available: false }
  }

  return {
    available: true,
    filePath: contextBundle.selection.filePath,
    from: contextBundle.selection.from,
    to: contextBundle.selection.to,
    text: contextBundle.selection.text,
    preview: contextBundle.selection.preview,
  }
}

function readSelectedReferenceRuntime(contextBundle = {}) {
  if (!contextBundle?.reference?.available) {
    return { available: false }
  }

  return {
    available: true,
    id: contextBundle.reference.id,
    title: contextBundle.reference.title,
    citationKey: contextBundle.reference.citationKey,
    year: contextBundle.reference.year,
    authorLine: contextBundle.reference.authorLine,
  }
}

function readSkillSupportFilesRuntime(files = []) {
  return (Array.isArray(files) ? files : []).map((file) => ({
    path: file.path,
    relativePath: file.relativePath,
    content: file.content,
  }))
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
      return recommendAiSkills(this.currentContextBundle, AI_AGENT_ACTION_DEFINITIONS)
    },

    altalsSkills(state) {
      return state.altalsSkillCatalog.filter((skill) => isAltalsManagedFilesystemSkill(skill))
    },

    activeSkill(state) {
      return this.builtInActions[0] || AI_AGENT_ACTION_DEFINITIONS[0] || null
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
      void persistAgentSessionsState({
        workspacePath,
        currentSessionId: this.currentSessionId,
        sessions: this.sessions,
      }).catch(() => {})
    },

    async restoreWorkspaceSessions(workspacePath = '') {
      const normalized = await restoreAgentSessionsState({
        workspacePath: String(workspacePath || currentWorkspacePath()).trim(),
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      this.sessions = normalized.sessions
      this.currentSessionId = normalized.currentSessionId
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
      const nextState = await createAgentSessionState({
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

      this.sessions = nextState.sessions
      this.currentSessionId = nextState.currentSessionId
      this.persistCurrentWorkspaceSessions()
      void this.ensureCodexRuntimeThreadForSession(
        nextState.session?.id,
        nextState.session?.title || title
      )
      return nextState.session
    },

    async switchSession(sessionId = '') {
      const nextState = await switchAgentSessionState({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (!nextState.success) return false
      this.sessions = nextState.sessions
      this.currentSessionId = nextState.currentSessionId
      this.persistCurrentWorkspaceSessions()
      void this.syncSessionFromCodexRuntimeThread(nextState.currentSessionId)
      return true
    },

    async deleteSession(sessionId = '') {
      const targetSession = resolveAgentSessionRecord(this.sessions, sessionId || this.currentSessionId)
      const runtimeThreadId = String(targetSession?.runtimeThreadId || '').trim()
      if (runtimeThreadId) {
        void archiveCodexRuntimeThread(runtimeThreadId).catch(() => {})
      }

      const nextState = await deleteAgentSessionState({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (!nextState.success) return false

      this.sessions = nextState.sessions
      this.currentSessionId = nextState.currentSessionId
      this.persistCurrentWorkspaceSessions()
      return true
    },

    async renameSession(sessionId = '', title = '') {
      const nextState = await renameAgentSessionState({
        workspacePath: currentWorkspacePath(),
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId: sessionId || this.currentSessionId,
        title,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      if (!nextState.success) return false

      this.sessions = nextState.sessions
      this.persistCurrentWorkspaceSessions()
      if (!nextState.session) return false

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
        enabledToolIds: resolveEffectiveAiToolIds(config?.enabledTools),
        baseUrl: String(providerConfig?.baseUrl || '').trim(),
        model: String(providerConfig?.model || '').trim(),
        approvalMode: String(providerConfig?.sdk?.approvalMode || 'per-tool').trim(),
      }
      return this.providerState
    },

    async setCurrentProvider(providerId = '') {
      await setCurrentAiProvider(providerId)
      return this.refreshProviderState()
    },

    async ensureCodexRuntimeBridge() {
      if (typeof codexRuntimeUnlisten !== 'function') {
        const store = this
        codexRuntimeUnlisten = await listenCodexRuntimeEvents((payload = {}) => {
          store.handleCodexRuntimeEvent(payload)
        })
      }

      await this.refreshCodexRuntimeSessions()
    },

    async refreshCodexRuntimeSessions() {
      try {
        const response = await listCodexRuntimeThreads()
        const runtimeThreads = Array.isArray(response?.threads) ? response.threads : []
        const nextSessions = [...(Array.isArray(this.sessions) ? this.sessions : [])]
        const runtimeThreadMap = new Map(
          runtimeThreads.map((thread) => [String(thread?.id || '').trim(), thread]).filter(([id]) => id)
        )
        const filteredSessions = nextSessions.filter((session) => {
          const runtimeThreadId = String(session?.runtimeThreadId || '').trim()
          if (!runtimeThreadId) return true
          return runtimeThreadMap.has(runtimeThreadId)
        })

        for (const [index, session] of filteredSessions.entries()) {
          const runtimeThreadId = String(session?.runtimeThreadId || '').trim()
          if (!runtimeThreadId || !runtimeThreadMap.has(runtimeThreadId)) continue
          const thread = runtimeThreadMap.get(runtimeThreadId)
          filteredSessions.splice(index, 1, {
            ...session,
            title: String(thread?.title || session.title || '').trim() || session.title,
            runtimeThreadId,
            runtimeTurnId: String(thread?.activeTurnId || '').trim(),
            isRunning: String(thread?.status || '').trim() === 'running',
            runtimeTransport: 'codex-runtime',
          })
          runtimeThreadMap.delete(runtimeThreadId)
        }

        for (const thread of runtimeThreadMap.values()) {
          if (String(thread?.status || '').trim() === 'archived') continue
          filteredSessions.push(
            createAiSessionRecord({
              title:
                String(thread?.title || '').trim() ||
                buildDefaultSessionTitle(filteredSessions.length + 1),
              runtimeThreadId: String(thread?.id || '').trim(),
              runtimeTurnId: String(thread?.activeTurnId || '').trim(),
              runtimeTransport: 'codex-runtime',
              isRunning: String(thread?.status || '').trim() === 'running',
            })
          )
        }

        const normalized = ensureManagedAgentSessionsState({
          sessions: filteredSessions,
          currentSessionId: this.currentSessionId,
          fallbackTitle: buildDefaultSessionTitle(1),
        })
        this.sessions = normalized.sessions
        this.currentSessionId = normalized.currentSessionId
        this.persistCurrentWorkspaceSessions()
        await Promise.all(
          normalized.sessions
            .filter((session) => String(session?.runtimeThreadId || '').trim())
            .map((session) => this.syncSessionFromCodexRuntimeThread(session.id))
        )
        return runtimeThreads
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

        this.updateSessionById(targetSession.id, (session) => ({
          ...session,
          title: String(snapshot.thread.title || '').trim() || session.title,
          runtimeThreadId: String(snapshot.thread.id || '').trim(),
          runtimeTurnId: String(snapshot.thread.activeTurnId || '').trim(),
          isRunning: String(snapshot.thread.status || '').trim() === 'running',
          messages: buildSessionMessagesFromRuntimeSnapshot(snapshot),
          permissionRequests: buildSessionPermissionRequestsFromRuntimeSnapshot(snapshot),
          askUserRequests: buildSessionAskUserRequestsFromRuntimeSnapshot(snapshot),
          exitPlanRequests: buildSessionExitPlanRequestsFromRuntimeSnapshot(snapshot),
          planMode: buildSessionPlanModeFromRuntimeSnapshot(snapshot),
        }))
        return snapshot
      } catch {
        return null
      }
    },

    handleCodexRuntimeEvent(payload = {}) {
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
        this.updateSessionById(renamedSession.id, (session) => ({
          ...session,
          title: String(payload.thread?.title || '').trim() || session.title,
        }))
        return
      }

      if (payload.eventType === 'permissionRequest' && payload.permissionRequest) {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        this.queuePermissionRequest(
          {
            requestId: payload.permissionRequest.requestId,
            streamId: '',
            toolName: payload.permissionRequest.toolName,
            displayName: payload.permissionRequest.displayName,
            title: payload.permissionRequest.title,
            description: payload.permissionRequest.description,
            decisionReason: payload.permissionRequest.decisionReason,
            inputPreview: payload.permissionRequest.inputPreview,
            runtimeManaged: true,
          },
          session.id
        )
        return
      }

      if (payload.eventType === 'askUserRequest' && payload.askUserRequest) {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        this.queueAskUserRequest(
          {
            requestId: payload.askUserRequest.requestId,
            streamId: '',
            title: payload.askUserRequest.title,
            prompt: payload.askUserRequest.prompt,
            description: payload.askUserRequest.description,
            questions: payload.askUserRequest.questions,
            runtimeManaged: true,
          },
          session.id
        )
        return
      }

      if (payload.eventType === 'exitPlanRequest' && payload.exitPlanRequest) {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        this.queueExitPlanRequest(
          {
            requestId: payload.exitPlanRequest.requestId,
            streamId: '',
            toolUseId: String(payload.exitPlanRequest.turnId || '').trim(),
            title: payload.exitPlanRequest.title,
            allowedPrompts: payload.exitPlanRequest.allowedPrompts,
            runtimeManaged: true,
          },
          session.id
        )
        return
      }

      if (payload.eventType === 'planModeStart' || payload.eventType === 'planModeEnd') {
        const session = findSessionByRuntimeThreadId(this.sessions, threadId)
        if (!session) return
        this.setPlanModeState(session.id, {
          active: payload.eventType === 'planModeStart',
          summary: payload.planMode?.summary || '',
          note: payload.planMode?.note || '',
        })
        return
      }

      const session =
        findSessionByRuntimeThreadId(this.sessions, threadId) ||
        (turnId
          ? resolveAgentSessionRecord(
              this.sessions,
              pendingCodexRuntimeTurns.get(turnId)?.sessionId || ''
            )
          : null)
      if (!session) return

      if (payload.eventType === 'turnStarted' && threadId && turnId) {
        const pending = pendingCodexRuntimeThreads.get(threadId)
        if (pending && !pendingCodexRuntimeTurns.has(turnId)) {
          pendingCodexRuntimeTurns.set(turnId, {
            sessionId: pending.sessionId,
            pendingAssistantId: pending.pendingAssistantId,
            threadId,
            turnId,
            content: '',
            reasoning: '',
            resolve: null,
            reject: null,
            completedResult: null,
            completedError: null,
          })
        }
        this.updateSessionById(session.id, (currentSession) => ({
          ...currentSession,
          runtimeThreadId: threadId,
          runtimeTurnId: turnId,
          runtimeTransport: 'codex-runtime',
        }))
        return
      }

      const trackedTurn = turnId ? pendingCodexRuntimeTurns.get(turnId) || null : null
      const pendingAssistantId = String(trackedTurn?.pendingAssistantId || '').trim()

      if (payload.eventType === 'itemDelta' && trackedTurn && pendingAssistantId) {
        if (payload?.item?.kind === 'agentMessage') {
          trackedTurn.content = String(payload.item.text || trackedTurn.content || '')
          this.updateSessionById(session.id, (currentSession) =>
            applyAgentRunEventToSessionState({
              session: currentSession,
              event: {
                eventType: 'assistant-content',
                text: trackedTurn.content,
                transport: 'codex-runtime',
              },
              pendingAssistantId,
              translate: t,
            })
          )
          return
        }

        if (payload?.item?.kind === 'reasoning') {
          trackedTurn.reasoning = String(payload.item.text || trackedTurn.reasoning || '')
          this.updateSessionById(session.id, (currentSession) =>
            applyAgentRunEventToSessionState({
              session: currentSession,
              event: {
                eventType: 'assistant-reasoning',
                text: trackedTurn.reasoning,
                transport: 'codex-runtime',
              },
              pendingAssistantId,
              translate: t,
            })
          )
        }
        return
      }

      if (payload.eventType === 'turnCompleted' && trackedTurn) {
        pendingCodexRuntimeThreads.delete(threadId)
        const completedResult = {
          content: trackedTurn.content,
          reasoning: trackedTurn.reasoning,
          payload: null,
          transport: 'codex-runtime',
          events: [],
        }
        if (typeof trackedTurn.resolve === 'function') {
          pendingCodexRuntimeTurns.delete(turnId)
          trackedTurn.resolve(completedResult)
          void this.syncSessionFromCodexRuntimeThread(session.id)
        } else {
          pendingCodexRuntimeTurns.set(turnId, {
            ...trackedTurn,
            completedResult,
          })
        }
        return
      }

      if ((payload.eventType === 'turnFailed' || payload.eventType === 'turnInterrupted') && trackedTurn) {
        pendingCodexRuntimeThreads.delete(threadId)
        const completedError = new Error(
          payload.eventType === 'turnInterrupted'
            ? t('AI execution stopped.')
            : String(payload.error || t('AI execution failed.'))
        )
        if (typeof trackedTurn.reject === 'function') {
          pendingCodexRuntimeTurns.delete(turnId)
          trackedTurn.reject(completedError)
          void this.syncSessionFromCodexRuntimeThread(session.id)
        } else {
          pendingCodexRuntimeTurns.set(turnId, {
            ...trackedTurn,
            completedError,
          })
        }
      }
    },

    async runActiveSkill(options = {}) {
      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()
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
        preparedRun = await prepareAgentRun({
          activeSession,
          activeSkill: this.builtInActions[0] || this.activeSkill,
          builtInActions: this.builtInActions,
          altalsSkills: this.altalsSkills,
          contextBundle: this.currentContextBundle,
          sessionMode: 'agent',
          resolveEffectiveSessionPermissionMode,
          skillHasRequiredContext,
          refreshProviderState: () => this.refreshProviderState(),
          workspacePath: useWorkspaceStore().path || '',
          flatFiles: filesStore.flatFiles,
          ensureFlatFilesReady: () => filesStore.ensureFlatFilesReady({ force: false }),
          readWorkspaceFile: (path, options = {}) => filesStore.readFile(path, options),
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

        this.updateSessionById(
          sessionId,
          (session) =>
            startAgentRunSessionState({
              session,
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
            }).session
        )
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

              const systemPrompt = buildAgentSystemPrompt({
                skill,
                runtimeIntent: preparedRun.runtimeIntent,
              })
              const userPrompt = buildAgentUserPrompt({
                skill,
                contextBundle,
                userInstruction: preparedRun.userInstruction,
                conversation: preparedRun.priorConversation,
                altalsSkills: this.altalsSkills,
                attachments: preparedRun.attachments || [],
                referencedFiles: preparedRun.referencedFiles || [],
                requestedTools: preparedRun.requestedTools || [],
                enabledToolIds: resolveEffectiveAiToolIds(preparedRun.config?.enabledTools),
                runtimeIntent: preparedRun.runtimeIntent,
              })

              pendingCodexRuntimeThreads.set(runtimeThreadId, {
                sessionId,
                pendingAssistantId,
              })

              const runtimeResponse = await runCodexRuntimeTurn({
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
                enabledToolIds: resolveEffectiveAiToolIds(preparedRun.config?.enabledTools),
              })

              const runtimeTurnId = String(runtimeResponse?.turn?.id || '').trim()
              const pendingTurnState =
                pendingCodexRuntimeTurns.get(runtimeTurnId) || {
                  sessionId,
                  pendingAssistantId,
                  threadId: runtimeThreadId,
                  turnId: runtimeTurnId,
                  content: '',
                  reasoning: '',
                  resolve: null,
                  reject: null,
                  completedResult: null,
                  completedError: null,
                }

              this.updateSessionById(sessionId, (session) => ({
                ...session,
                runtimeThreadId,
                runtimeTurnId,
                runtimeProviderId: preparedRun.providerId,
                runtimeTransport: 'codex-runtime',
              }))

              return await new Promise((resolve, reject) => {
                const nextState = {
                  ...pendingTurnState,
                  resolve,
                  reject,
                }
                pendingCodexRuntimeTurns.set(runtimeTurnId, nextState)
                if (nextState.completedResult) {
                  pendingCodexRuntimeTurns.delete(runtimeTurnId)
                  resolve(nextState.completedResult)
                  return
                }
                if (nextState.completedError) {
                  pendingCodexRuntimeTurns.delete(runtimeTurnId)
                  reject(nextState.completedError)
                }
              })
            })()
          : await executePreparedAgentRun(preparedRun, {
              altalsSkills: this.altalsSkills,
              toolRuntime: {
                listWorkspaceDirectory: async (input = {}) => {
                  await filesStore.ensureFlatFilesReady({ force: false })
                  return listWorkspaceDirectory({
                    workspacePath: useWorkspaceStore().path || '',
                    files: filesStore.flatFiles,
                    path: input.path || input.directoryPath || '',
                    maxResults: input.maxResults,
                  })
                },
                searchWorkspaceFiles: async (input = {}) => {
                  await filesStore.ensureFlatFilesReady({ force: false })
                  return searchWorkspaceFiles({
                    workspacePath: useWorkspaceStore().path || '',
                    files: filesStore.flatFiles,
                    query: input.query || '',
                    directoryPath: input.directoryPath || '',
                    maxResults: input.maxResults,
                  })
                },
                readWorkspaceFile: async (input = {}) =>
                  readWorkspaceFile({
                    workspacePath: useWorkspaceStore().path || '',
                    path: input.path || '',
                    maxBytes: input.maxBytes,
                    readFile: (path, options) => filesStore.readFile(path, options),
                  }),
                createWorkspaceFile: async (input = {}) =>
                  createWorkspaceFileTool({
                    workspacePath: useWorkspaceStore().path || '',
                    path: input.path || '',
                    content: input.content || '',
                    createFile: (dirPath, name, options = {}) =>
                      filesStore.createFile(dirPath, name, options),
                    openFile: (path) => editorStore.openFile(path),
                  }),
                writeWorkspaceFile: async (input = {}) =>
                  writeWorkspaceFileTool({
                    workspacePath: useWorkspaceStore().path || '',
                    path: input.path || '',
                    content: input.content || '',
                    openAfterWrite: input.openAfterWrite,
                    saveFile: (path, content) => filesStore.saveFile(path, content),
                    openFile: (path) => editorStore.openFile(path),
                  }),
                openWorkspaceFile: async (input = {}) =>
                  openWorkspaceFileTool({
                    workspacePath: useWorkspaceStore().path || '',
                    path: input.path || '',
                    openFile: (path) => editorStore.openFile(path),
                  }),
                deleteWorkspacePath: async (input = {}) =>
                  deleteWorkspacePathTool({
                    workspacePath: useWorkspaceStore().path || '',
                    path: input.path || '',
                    deletePath: (path) => filesStore.deletePath(path),
                  }),
                readActiveDocument: (runtimeContextBundle) =>
                  readActiveDocumentRuntime(runtimeContextBundle, filesStore, editorStore),
                readEditorSelection: readEditorSelectionRuntime,
                readSelectedReference: readSelectedReferenceRuntime,
                readSkillSupportFiles: readSkillSupportFilesRuntime,
              },
              onEvent: (event) => {
                liveToolEvents = mergeAgentRunToolEventState(liveToolEvents, event)
                this.updateSessionById(sessionId, (session) =>
                  applyAgentRunEventToSessionState({
                    session,
                    event,
                    pendingAssistantId,
                    translate: t,
                  })
                )
              },
              signal: abortController.signal,
            })

        const artifact = result?.payload
          ? buildArtifactRecord(
              skill.id,
              normalizeAiArtifact(skill.id, result.payload, contextBundle, result.content)
            )
          : null
        let assistantMessage = null
        this.updateSessionById(sessionId, (session) => {
          const nextState = completeAgentRunSessionState({
            session,
            pendingAssistantId,
            skill,
            result,
            artifact,
            providerState,
            contextBundle,
            createdAt: Date.now(),
          })
          assistantMessage = nextState.assistantMessage
          return nextState.session
        })
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
          this.updateSessionById(
            sessionId,
            (session) =>
              failAgentRunSessionState({
                session,
                pendingAssistantId,
                skill,
                error: message,
                providerState,
                contextBundle,
                events: liveToolEvents,
                createdAt: Date.now(),
              }).session
          )
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
          this.updateSessionById(sessionId, (session) => finalizeAgentRunSessionState({ session }))
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
