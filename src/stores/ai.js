import { defineStore } from 'pinia'
import { nanoid } from './utils'
import {
  applyAiConversationEventToMessage,
  buildAiAssistantConversationMessage,
  buildAiFailedAssistantMessage,
  buildAiPendingAssistantMessage,
  buildAiUserConversationMessage,
  extractAiMessageText,
} from '../domains/ai/aiConversationRuntime.js'
import { normalizeAiArtifact } from '../domains/ai/aiArtifactRuntime.js'
import {
  buildAiContextBundle,
  normalizeAiSelection,
  recommendAiSkills,
  skillHasRequiredContext,
} from '../domains/ai/aiContextRuntime.js'
import {
  parseAiPromptResourceMentions,
  resolveMentionedWorkspaceFiles,
} from '../domains/ai/aiMentionRuntime.js'
import {
  createAiSessionRecord,
  deriveAiSessionTitle,
  ensureAiSessionsState,
  normalizeAiSessionPermissionMode,
  removeAiSessionRecord,
  updateAiSessionRecord,
} from '../domains/ai/aiSessionRuntime.js'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { useReferencesStore } from './references'
import { useToastStore } from './toast'
import { t } from '../i18n/index.js'
import {
  AI_BUILT_IN_ACTION_DEFINITIONS,
  buildPreparedAiBrief,
  getAiSkillById,
} from '../services/ai/skillRegistry.js'
import { resolveAiInvocation } from '../services/ai/invocationRouting.js'
import { discoverAltalsSkills } from '../services/ai/skillDiscovery.js'
import {
  getAiProviderConfig,
  getAiProviderDefinition,
  loadAiApiKey,
  loadAiConfig,
  saveAiConfig,
  setCurrentAiProvider,
} from '../services/ai/settings.js'
import { executeAiSkill } from '../services/ai/executor.js'
import { applyAiArtifactCapability } from '../services/ai/artifactCapabilities.js'
import { createAiAttachmentRecord } from '../services/ai/attachmentStore.js'
import { loadPersistedAiSessions, persistAiSessions } from '../services/ai/sessionPersistence.js'
import {
  respondAnthropicAgentSdkAskUser,
  respondAnthropicAgentSdkExitPlan,
  respondAnthropicAgentSdkPermission,
} from '../services/ai/runtime/anthropicSdkBridge.js'
import { useWorkspaceStore } from './workspace'
import { isAltalsManagedFilesystemSkill } from '../services/ai/skillDiscovery.js'

const RECENT_AI_SKILL_IDS_KEY = 'altals.ai.recentSkillIds'

function buildDefaultSessionTitle(count = 1) {
  return t('Run {count}', { count })
}

function createInitialAiSessionsState() {
  const initialSession = createAiSessionRecord({
    title: buildDefaultSessionTitle(1),
  })

  return {
    currentSessionId: initialSession.id,
    sessions: [initialSession],
  }
}

function resolveAiSessionRecord(sessions = [], sessionId = '') {
  const normalizedId = String(sessionId || '').trim()
  if (!Array.isArray(sessions) || sessions.length === 0) return null
  return sessions.find((session) => session?.id === normalizedId) || sessions[0] || null
}

function findSessionByPermissionRequestId(sessions = [], requestId = '') {
  const normalizedRequestId = String(requestId || '').trim()
  if (!normalizedRequestId) return null

  return (Array.isArray(sessions) ? sessions : []).find((session) =>
    Array.isArray(session?.permissionRequests)
    && session.permissionRequests.some((request) => request.requestId === normalizedRequestId)
  ) || null
}

function findSessionByArtifactId(sessions = [], artifactId = '') {
  const normalizedArtifactId = String(artifactId || '').trim()
  if (!normalizedArtifactId) return null

  return (Array.isArray(sessions) ? sessions : []).find((session) =>
    Array.isArray(session?.artifacts)
    && session.artifacts.some((artifact) => artifact.id === normalizedArtifactId)
  ) || null
}

