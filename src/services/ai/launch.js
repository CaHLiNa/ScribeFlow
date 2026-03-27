import { nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n/index.js'
import { useAiWorkflowRunsStore } from '../../stores/aiWorkflowRuns.js'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useWorkspaceStore } from '../../stores/workspace'
import { isAiLauncher } from '../../utils/fileTypes.js'
import { createSelectionAskTask } from './taskCatalog.js'
import { autoSendWorkflowMessage, buildTaskSendPayload } from './launchMessages.js'

async function readFileContent(path) {
  if (!path) return null
  try {
    return await invoke('read_file', { path })
  } catch {
    return null
  }
}

async function loadTexTypFixerModule() {
  return import('./texTypFixer.js')
}

function createAiSession({ chatStore, modelId, label, ai }) {
  const sessionId = chatStore.createSession(modelId)
  const session = chatStore.sessions.find((item) => item.id === sessionId)
  if (session && label) session.label = label
  if (ai) chatStore.setSessionAiMeta(sessionId, ai)
  return { sessionId, session }
}

function buildTaskAiMeta(task = {}, fallbackLabel = '') {
  return {
    ...task,
    source: task.source || 'launcher',
    label: task.label || fallbackLabel || t('General chat'),
    toolProfile: task.toolProfile || task.role || null,
    allowedTools: Array.isArray(task.allowedTools) && task.allowedTools.length > 0 ? [...task.allowedTools] : null,
    initialToolChoice: task.initialToolChoice || null,
  }
}

function getSession(chatStore, sessionId) {
  if (!sessionId) return null
  return chatStore.sessions.find((item) => item.id === sessionId) || null
}

function resolveAiSession({ chatStore, modelId, label, ai, sessionId = null }) {
  const existingSession = getSession(chatStore, sessionId)
  if (existingSession) {
    if (label) existingSession.label = label
    if (ai) chatStore.setSessionAiMeta(existingSession.id, ai)
    return { sessionId: existingSession.id, session: existingSession }
  }
  return createAiSession({ chatStore, modelId, label, ai })
}

function syncActiveWorkflowRun(sessionId) {
  const aiWorkflowRuns = useAiWorkflowRunsStore()
  const workflow = aiWorkflowRuns.getRunForSession(sessionId)
  if (workflow?.run?.id) {
    aiWorkflowRuns.setActiveRun(workflow.run.id)
  }
}

function normalizeAiLaunchSurface(surface = 'workbench') {
  if (surface === 'drawer') return 'workbench'
  if (surface === 'pane') return 'pane'
  return 'workbench'
}

async function openAiSession({ editorStore, chatStore, sessionId, paneId, beside = false, selection, prefill, surface = 'workbench' }) {
  const normalizedSurface = normalizeAiLaunchSurface(surface)

  if (normalizedSurface === 'workbench') {
    const aiWorkbench = useAiWorkbenchStore()
    chatStore.activeSessionId = sessionId
    if (prefill) chatStore.pendingPrefill = prefill
    if (selection) chatStore.pendingSelection = selection
    editorStore?.openAiWorkbenchSurface?.()
    syncActiveWorkflowRun(sessionId)
    aiWorkbench.openSession(sessionId)
    await nextTick()
    return sessionId
  }

  if (beside) {
    editorStore.openChatBeside({ sessionId, selection, prefill })
  } else {
    if (paneId) editorStore.setActivePane(paneId)
    editorStore.openChat({ sessionId, paneId, selection, prefill })
  }
  syncActiveWorkflowRun(sessionId)
  await nextTick()
  return sessionId
}

function dispatchPrefill(message) {
  if (!message) return
  window.dispatchEvent(new CustomEvent('chat-set-input', { detail: { message } }))
}

export function openAiLauncher({ editorStore, beside = true, paneId, surface = 'workbench' } = {}) {
  const normalizedSurface = normalizeAiLaunchSurface(surface)

  if (normalizedSurface === 'workbench') {
    const aiWorkbench = useAiWorkbenchStore()
    editorStore?.openAiWorkbenchSurface?.()
    aiWorkbench.openLauncher()
    return
  }

  const existing = typeof editorStore?._findLeaf === 'function'
    ? editorStore._findLeaf((node) => node.activeTab && isAiLauncher(node.activeTab))
    : null

  if (existing) {
    editorStore.setActivePane(existing.id)
    return
  }

  if (beside) {
    editorStore.openAiLauncherBeside()
    return
  }

  editorStore.openAiLauncher(paneId)
}

