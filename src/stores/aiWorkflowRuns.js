import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { t } from '../i18n/index.js'
import { createWorkflowPlan } from '../services/ai/workflowRuns/planner.js'
import { executeWorkflowRun } from '../services/ai/workflowRuns/executor.js'
import {
  resolveCheckpoint,
  setRunExecutionMode as updateRunExecutionMode,
} from '../services/ai/workflowRuns/state.js'

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Fall back to JSON cloning below when structuredClone cannot handle the payload.
    }
  }
  return JSON.parse(JSON.stringify(value))
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTemplate(template = {}) {
  if (!isRecord(template)) return null

  const id = String(template.id || '').trim()
  if (!id) return null

  return {
    id,
    label: String(template.label || ''),
    role: String(template.role || ''),
    toolProfile: String(template.toolProfile || ''),
    autoAdvanceUntil: template.autoAdvanceUntil ? String(template.autoAdvanceUntil) : null,
    backgroundCapable: template.backgroundCapable !== false,
    approvalTypes: Array.isArray(template.approvalTypes)
      ? template.approvalTypes.map((type) => String(type)).filter(Boolean)
      : [],
  }
}

function backgroundResumeHintForRun(run = {}) {
  switch (String(run?.status || '')) {
    case 'running':
      return 'This workflow is still running in the background.'
    case 'waiting_user':
      return 'Return to review the pending approval and continue this workflow.'
    case 'completed':
      return 'Open this session to review the completed workflow and its artifacts.'
    case 'failed':
      return 'Open this session to inspect the failure and decide how to continue.'
    default:
      return 'This workflow can be resumed from the AI workbench or chat list.'
  }
}

function normalizeRunSnapshot(run = {}) {
  if (!isRecord(run)) return null
  const value = clone(run)
  const executionMode = String(value.executionMode || '').trim() === 'background'
    ? 'background'
    : 'foreground'
  return {
    ...value,
    executionMode,
    backgroundCapable: value.backgroundCapable !== false,
    lastHeartbeatAt: value.lastHeartbeatAt || value.updatedAt || value.createdAt || null,
    resumeHint: executionMode === 'background'
      ? backgroundResumeHintForRun(value)
      : null,
  }
}

function normalizeWorkflowSnapshot(snapshot = null) {
  if (!isRecord(snapshot)) return null
  const run = normalizeRunSnapshot(snapshot.run)
  const template = normalizeTemplate(snapshot.template)

  if (!run?.id || !template) return null

  return {
    run,
    template,
  }
}

export function hydrateSessionWorkflow(snapshot = null) {
  return normalizeWorkflowSnapshot(snapshot)
}

export function serializeSessionWorkflow(workflow = null) {
  const normalized = normalizeWorkflowSnapshot(workflow)
  return normalized ? clone(normalized) : null
}

function findOpenCheckpoint(run) {
  return (run?.checkpoints || []).find((checkpoint) => checkpoint?.status === 'open') || null
}

function resolveRunContextFile(workflow = null) {
  const context = workflow?.run?.context || {}
  return String(context.currentFile || context.file || '').trim()
}

function findCurrentStep(run) {
  const steps = run?.steps || []
  if (!steps.length) return null

  if (run?.currentStepId) {
    const current = steps.find((step) => step.id === run.currentStepId)
    if (current) return current
  }

  return steps.find((step) => step.status === 'running')
    || steps.find((step) => step.status === 'pending')
    || steps[steps.length - 1]
    || null
}

function shouldNotifyRunStatus(previous, next) {
  if (!previous?.run?.id || !next?.run?.id) return false
  const previousStatus = String(previous.run.status || '')
  const nextStatus = String(next.run.status || '')
  const previousCheckpointId = previous.run.currentCheckpointId || null
  const nextCheckpointId = next.run.currentCheckpointId || null
  if (previousStatus === nextStatus && previousCheckpointId === nextCheckpointId) return false
  return nextStatus === 'waiting_user' || nextStatus === 'completed' || nextStatus === 'failed'
}