function currentWorkspacePath() {
  return String(useWorkspaceStore().path || '').trim()
}

function normalizeConversation(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: extractAiMessageText(message),
    }))
    .filter((message) => message.content)
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

function readRecentSkillIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_AI_SKILL_IDS_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function writeRecentSkillIds(skillIds = []) {
  try {
    localStorage.setItem(RECENT_AI_SKILL_IDS_KEY, JSON.stringify(skillIds))
  } catch {
    // ignore local storage failures
  }
}

function sortEntriesByRecentUsage(entries = [], recentSkillIds = []) {
  const recentIndex = new Map(recentSkillIds.map((id, index) => [id, index]))
  return [...entries].sort((left, right) => {
    const leftIndex = recentIndex.has(left.id) ? recentIndex.get(left.id) : Number.POSITIVE_INFINITY
    const rightIndex = recentIndex.has(right.id) ? recentIndex.get(right.id) : Number.POSITIVE_INFINITY
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return String(left.name || left.titleKey || left.id || '').localeCompare(
      String(right.name || right.titleKey || right.id || '')
    )
  })
}

function mergeToolEventRecord(events = [], nextEvent = {}) {
  const toolId = String(nextEvent.toolId || nextEvent.id || '').trim()
  if (!toolId) return events

  const nextEvents = Array.isArray(events) ? [...events] : []
  const existingIndex = nextEvents.findIndex((event) => String(event.toolId || '') === toolId)

  if (existingIndex >= 0) {
    nextEvents.splice(existingIndex, 1, {
      ...nextEvents[existingIndex],
      ...nextEvent,
      toolId,
    })
    return nextEvents
  }

  nextEvents.push({
    ...nextEvent,
    toolId,
  })
  return nextEvents
}

function normalizeBackgroundTaskStatus(status = 'running') {
  const normalized = String(status || 'running').trim().toLowerCase()
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
    if (normalizedToolUseId && String(entry.toolUseId || '').trim() === normalizedToolUseId) return true
    if (normalizedId && String(entry.id || '').trim() === normalizedId) return true
    return false
  })
}