export function continueAiToWorkbench({ editorStore, sessionId = null } = {}) {
  const aiWorkbench = useAiWorkbenchStore()
  editorStore?.openAiWorkbenchSurface?.()
  if (sessionId) {
    aiWorkbench.openSession(sessionId)
  } else {
    aiWorkbench.openLauncher()
  }
}

function collectAiLauncherTabs(node, result = []) {
  if (!node) return result
  if (node.type === 'leaf') {
    for (const tab of node.tabs || []) {
      if (isAiLauncher(tab)) {
        result.push({ paneId: node.id, tab })
      }
    }
    return result
  }
  for (const child of node.children || []) {
    collectAiLauncherTabs(child, result)
  }
  return result
}

export function hasAiLauncherOpen(editorStore) {
  const workspace = useWorkspaceStore()
  const aiWorkbench = useAiWorkbenchStore()
  if (workspace.isAiSurface && aiWorkbench.view === 'launcher') return true
  if (!editorStore?.paneTree) return false
  return collectAiLauncherTabs(editorStore.paneTree).length > 0
}

export function toggleAiLauncher({ editorStore, beside = true, paneId, surface = 'workbench' } = {}) {
  const normalizedSurface = normalizeAiLaunchSurface(surface)

  if (normalizedSurface === 'workbench') {
    const aiWorkbench = useAiWorkbenchStore()
    editorStore?.openAiWorkbenchSurface?.()
    if (aiWorkbench.view === 'launcher' || aiWorkbench.view === 'chat') {
      aiWorkbench.openLauncher()
      return
    }
    openAiLauncher({ editorStore, beside, paneId, surface: normalizedSurface })
    return
  }

  const tabs = collectAiLauncherTabs(editorStore?.paneTree)
  if (tabs.length === 0) {
    openAiLauncher({ editorStore, beside, paneId, surface: normalizedSurface })
    return
  }

  for (const entry of tabs.reverse()) {
    editorStore.closeTab(entry.paneId, entry.tab)
  }
}

export async function startAiConversation({
  editorStore,
  chatStore,
  paneId,
  beside = false,
  surface = 'workbench',
  modelId,
  text,
  fileRefs,
  context,
  richHtml,
  label,
  ai,
}) {
  const { sessionId } = createAiSession({
    chatStore,
    modelId,
    label,
    ai: ai || buildTaskAiMeta({
      role: 'general',
      taskId: 'chat.freeform',
      source: 'launcher-input',
      toolProfile: null,
    }, label || t('General chat')),
  })

  await openAiSession({ editorStore, chatStore, sessionId, paneId, beside, surface })

  await chatStore.sendMessage(sessionId, buildTaskSendPayload({
    ai,
    text,
    fileRefs,
    context,
    richHtml,
  }))

  return sessionId
}

export async function prefillAiConversation({
  editorStore,
  chatStore,
  paneId,
  beside = false,
  surface = 'workbench',
  modelId,
  message,
  label,
  ai,
}) {
  const { sessionId } = createAiSession({
    chatStore,
    modelId,
    label,
    ai: ai || buildTaskAiMeta({
      role: 'general',
      taskId: 'chat.prefill',
      source: 'launcher',
      toolProfile: null,
    }, label || t('General chat')),
  })

  await openAiSession({ editorStore, chatStore, sessionId, paneId, beside, surface, prefill: message })
  if (normalizeAiLaunchSurface(surface) !== 'workbench') {
    dispatchPrefill(message)
  }
  return sessionId
}

async function buildWorkflowLaunchContext(task) {
  const fileRefs = [...(task.fileRefs || [])]
  if (task.filePath) {
    fileRefs.push({
      path: task.filePath,
      content: await readFileContent(task.filePath),
    })
  }

  const baseContext = task.context && typeof task.context === 'object'
    ? { ...task.context }
    : (task.context == null ? {} : { value: task.context })

  return {
    ...baseContext,
    currentFile: task.filePath || baseContext.file || baseContext.currentFile || null,
    fileRefs,
    prompt: task.prompt || null,
    richHtml: task.richHtml || null,
    taskId: task.taskId || null,
    role: task.role || 'general',
    toolProfile: task.toolProfile || task.role || null,
    source: task.source || 'launcher',
    entryContext: task.entryContext || null,
    artifactIntent: task.artifactIntent || null,
    label: task.label || null,
  }
}

