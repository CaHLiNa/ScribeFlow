import { nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n'
import { isAiLauncher } from '../../utils/fileTypes.js'
import { createSelectionAskTask } from './taskCatalog'
import { prepareTexTypFixTask } from './texTypFixer'

async function readFileContent(path) {
  if (!path) return null
  try {
    return await invoke('read_file', { path })
  } catch {
    return null
  }
}

function createAiSession({ chatStore, modelId, label, ai }) {
  const sessionId = chatStore.createSession(modelId)
  const session = chatStore.sessions.find((item) => item.id === sessionId)
  if (session && label) session.label = label
  if (ai) chatStore.setSessionAiMeta(sessionId, ai)
  return { sessionId, session }
}

async function openAiSession({ editorStore, sessionId, paneId, beside = false, selection, prefill }) {
  if (beside) {
    editorStore.openChatBeside({ sessionId, selection, prefill })
  } else {
    if (paneId) editorStore.setActivePane(paneId)
    editorStore.openChat({ sessionId, paneId, selection, prefill })
  }
  await nextTick()
  return sessionId
}

function dispatchPrefill(message) {
  if (!message) return
  window.dispatchEvent(new CustomEvent('chat-set-input', { detail: { message } }))
}

export function openAiLauncher({ editorStore, beside = true, paneId } = {}) {
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
  if (!editorStore?.paneTree) return false
  return collectAiLauncherTabs(editorStore.paneTree).length > 0
}

export function toggleAiLauncher({ editorStore, beside = true, paneId } = {}) {
  const tabs = collectAiLauncherTabs(editorStore?.paneTree)
  if (tabs.length === 0) {
    openAiLauncher({ editorStore, beside, paneId })
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
    ai: ai || {
      role: 'general',
      taskId: 'chat.freeform',
      source: 'launcher-input',
      label: label || t('General chat'),
      toolProfile: null,
    },
  })

  await openAiSession({ editorStore, sessionId, paneId, beside })

  await chatStore.sendMessage(sessionId, {
    text,
    fileRefs,
    context,
    richHtml,
  })

  return sessionId
}

export async function prefillAiConversation({
  editorStore,
  chatStore,
  paneId,
  beside = false,
  modelId,
  message,
  label,
  ai,
}) {
  const { sessionId } = createAiSession({
    chatStore,
    modelId,
    label,
    ai: ai || {
      role: 'general',
      taskId: 'chat.prefill',
      source: 'launcher',
      label: label || t('General chat'),
      toolProfile: null,
    },
  })

  await openAiSession({ editorStore, sessionId, paneId, beside })
  dispatchPrefill(message)
  return sessionId
}

export async function launchAiTask({
  editorStore,
  chatStore,
  paneId,
  beside = false,
  modelId,
  task,
}) {
  if (!task) return null
  let nextTask = task

  if (nextTask.role === 'tex_typ_fixer' && nextTask.filePath && !nextTask._preparedTexTypFixer) {
    nextTask = await prepareTexTypFixTask(nextTask)
  }

  if (nextTask.action === 'prefill') {
    return await prefillAiConversation({
      editorStore,
      chatStore,
      paneId,
      beside,
      modelId,
      message: nextTask.prompt,
      label: nextTask.label,
      ai: {
        ...nextTask,
        source: nextTask.source || 'launcher',
        label: nextTask.label,
        toolProfile: nextTask.toolProfile || nextTask.role || null,
      },
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
    modelId,
    text: nextTask.prompt,
    fileRefs,
    context: nextTask.context,
    richHtml: nextTask.richHtml,
    label: nextTask.label,
    ai: {
      ...nextTask,
      source: nextTask.source || 'launcher',
      label: nextTask.label,
      toolProfile: nextTask.toolProfile || nextTask.role || null,
    },
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