function buildBackgroundTaskRecord(task = {}, previous = null) {
  const taskId = String(task.taskId || previous?.taskId || '').trim()
  const toolUseId = String(task.toolUseId || task.toolId || previous?.toolUseId || task.id || '').trim()
  const recordId = taskId
    ? `task:${taskId}`
    : (toolUseId ? `tool:${toolUseId}` : '')
  const detail = String(
    task.detail
    || task.description
    || task.summary
    || previous?.detail
    || ''
  ).trim()
  const elapsedSeconds = Number(task.elapsedSeconds)
  const usage = task.usage && typeof task.usage === 'object'
    ? task.usage
    : (previous?.usage && typeof previous.usage === 'object' ? previous.usage : null)

  return {
    id: recordId,
    taskId,
    toolUseId,
    label: String(
      task.label
      || task.title
      || previous?.label
      || task.lastToolName
      || task.taskType
      || toolUseId
      || taskId
      || t('Background task')
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
      content = String(await filesStore?.readFile?.(filePath) || '')
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

export const useAiStore = defineStore('ai', {
  state: () => ({
    editorSelection: normalizeAiSelection(),
    activeSkillId: 'grounded-chat',
    ...createInitialAiSessionsState(),
    altalsSkillCatalog: [],
    recentSkillIds: readRecentSkillIds(),
    isRefreshingAltalsSkills: false,
    lastSkillCatalogError: '',
    providerState: {
      ready: false,
      hasKey: false,
      currentProviderId: 'openai',
      currentProviderLabel: 'OpenAI',
      enabledToolIds: [],
      baseUrl: '',
      model: '',
      approvalMode: 'per-tool',
    },
  }),

  getters: {
    currentSession(state) {
      return resolveAiSessionRecord(state.sessions, state.currentSessionId)
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

      return buildAiContextBundle({
        workspacePath: useWorkspaceStore().path,
        activeFile: editorStore.activeTab,
        selection: state.editorSelection,
        selectedReference: referencesStore.selectedReference,
      })
    },

    builtInActions() {
      return sortEntriesByRecentUsage(
        recommendAiSkills(this.currentContextBundle, AI_BUILT_IN_ACTION_DEFINITIONS),
        this.recentSkillIds
      )
    },

    recommendedSkills() {
      return this.builtInActions
    },

    altalsSkills(state) {
      return sortEntriesByRecentUsage(
        state.altalsSkillCatalog.filter((skill) => isAltalsManagedFilesystemSkill(skill)),
        state.recentSkillIds
      )
    },

    activeSkill(state) {
      return (
        getAiSkillById(state.activeSkillId, state.altalsSkillCatalog)
        || this.altalsSkills[0]
        || this.builtInActions[0]
        || null
      )
    },

    preparedBrief(state) {
      return this.activeSkill
        ? buildPreparedAiBrief(this.activeSkill, this.currentContextBundle, {
          altalsSkills: state.altalsSkillCatalog,
        })
        : ''
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
      return Array.isArray(this.currentSession?.backgroundTasks) ? this.currentSession.backgroundTasks : []
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
      return this.currentSession?.mode === 'chat' ? 'chat' : 'agent'
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
      persistAiSessions(workspacePath, {
        currentSessionId: this.currentSessionId,
        sessions: this.sessions,
      })
    },

    restoreWorkspaceSessions(workspacePath = '') {
      const normalizedWorkspacePath = String(workspacePath || currentWorkspacePath()).trim()
      if (!normalizedWorkspacePath) {
        Object.assign(this, createInitialAiSessionsState())
        return
      }

      const persisted = loadPersistedAiSessions(normalizedWorkspacePath)
      if (!persisted) {
        Object.assign(this, createInitialAiSessionsState())
        return
      }

      const normalized = ensureAiSessionsState({
        sessions: persisted.sessions,
        currentSessionId: persisted.currentSessionId,
        fallbackTitle: buildDefaultSessionTitle(1),
      })
      this.sessions = normalized.sessions
      this.currentSessionId = normalized.currentSessionId
    },

    ensureSessionState() {
      const normalized = ensureAiSessionsState({
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
      return resolveAiSessionRecord(this.sessions, targetSessionId)
    },

    createSession({ title = '', activate = true, mode = 'agent' } = {}) {
      const normalizedMode = String(mode || '').trim() === 'chat' ? 'chat' : 'agent'
      const nextSession = createAiSessionRecord({
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
        title: String(title || '').trim() || buildDefaultSessionTitle(this.sessions.length + 1),
      })

      this.sessions = [nextSession, ...(Array.isArray(this.sessions) ? this.sessions : [])]
      if (activate) {
        this.currentSessionId = nextSession.id
      }
      this.persistCurrentWorkspaceSessions()
      return nextSession
    },

    switchSession(sessionId = '') {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!normalizedSessionId) return false
      if (!this.sessions.some((session) => session.id === normalizedSessionId)) return false
      this.currentSessionId = normalizedSessionId
      this.persistCurrentWorkspaceSessions()
      return true
    },

    deleteSession(sessionId = '') {
      const normalizedSessionId = String(sessionId || this.currentSessionId || '').trim()
      if (!normalizedSessionId) return false
      if (!Array.isArray(this.sessions) || this.sessions.length <= 1) return false

      this.sessions = removeAiSessionRecord(this.sessions, normalizedSessionId)
      if (this.currentSessionId === normalizedSessionId) {
        this.currentSessionId = this.sessions[0]?.id || ''
      }
      this.ensureSessionState()
      this.persistCurrentWorkspaceSessions()
      return true
    },

    renameSession(sessionId = '', title = '') {
      const normalizedTitle = String(title || '').trim()
      if (!normalizedTitle) return false

      const updated = this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        title: normalizedTitle,
      }))
      return !!updated
    },

    setSessionMode(mode = 'agent', sessionId = '') {
      const normalizedMode = String(mode || '').trim() === 'chat' ? 'chat' : 'agent'
      const updated = this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        mode: normalizedMode,
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

    selectSkill(skillId = '') {
      if (!skillId) {
        this.activeSkillId = 'grounded-chat'
        return
      }
      if (!getAiSkillById(skillId, this.altalsSkillCatalog)) return
      this.activeSkillId = skillId
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
        messages: [],
        artifacts: [],
        attachments: [],
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
        attachments: session.attachments.filter((attachment) => attachment.id !== normalizedAttachmentId),
      }))
    },

    clearAttachments(sessionId = '') {
      this.updateSessionById(sessionId || this.currentSessionId, (session) => ({
        ...session,
        attachments: [],
      }))
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

    async respondToAskUserRequest({
      requestId = '',
      answers = {},
      sessionId = '',
    } = {}) {
      const normalizedRequestId = String(requestId || '').trim()
      if (!normalizedRequestId) return false

      const targetSession = sessionId
        ? resolveAiSessionRecord(this.sessions, sessionId)
        : (Array.isArray(this.sessions) ? this.sessions : []).find((session) =>
          Array.isArray(session?.askUserRequests)
          && session.askUserRequests.some((request) => request.requestId === normalizedRequestId)
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
        const message = error instanceof Error ? error.message : String(error || t('AI execution failed.'))
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
        ? resolveAiSessionRecord(this.sessions, sessionId)
        : (Array.isArray(this.sessions) ? this.sessions : []).find((session) =>
          Array.isArray(session?.exitPlanRequests)
          && session.exitPlanRequests.some((request) => request.requestId === normalizedRequestId)
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
        const message = error instanceof Error ? error.message : String(error || t('AI execution failed.'))
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
        lastCompactAt: active === true
          ? Number(session.lastCompactAt || 0) || 0
          : Date.now(),
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
        backgroundTasks: (session.backgroundTasks || []).filter((task) => task.id !== normalizedTaskId),
      }))
    },

    recordSkillUsage(skillId = '') {
      const normalized = String(skillId || '').trim()
      if (!normalized) return
      const next = [normalized, ...this.recentSkillIds.filter((id) => id !== normalized)].slice(0, 20)
      this.recentSkillIds = next
      writeRecentSkillIds(next)
    },

    isToolEnabled(toolId = '') {
      return this.enabledToolIds.includes(String(toolId || '').trim())
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
        const remaining = (Array.isArray(session.permissionRequests) ? session.permissionRequests : []).filter(
          (request) => request.requestId !== requestId
        )

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
        ? resolveAiSessionRecord(this.sessions, sessionId)
        : findSessionByPermissionRequestId(this.sessions, normalizedRequestId)

      if (!targetSession) return

      this.updateSessionById(targetSession.id, (session) => ({
        ...session,
        permissionRequests: (Array.isArray(session.permissionRequests) ? session.permissionRequests : []).filter(
          (request) => request.requestId !== normalizedRequestId
        ),
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
        ? resolveAiSessionRecord(this.sessions, sessionId)
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
        const message = error instanceof Error ? error.message : String(error || t('AI execution failed.'))
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

        if (!getAiSkillById(this.activeSkillId, skills)) {
          this.activeSkillId = skills[0]?.id || 'grounded-chat'
        }
        return skills
      } catch (error) {
        this.lastSkillCatalogError = error instanceof Error
          ? error.message
          : String(error || t('Failed to load Altals skills.'))
        return []
      } finally {
        this.isRefreshingAltalsSkills = false
      }
    },

    async refreshProviderState() {
      const config = await loadAiConfig()
      const currentProviderId = String(config?.currentProviderId || 'openai').trim()
      const providerConfig = getAiProviderConfig(config, currentProviderId)
      const providerDefinition = getAiProviderDefinition(currentProviderId)
      const apiKey = await loadAiApiKey(currentProviderId)

      this.providerState = {
        ready:
          !!String(providerConfig?.baseUrl || '').trim()
          && !!String(providerConfig?.model || '').trim()
          && !!String(apiKey || '').trim(),
        hasKey: !!String(apiKey || '').trim(),
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

    async runActiveSkill() {
      const toastStore = useToastStore()
      const editorStore = useEditorStore()
      const filesStore = useFilesStore()
      const activeSession = this.currentSession || this.createSession()
      const sessionId = activeSession.id
      const sessionMode = activeSession.mode === 'chat' ? 'chat' : 'agent'
      const isAgentSession = sessionMode === 'agent'
      const promptDraft = String(activeSession.promptDraft || '')
      const promptMentions = parseAiPromptResourceMentions(promptDraft)
      const invocation = resolveAiInvocation({
        prompt: promptDraft,
        activeSkill: this.activeSkill,
        builtInActions: this.builtInActions,
        altalsSkills: this.altalsSkills,
        contextBundle: this.currentContextBundle,
      })
      const skill = invocation.resolvedSkill
      if (invocation.resolvedSkill?.id && invocation.resolvedSkill.id !== this.activeSkillId) {
        this.activeSkillId = invocation.resolvedSkill.id
      }
      if (!skill) {
        this.updateSessionById(sessionId, (session) => ({
          ...session,
          lastError: t('AI skill is not available.'),
        }))
        return null
      }
      if (skill.kind !== 'filesystem-skill' && !skillHasRequiredContext(skill, this.currentContextBundle)) {
        const message = t('The selected AI skill is missing required context.')
        this.updateSessionById(sessionId, (session) => ({
          ...session,
          lastError: message,
        }))
        toastStore.show(message, { type: 'warning' })
        return null
      }

      const providerState = await this.refreshProviderState()
      if (!providerState.ready) {
        const message = t('AI settings are incomplete. Configure the provider before running a skill.')
        this.updateSessionById(sessionId, (session) => ({
          ...session,
          lastError: message,
        }))
        toastStore.show(message, { type: 'warning' })
        return null
      }

      const fullConfig = await loadAiConfig()
      const providerId = String(fullConfig?.currentProviderId || 'openai').trim()
      const [baseConfig, apiKey] = await Promise.all([
        Promise.resolve(getAiProviderConfig(fullConfig, providerId)),
        loadAiApiKey(providerId),
      ])
      const effectivePermissionMode = resolveEffectiveSessionPermissionMode({
        session: activeSession,
        mode: sessionMode,
        providerId,
        providerConfig: baseConfig,
      })
      const config = {
        ...baseConfig,
        sdk: providerId === 'anthropic'
          ? {
            ...(baseConfig.sdk || {}),
            runtimeMode: !isAgentSession ? 'http' : String(baseConfig?.sdk?.runtimeMode || 'sdk'),
            approvalMode: effectivePermissionMode === 'plan' ? 'plan' : 'per-tool',
            autoAllowAll: effectivePermissionMode === 'bypass-permissions',
          }
          : baseConfig.sdk,
      }
      const contextBundle = this.currentContextBundle
      const userInstruction = String(invocation.userInstruction || '').trim()
      let referencedFiles = []
      if (isAgentSession && promptMentions.fileMentions.length > 0) {
        await filesStore.ensureFlatFilesReady({ force: false })
        const mentionedEntries = resolveMentionedWorkspaceFiles(
          promptMentions.fileMentions,
          filesStore.flatFiles,
          useWorkspaceStore().path || ''
        )
        referencedFiles = await Promise.all(
          mentionedEntries.map(async (entry) => {
            try {
              const content = await filesStore.readFile(entry.path, { maxBytes: 64 * 1024 })
              return {
                path: entry.path,
                relativePath: useWorkspaceStore().path && entry.path.startsWith(useWorkspaceStore().path)
                  ? entry.path.slice(useWorkspaceStore().path.length).replace(/^\/+/, '')
                  : entry.path,
                content: String(content || ''),
              }
            } catch {
              return {
                path: entry.path,
                relativePath: useWorkspaceStore().path && entry.path.startsWith(useWorkspaceStore().path)
                  ? entry.path.slice(useWorkspaceStore().path.length).replace(/^\/+/, '')
                  : entry.path,
                content: '',
              }
            }
          })
        )
      }
      const priorConversation = normalizeConversation(
        (activeSession.messages || []).slice(-6)
      )
      const userMessageId = `message:${nanoid()}`
      const pendingAssistantId = `message:${nanoid()}`
      const createdAt = Date.now()
      const userMessage = buildAiUserConversationMessage({
        id: userMessageId,
        skill,
        userInstruction,
        contextBundle,
        createdAt,
      })
      const pendingAssistantMessage = buildAiPendingAssistantMessage({
        id: pendingAssistantId,
        skill,
        providerState,
        contextBundle,
        createdAt: createdAt + 1,
      })
      let liveToolEvents = []

      this.updateSessionById(sessionId, (session) => ({
        ...session,
        title: session.messages.length === 0
          ? deriveAiSessionTitle(
            userInstruction || promptDraft,
            session.title || buildDefaultSessionTitle(this.sessions.length)
          )
          : session.title,
        messages: [...session.messages, userMessage, pendingAssistantMessage],
        isRunning: true,
        lastError: '',
        waitingResume: false,
        waitingResumeMessage: '',
        permissionMode: effectivePermissionMode === 'chat'
          ? session.permissionMode
          : normalizeAiSessionPermissionMode(effectivePermissionMode),
      }))

      try {
        const result = await executeAiSkill({
          skillId: skill.id,
          skill,
          contextBundle,
          config: {
            ...config,
            providerId,
          },
          apiKey: apiKey || '',
          userInstruction,
          conversation: priorConversation,
          altalsSkills: this.altalsSkills,
          attachments: activeSession.attachments || [],
          referencedFiles,
          requestedTools: isAgentSession ? promptMentions.toolMentions : [],
          toolRuntime: {
            readActiveDocument: (runtimeContextBundle) =>
              readActiveDocumentRuntime(runtimeContextBundle, filesStore, editorStore),
            readEditorSelection: readEditorSelectionRuntime,
            readSelectedReference: readSelectedReferenceRuntime,
            readSkillSupportFiles: readSkillSupportFilesRuntime,
          },
          onEvent: (event) => {
            if (event?.type === 'permission_request') {
              this.queuePermissionRequest(event, sessionId)
            }
            if (event?.type === 'permission_resolved') {
              this.clearPermissionRequest(event.requestId || event.toolUseId, sessionId)
            }
            if (event?.type === 'ask_user_request') {
              this.queueAskUserRequest(event, sessionId)
            }
            if (event?.type === 'ask_user_resolved') {
              this.clearAskUserRequest(event.requestId, sessionId)
            }
            if (event?.type === 'exit_plan_mode_request') {
              this.queueExitPlanRequest(event, sessionId)
            }
            if (event?.type === 'exit_plan_mode_resolved') {
              this.clearExitPlanRequest(event.requestId, sessionId)
            }
            if (event?.type === 'permission_mode_changed') {
              this.setSessionPermissionMode(event.mode, sessionId)
            }
            if (event?.type === 'plan_mode_start') {
              this.setPlanModeState(sessionId, {
                active: true,
                summary: event.summary,
                note: event.note,
              })
            }
            if (event?.type === 'plan_mode_end') {
              this.setPlanModeState(sessionId, {
                active: false,
                summary: '',
                note: '',
              })
            }
            if (event?.type === 'compacting') {
              this.setCompactionState(sessionId, { active: true })
            }
            if (event?.type === 'compact_complete') {
              this.setCompactionState(sessionId, { active: false })
            }
            if (event?.type === 'waiting_resume') {
              this.setWaitingResumeState(sessionId, {
                active: true,
                message: String(event.message || '').trim(),
              })
            }
            if (event?.type === 'resume_start') {
              this.setWaitingResumeState(sessionId, { active: false, message: '' })
            }
            if (event?.type === 'background_task') {
              this.upsertBackgroundTask({
                ...event,
                toolUseId: event.id || event.toolId || '',
              }, sessionId)
            }
            if (event?.type === 'task_started') {
              this.upsertBackgroundTask({
                taskId: event.taskId,
                toolUseId: event.toolUseId,
                taskType: event.taskType,
                label: event.description || t('Background task'),
                description: event.description,
                status: 'running',
              }, sessionId)
            }
            if (event?.type === 'task_progress') {
              this.upsertBackgroundTask({
                taskId: event.taskId,
                toolUseId: event.toolUseId,
                lastToolName: event.lastToolName,
                detail: String(event.description || event.lastToolName || '').trim(),
                elapsedSeconds: event.elapsedSeconds,
                usage: event.usage,
                status: 'running',
              }, sessionId)
            }
            if (event?.type === 'task_notification') {
              this.upsertBackgroundTask({
                taskId: event.taskId,
                toolUseId: event.toolUseId,
                summary: event.summary,
                outputFile: event.outputFile,
                usage: event.usage,
                status: event.status,
              }, sessionId)
            }
            if (event?.eventType === 'tool' || event?.toolId) {
              const payloadEventType = String(event?.payload?.eventType || '').trim()
              const payloadToolName = String(event?.payload?.toolName || event.label || '').trim()

              if (payloadEventType === 'tool_call_start' && payloadToolName === 'EnterPlanMode') {
                this.setPlanModeState(sessionId, {
                  active: true,
                  summary: t('The agent is currently drafting a plan.'),
                  note: t('Plan mode stays visible until the runtime exits it.'),
                })
              }

              if (payloadEventType === 'tool_call_done' && payloadToolName === 'ExitPlanMode') {
                this.setPlanModeState(sessionId, {
                  active: false,
                  summary: '',
                  note: '',
                })
              }

              liveToolEvents = mergeToolEventRecord(liveToolEvents, event)
            }
            this.updateSessionById(sessionId, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === pendingAssistantId
                  ? applyAiConversationEventToMessage(message, event)
                  : message
              ),
            }))
          },
        })

        const artifact = buildArtifactRecord(skill.id, normalizeAiArtifact(
          skill.id,
          result.payload,
          contextBundle,
          result.content
        ))
        const assistantMessage = buildAiAssistantConversationMessage({
          id: pendingAssistantId,
          skill,
          result,
          artifact,
          providerState,
          contextBundle,
          createdAt: Date.now(),
        })

        this.updateSessionById(sessionId, (session) => ({
          ...session,
          messages: session.messages.map((message) =>
            message.id === pendingAssistantId ? assistantMessage : message
          ),
          artifacts: artifact ? [artifact, ...session.artifacts] : session.artifacts,
          attachments: [],
          promptDraft: '',
        }))
        this.recordSkillUsage(skill.id)
        return { assistantMessage, artifact }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || t('AI execution failed.'))
        const failedAssistantMessage = buildAiFailedAssistantMessage({
          id: pendingAssistantId,
          skill,
          error: message,
          providerState,
          contextBundle,
          events: liveToolEvents,
          createdAt: Date.now(),
        })
        this.updateSessionById(sessionId, (session) => ({
          ...session,
          lastError: message,
          messages: session.messages.map((conversationMessage) =>
            conversationMessage.id === pendingAssistantId
              ? failedAssistantMessage
              : conversationMessage
          ),
        }))
        toastStore.show(message, { type: 'error' })
        return null
      } finally {
        this.updateSessionById(sessionId, (session) => ({
          ...session,
          isRunning: false,
          permissionRequests: [],
          exitPlanRequests: [],
          waitingResume: false,
          waitingResumeMessage: '',
          isCompacting: false,
        }))
      }
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
        const message = error instanceof Error ? error.message : String(error || t('Failed to apply AI artifact.'))
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