export async function startWorkflowRun({
  chatStore,
  modelId,
  task,
  sessionId = null,
  autoSendMessage = true,
  hideAutoSendMessage = false,
}) {
  if (!task?.workflowTemplateId) return null

  const ai = buildTaskAiMeta(task, task.label || t('General chat'))
  const sessionState = resolveAiSession({
    chatStore,
    modelId,
    sessionId,
    label: ai.label,
    ai,
  })

  const aiWorkflowRuns = useAiWorkflowRunsStore()
  const workflow = aiWorkflowRuns.createRunFromTemplate({
    templateId: task.workflowTemplateId,
    sessionId: sessionState.sessionId,
    context: await buildWorkflowLaunchContext(task),
    autoRun: false,
    executionMode: task.executionMode || 'foreground',
  })

  if (sessionState.session) {
    sessionState.session._workflow = aiWorkflowRuns.syncRunToSession(sessionState.session)
  }

  if (autoSendMessage) {
    await autoSendWorkflowMessage({
      chatStore,
      sessionId: sessionState.sessionId,
      task,
      workflow,
      hideFromTranscript: hideAutoSendMessage,
    })
  }

  if (workflow?.run?.id && sessionState.sessionId) {
    await aiWorkflowRuns.runExecutor({
      runId: workflow.run.id,
      sessionId: sessionState.sessionId,
      queueIfRunning: false,
    })
  }

  if (sessionState.session) {
    sessionState.session._workflow = aiWorkflowRuns.syncRunToSession(sessionState.session)
  }

  return {
    sessionId: sessionState.sessionId,
    session: sessionState.session,
    workflow,
  }
}

export async function launchWorkflowTask({
  editorStore,
  chatStore,
  paneId,
  beside = false,
  surface = 'workbench',
  modelId,
  task,
  sessionId = null,
}) {
  const started = await startWorkflowRun({
    chatStore,
    modelId,
    task,
    sessionId,
  })
  if (!started) return null

  await openAiSession({
    editorStore,
    chatStore,
    sessionId: started.sessionId,
    paneId,
    beside,
    surface,
  })

  return started.sessionId
}

export async function launchAiTask({
  editorStore,
  chatStore,
  paneId,
  beside = false,
  surface = 'workbench',
  modelId,
  task,
}) {
  if (!task) return null
  let nextTask = task

  if (nextTask.role === 'tex_typ_fixer' && nextTask.filePath && !nextTask._preparedTexTypFixer) {
    const { prepareTexTypFixTask } = await loadTexTypFixerModule()
    nextTask = await prepareTexTypFixTask(nextTask)
  }

  if (nextTask.action === 'prefill') {
    return await prefillAiConversation({
      editorStore,
      chatStore,
      paneId,
      beside,
      surface,
      modelId,
      message: nextTask.prompt,
      label: nextTask.label,
      ai: buildTaskAiMeta(nextTask, nextTask.label),
    })
  }

  if (nextTask.action === 'workflow') {
    return await launchWorkflowTask({
      editorStore,
      chatStore,
      paneId,
      beside,
      surface,
      modelId,
      task: nextTask,
    })
  }

  const fileRefs = [...(nextTask.fileRefs || [])]
  if (nextTask.filePath) {
    fileRefs.push({
      path: nextTask.filePath,
      content: await readFileContent(nextTask.filePath),
    })
  }

  return await startAiConversation({
    editorStore,
    chatStore,
    paneId,
    beside,
    surface,
    modelId,
    text: nextTask.prompt,
    fileRefs,
    context: nextTask.context,
    richHtml: nextTask.richHtml,
    label: nextTask.label,
    ai: buildTaskAiMeta(nextTask, nextTask.label),
  })
}

export function buildSelectionPayload({ view, filePath }) {
  const selection = view?.state?.selection?.main
  if (!view || !selection || selection.from === selection.to) return null

  const doc = view.state.doc
  const text = doc.sliceString(selection.from, selection.to, '\n')
  const beforeStart = Math.max(0, selection.from - 200)
  const afterEnd = Math.min(doc.length, selection.to + 200)

  return {
    file: filePath,
    text,
    contextBefore: selection.from > 0 ? doc.sliceString(beforeStart, selection.from, '\n') : '',
    contextAfter: selection.to < doc.length ? doc.sliceString(selection.to, afterEnd, '\n') : '',
  }
}

export async function launchSelectionAsk({ editorStore, chatStore, filePath, view }) {
  const selection = buildSelectionPayload({ view, filePath })
  if (!selection) return false
  const ai = createSelectionAskTask()
  const { sessionId } = createAiSession({
    chatStore,
    label: ai.label,
    ai,
  })
  await openAiSession({
    editorStore,
    sessionId,
    beside: true,
    selection,
  })
  return true
}
