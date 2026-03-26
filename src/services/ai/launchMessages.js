import { shouldPreserveAiSessionLabel } from './sessionLabeling.js'

function hasPayloadContent(payload = {}) {
  if (String(payload.text || '').trim()) return true
  if (Array.isArray(payload.fileRefs) && payload.fileRefs.length > 0) return true
  if (payload.richHtml) return true
  return Boolean(payload.context?.text)
}

export function buildTaskSendPayload({
  ai = null,
  text = '',
  fileRefs = [],
  context = null,
  richHtml = null,
  hideFromTranscript = false,
} = {}) {
  return {
    text,
    fileRefs,
    context,
    richHtml,
    preserveLabel: shouldPreserveAiSessionLabel(ai),
    hideFromTranscript,
  }
}

export function buildWorkflowSendPayload({
  task = {},
  workflow = null,
  hideFromTranscript = false,
} = {}) {
  const launchContext = workflow?.run?.context || {}
  return {
    text: launchContext.prompt || task.prompt || '',
    fileRefs: launchContext.fileRefs || [],
    context: task.context || null,
    richHtml: task.richHtml || launchContext.richHtml || null,
    preserveLabel: true,
    hideFromTranscript,
  }
}

export async function autoSendWorkflowMessage({
  chatStore,
  sessionId,
  task,
  workflow,
  hideFromTranscript = false,
} = {}) {
  if (!sessionId || typeof chatStore?.sendMessage !== 'function') return false
  if (!workflow?.run?.context) return false

  const payload = buildWorkflowSendPayload({ task, workflow, hideFromTranscript })
  if (!hasPayloadContent(payload)) return false

  await chatStore.sendMessage(sessionId, payload)
  return true
}