function describeNotification(nextWorkflow) {
  const label = t(nextWorkflow?.template?.label || nextWorkflow?.run?.title || 'Workflow')
  const currentStep = findCurrentStep(nextWorkflow?.run)
  const stepLabel = currentStep?.label || null
  const status = String(nextWorkflow?.run?.status || '')

  if (status === 'waiting_user') {
    return {
      type: 'warning',
      message: stepLabel
        ? t('{label}: waiting for approval at {step}.', { label, step: stepLabel })
        : t('{label}: waiting for approval.', { label }),
      actionLabel: t('Open workflow'),
    }
  }

  if (status === 'completed') {
    return {
      type: 'success',
      message: t('{label}: workflow completed.', { label }),
      actionLabel: t('Review results'),
    }
  }

  if (status === 'failed') {
    const errorMessage = String(nextWorkflow?.run?.error?.message || '').trim()
    return {
      type: 'error',
      message: errorMessage
        ? t('{label}: workflow failed. {error}', { label, error: errorMessage })
        : t('{label}: workflow failed.', { label }),
      actionLabel: t('Open workflow'),
    }
  }

  return null
}

export const useAiWorkflowRunsStore = defineStore('aiWorkflowRuns', () => {
  const byRunId = ref({})
  const sessionRunMap = ref({})
  const activeRunId = ref(null)
  const executorServices = {
    chatStore: null,
    resolveChatStore: null,
    toastStore: null,
    aiWorkbenchStore: null,
  }
  const executionByRunId = new Map()
  const executionStateByRunId = new Map()
  const rerunAfterExecution = new Map()

  const activeRun = computed(() => {
    if (!activeRunId.value) return null
    return byRunId.value[activeRunId.value] || null
  })

  const backgroundRuns = computed(() => listBackgroundRuns())

  function getRun(runId) {
    if (!runId) return null
    return byRunId.value[runId] || null
  }

  function getRunForSession(sessionId) {
    if (!sessionId) return null
    const runId = sessionRunMap.value[sessionId]
    return runId ? getRun(runId) : null
  }

  function getSessionIdForRun(runId) {
    if (!runId) return null
    return Object.entries(sessionRunMap.value).find(([, candidateRunId]) => candidateRunId === runId)?.[0] || null
  }

  function getExecutionFingerprint(run = null) {
    if (!run?.id) return ''
    const steps = Array.isArray(run.steps)
      ? run.steps.map((step) => `${step.id}:${step.status}:${step.attemptCount || 0}`).join('|')
      : ''
    const checkpoints = Array.isArray(run.checkpoints)
      ? run.checkpoints.map((checkpoint) => `${checkpoint.id}:${checkpoint.status}`).join('|')
      : ''
    return [
      String(run.status || ''),
      String(run.currentStepId || ''),
      String(run.currentCheckpointId || ''),
      steps,
      checkpoints,
    ].join('::')
  }

  function shouldRerunWorkflow(run = null) {
    if (!run?.id) return false
    const status = String(run.status || '')
    if (status === 'draft' || status === 'planned') return true
    if (status !== 'running') return false
    return !findOpenCheckpoint(run)
  }

  function dropRunIfUnbound(runId) {
    if (!runId || !byRunId.value[runId]) return
    const stillBound = Object.values(sessionRunMap.value).some((candidate) => candidate === runId)
    if (stillBound) return

    const nextRuns = { ...byRunId.value }
    delete nextRuns[runId]
    byRunId.value = nextRuns

    if (activeRunId.value === runId) {
      activeRunId.value = null
    }
  }

  function listBackgroundRuns({ includeFinal = false } = {}) {
    const activeStatuses = new Set(['draft', 'planned', 'running', 'waiting_user'])
    return Object.values(byRunId.value)
      .filter((workflow) => {
        const run = workflow?.run
        if (!run?.id) return false
        if (run.backgroundCapable === false) return false
        if (run.executionMode !== 'background') return false
        if (includeFinal) return true
        return activeStatuses.has(String(run.status || ''))
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left?.run?.updatedAt || left?.run?.createdAt || 0)
        const rightTime = Date.parse(right?.run?.updatedAt || right?.run?.createdAt || 0)
        return rightTime - leftTime
      })
      .map((workflow) => serializeSessionWorkflow(workflow))
      .filter(Boolean)
  }

  function listRunsForFile(filePath, { templateIdPrefix = '', includeFinal = true } = {}) {
    const targetFile = String(filePath || '').trim()
    if (!targetFile) return []

    const activeStatuses = new Set(['draft', 'planned', 'running', 'waiting_user'])
    const normalizedPrefix = String(templateIdPrefix || '').trim()

    return Object.values(byRunId.value)
      .filter((workflow) => {
        const run = workflow?.run
        if (!run?.id) return false
        if (resolveRunContextFile(workflow) !== targetFile) return false
        if (!includeFinal && !activeStatuses.has(String(run.status || ''))) return false
        if (
          normalizedPrefix
          && !String(workflow?.template?.id || run.templateId || '').startsWith(normalizedPrefix)
        ) {
          return false
        }
        return true
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left?.run?.updatedAt || left?.run?.createdAt || 0)
        const rightTime = Date.parse(right?.run?.updatedAt || right?.run?.createdAt || 0)
        return rightTime - leftTime
      })
      .map((workflow) => serializeSessionWorkflow(workflow))
      .filter(Boolean)
  }

  function findLatestRunForFile(filePath, options = {}) {
    return listRunsForFile(filePath, options)[0] || null
  }

  async function notifyRunStatusChange(previous, next) {
    if (typeof window === 'undefined') return
    if (!shouldNotifyRunStatus(previous, next)) return

    const notification = describeNotification(next)
    if (!notification) return

    try {
      const toastStore = executorServices.toastStore
      if (!toastStore || typeof toastStore.show !== 'function') return

      const aiWorkbench = executorServices.aiWorkbenchStore
      const sessionId = getSessionIdForRun(next.run.id)
      const action = sessionId && aiWorkbench && typeof aiWorkbench.openSession === 'function'
        ? {
          label: notification.actionLabel,
          onClick: () => aiWorkbench.openSession(sessionId),
        }
        : null

      toastStore.show(notification.message, {
        type: notification.type,
        duration: 6000,
        action,
      })
    } catch {
      // Workflow status toasts are best-effort and should not break the store path.
    }
  }

  function storeWorkflow(workflow) {
    const snapshot = serializeSessionWorkflow(workflow)
    if (!snapshot) return null
    const previous = byRunId.value[snapshot.run.id] || null

    byRunId.value = {
      ...byRunId.value,
      [snapshot.run.id]: snapshot,
    }

    if (previous) {
      void notifyRunStatusChange(previous, snapshot)
    }

    return byRunId.value[snapshot.run.id]
  }

  function replaceRun(workflow) {
    const stored = storeWorkflow(workflow)
    if (!stored) return null
    if (activeRunId.value === stored.run.id) {
      activeRunId.value = stored.run.id
    }
    return stored
  }

  function configureExecutor({
    chatStore,
    resolveChatStore,
    toastStore,
    aiWorkbenchStore,
  } = {}) {
    if (chatStore !== undefined) {
      executorServices.chatStore = chatStore || null
    }
    if (resolveChatStore !== undefined) {
      executorServices.resolveChatStore = typeof resolveChatStore === 'function'
        ? resolveChatStore
        : null
    }
    if (toastStore !== undefined) {
      executorServices.toastStore = toastStore || null
    }
    if (aiWorkbenchStore !== undefined) {
      executorServices.aiWorkbenchStore = aiWorkbenchStore || null
    }
  }

  async function resolveExecutorChatStore() {
    if (executorServices.chatStore) return executorServices.chatStore
    if (typeof executorServices.resolveChatStore !== 'function') return null
    const chatStore = await executorServices.resolveChatStore()
    if (chatStore) {
      executorServices.chatStore = chatStore
    }
    return chatStore || null
  }

  async function persistRunSnapshot({ runId, sessionId = null, chatStore = null } = {}) {
    const targetRunId = String(runId || '').trim()
    if (!targetRunId) return null

    const boundSessionId = sessionId || getSessionIdForRun(targetRunId) || null
    if (!boundSessionId) return getRun(targetRunId)

    const resolvedChatStore = chatStore || await resolveExecutorChatStore()
    const session = Array.isArray(resolvedChatStore?.sessions)
      ? resolvedChatStore.sessions.find((item) => item?.id === boundSessionId) || null
      : null
    if (!session) return getRun(targetRunId)

    syncRunToSession(session)
    if (typeof resolvedChatStore?.saveSession === 'function') {
      await resolvedChatStore.saveSession(boundSessionId)
    }

    return getRun(targetRunId)
  }

  async function runExecutor({ runId, sessionId = null, queueIfRunning = true } = {}) {
    if (!runId) return null

    const existing = executionByRunId.get(runId)
    if (existing) {
      if (queueIfRunning) {
        const fingerprint = getExecutionFingerprint(getRun(runId)?.run)
        const activeFingerprint = executionStateByRunId.get(runId)
        if (fingerprint && fingerprint !== activeFingerprint) {
          rerunAfterExecution.set(runId, fingerprint)
        }
      }
      return existing
    }

    executionStateByRunId.set(runId, getExecutionFingerprint(getRun(runId)?.run))

    const task = (async () => {
      const workflow = getRun(runId)
      if (!workflow) return null

      const boundSessionId = sessionId || getSessionIdForRun(runId) || null
      const chatStore = await resolveExecutorChatStore()
      if (boundSessionId) {
        const hasSession = Array.isArray(chatStore?.sessions)
          && chatStore.sessions.some((session) => session?.id === boundSessionId)
        if (!hasSession) {
          return getRun(runId)
        }
      }

      return executeWorkflowRun({
        run: clone(workflow.run),
        sessionId: boundSessionId,
        chatStore,
        workflowStore: {
          getRun(id) {
            const current = getRun(id)
            return current ? serializeSessionWorkflow(current) : null
          },
          replaceRun(nextWorkflow) {
            const stored = replaceRun(nextWorkflow)
            return stored ? serializeSessionWorkflow(stored) : null
          },
          syncRunToSession(session) {
            return syncRunToSession(session)
          },
        },
      })
    })()

    executionByRunId.set(runId, task)
    task.finally(() => {
      executionByRunId.delete(runId)
      const activeFingerprint = executionStateByRunId.get(runId)
      executionStateByRunId.delete(runId)

      const queuedFingerprint = rerunAfterExecution.get(runId)
      rerunAfterExecution.delete(runId)

      const latest = getRun(runId)
      if (
        queuedFingerprint
        && queuedFingerprint !== activeFingerprint
        && latest?.run
        && shouldRerunWorkflow(latest.run)
        && getExecutionFingerprint(latest.run) === queuedFingerprint
      ) {
        void runExecutor({ runId, sessionId: getSessionIdForRun(runId) })
      }
    })

    return task
  }

  function restoreSessionWorkflow(sessionId, workflow = null) {
    const snapshot = serializeSessionWorkflow(workflow)
    if (!snapshot) {
      clearSessionBinding(sessionId)
      return null
    }

    storeWorkflow(snapshot)
    bindRunToSession(sessionId, snapshot.run.id)
    setActiveRun(snapshot.run.id)
    return getRun(snapshot.run.id)
  }

  function createRunFromTemplate({
    templateId,
    sessionId = null,
    context = {},
    autoRun = true,
    executionMode = 'foreground',
  } = {}) {
    const workflow = createWorkflowPlan({ templateId, context, executionMode })
    storeWorkflow(workflow)

    if (sessionId) {
      bindRunToSession(sessionId, workflow.run.id)
    }

    setActiveRun(workflow.run.id)
    if (sessionId && autoRun) {
      void runExecutor({ runId: workflow.run.id, sessionId })
    }
    return getRun(workflow.run.id)
  }

  function bindRunToSession(sessionId, runId) {
    if (!sessionId || !runId || !byRunId.value[runId]) return null

    const previousRunId = sessionRunMap.value[sessionId] || null
    sessionRunMap.value = {
      ...sessionRunMap.value,
      [sessionId]: runId,
    }

    if (previousRunId && previousRunId !== runId) {
      dropRunIfUnbound(previousRunId)
    }

    return getRun(runId)
  }

  function clearSessionBinding(sessionId) {
    if (!sessionId || !sessionRunMap.value[sessionId]) return

    const runId = sessionRunMap.value[sessionId]
    const nextMap = { ...sessionRunMap.value }
    delete nextMap[sessionId]
    sessionRunMap.value = nextMap

    dropRunIfUnbound(runId)
  }

  function setActiveRun(runId) {
    activeRunId.value = runId && byRunId.value[runId] ? runId : null
    return activeRun.value
  }

  function setRunExecutionMode({
    runId,
    executionMode = 'foreground',
    resumeHint = undefined,
  } = {}) {
    const current = getRun(runId)
    if (!current) return null

    const nextWorkflow = {
      ...current,
      run: updateRunExecutionMode(clone(current.run), executionMode, { resumeHint }),
    }

    storeWorkflow(nextWorkflow)
    return getRun(runId)
  }

  function applyCheckpointDecision({ runId, checkpointId = null, decision, resolvedBy = 'user' } = {}) {
    const current = getRun(runId)
    if (!current) return null

    const targetCheckpointId = checkpointId || current.run.currentCheckpointId || findOpenCheckpoint(current.run)?.id
    if (!targetCheckpointId) return current

    const nextRun = resolveCheckpoint(clone(current.run), targetCheckpointId, {
      resolvedBy,
      payload: decision === undefined ? undefined : clone(decision),
    })

    const nextWorkflow = {
      ...current,
      run: nextRun,
    }

    storeWorkflow(nextWorkflow)
    if (activeRunId.value === runId) {
      activeRunId.value = runId
    }
    const sessionId = getSessionIdForRun(runId)
    if (sessionId) {
      void (async () => {
        const chatStore = await resolveExecutorChatStore()
        await persistRunSnapshot({ runId, sessionId, chatStore })
        await runExecutor({ runId, sessionId, queueIfRunning: true })
      })()
    }
    return getRun(runId)
  }

  function syncRunToSession(session) {
    if (!session?.id) return null

    const runId = sessionRunMap.value[session.id] || null
    if (!runId) {
      session._workflow = null
      return null
    }

    const workflow = getRun(runId)
    if (!workflow) {
      clearSessionBinding(session.id)
      session._workflow = null
      return null
    }

    const snapshot = serializeSessionWorkflow(workflow)
    session._workflow = snapshot
    return snapshot
  }

  function describeRun(runId) {
    const workflow = typeof runId === 'string' ? getRun(runId) : serializeSessionWorkflow(runId)
    if (!workflow) return null

    const currentStep = findCurrentStep(workflow.run)
    return {
      label: t(workflow.template.label || workflow.run.title || 'Workflow'),
      status: workflow.run.status || 'draft',
      currentStepLabel: currentStep?.label ? t(currentStep.label) : null,
      approvalPending: Boolean(findOpenCheckpoint(workflow.run)),
      templateId: workflow.template.id || workflow.run.templateId || null,
      executionMode: workflow.run.executionMode || 'foreground',
      backgroundCapable: workflow.run.backgroundCapable !== false,
      lastHeartbeatAt: workflow.run.lastHeartbeatAt || null,
      resumeHint: workflow.run.resumeHint ? t(workflow.run.resumeHint) : null,
    }
  }

  function clearAll() {
    byRunId.value = {}
    sessionRunMap.value = {}
    activeRunId.value = null
    executionByRunId.clear()
    executionStateByRunId.clear()
    rerunAfterExecution.clear()
  }

  return {
    byRunId,
    sessionRunMap,
    activeRunId,
    activeRun,
    backgroundRuns,
    getRun,
    getRunForSession,
    getSessionIdForRun,
    listBackgroundRuns,
    listRunsForFile,
    findLatestRunForFile,
    restoreSessionWorkflow,
    createRunFromTemplate,
    replaceRun,
    configureExecutor,
    persistRunSnapshot,
    runExecutor,
    bindRunToSession,
    clearSessionBinding,
    setActiveRun,
    setRunExecutionMode,
    applyCheckpointDecision,
    syncRunToSession,
    describeRun,
    clearAll,
  }
})
