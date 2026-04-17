import { defineStore } from 'pinia'
import { nanoid } from './utils'
import { normalizeAiArtifact } from '../domains/ai/aiArtifactRuntime.js'
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
  normalizeAiSessionPermissionMode,
  updateAiSessionRecord,
} from '../domains/ai/aiSessionRuntime.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import { AI_AGENT_ACTION_DEFINITIONS } from '../services/ai/skillRegistry.js'
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
  createWorkspaceFile as createWorkspaceFileTool,
  deleteWorkspacePath as deleteWorkspacePathTool,
  openWorkspaceFile as openWorkspaceFileTool,
  listWorkspaceDirectory,
  readWorkspaceFile,
  searchWorkspaceFiles,
  writeWorkspaceFile as writeWorkspaceFileTool,
} from '../services/ai/runtime/workspaceFileTools.js'
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
import { useWorkspaceStore } from './workspace'

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
      persistAgentSessionsState({
        workspacePath,
        currentSessionId: this.currentSessionId,
        sessions: this.sessions,
      })
    },

    restoreWorkspaceSessions(workspacePath = '') {
      const normalized = restoreAgentSessionsState({
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

    createSession({ title = '', activate = true } = {}) {
      const normalizedMode = 'agent'
      const nextState = createAgentSessionState({
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
      return nextState.session
    },

    switchSession(sessionId = '') {
      const nextState = switchAgentSessionState({
        sessions: this.sessions,
        currentSessionId: this.currentSessionId,
        sessionId,
      })
      if (!nextState.success) return false
      this.currentSessionId = nextState.currentSessionId
      this.persistCurrentWorkspaceSessions()
      return true
    },

    deleteSession(sessionId = '') {
      const nextState = deleteAgentSessionState({
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

    renameSession(sessionId = '', title = '') {
      const nextState = renameAgentSessionState({
        sessions: this.sessions,
        sessionId: sessionId || this.currentSessionId,
        title,
      })
      if (!nextState.success) return false

      this.sessions = nextState.sessions
      this.persistCurrentWorkspaceSessions()
      return !!nextState.session
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
        await respondAnthropicAgentSdkAskUser({
          streamId: request.streamId,
          requestId: request.requestId,
          answers: answers && typeof answers === 'object' ? answers : {},
        })
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
        await respondAnthropicAgentSdkExitPlan({
          streamId: request.streamId,
          requestId: request.requestId,
          action,
          feedback,
        })
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
      if (!requestId || !streamId) return

      const nextRequest = {
        requestId,
        streamId,
        toolName: String(event.toolName || '').trim(),
        displayName: String(event.displayName || event.toolName || '').trim(),
        title: String(event.title || '').trim(),
        description: String(event.description || '').trim(),
        decisionReason: String(event.decisionReason || '').trim(),
        inputPreview: String(event.inputPreview || '').trim(),
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
        if (persist && this.providerState.currentProviderId === 'anthropic' && request.toolName) {
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

        await respondAnthropicAgentSdkPermission({
          streamId: request.streamId,
          requestId: request.requestId,
          behavior,
          persist,
        })
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
        enabledToolIds: Array.isArray(config?.enabledTools) ? config.enabledTools : [],
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

    async runActiveSkill(options = {}) {
      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()
      const requestedSessionId = String(options?.sessionId || this.currentSessionId || '').trim()
      const activeSession =
        resolveAgentSessionRecord(this.sessions, requestedSessionId) || this.createSession()
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

        const result = await executePreparedAgentRun(preparedRun, {
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
                createFile: (dirPath, name, options = {}) => filesStore.createFile(dirPath, name, options),
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

        const artifact = buildArtifactRecord(
          skill.id,
          normalizeAiArtifact(skill.id, result.payload, contextBundle, result.content)
        )
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
      if (!controller) return false
      controller.abort()
      return true
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
