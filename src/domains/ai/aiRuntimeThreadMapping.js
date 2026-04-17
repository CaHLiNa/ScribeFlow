import { t } from '../../i18n/index.js'

function toMs(timestamp = 0) {
  const numeric = Number(timestamp || 0)
  return numeric > 0 ? numeric * 1000 : Date.now()
}

function buildUserMessage(item = null) {
  const text = String(item?.text || '').trim()
  return {
    id: `runtime:${item?.turnId || item?.turn_id || 'turn'}:user`,
    role: 'user',
    createdAt: toMs(item?.createdAt || item?.created_at),
    content: text,
    parts: text
      ? [
          {
            type: 'text',
            text,
          },
        ]
      : [],
    metadata: {
      skillId: 'workspace-agent',
      skillLabel: t('Workspace agent'),
      contextChips: [],
    },
  }
}

function buildAssistantMessage(turn = null, assistantItem = null, reasoningItem = null) {
  const assistantText = String(assistantItem?.text || '').trim()
  const reasoningText = String(reasoningItem?.text || '').trim()
  const status = String(turn?.status || '').trim()
  const parts = []

  if (reasoningText) {
    parts.push({
      type: 'support',
      label: t('Reasoning'),
      text: reasoningText,
    })
  }

  if (assistantText) {
    parts.push({
      type: 'text',
      text: assistantText,
    })
  }

  if (!assistantText && status === 'failed') {
    parts.push({
      type: 'error',
      text: t('AI execution failed.'),
    })
  }

  if (!assistantText && status === 'interrupted') {
    parts.push({
      type: 'error',
      text: t('AI execution stopped.'),
    })
  }

  return {
    id: `runtime:${turn?.id || 'turn'}:assistant`,
    role: 'assistant',
    createdAt: toMs(assistantItem?.createdAt || assistantItem?.created_at || turn?.createdAt),
    content:
      assistantText ||
      (status === 'failed'
        ? t('AI execution failed.')
        : status === 'interrupted'
          ? t('AI execution stopped.')
          : ''),
    parts,
    metadata: {
      skillId: 'workspace-agent',
      skillLabel: t('Workspace agent'),
      providerSummary: 'CODEX RUNTIME',
      contextChips: [],
    },
  }
}

function normalizeRuntimeManagedRequest(request = {}, extra = {}) {
  const requestId = String(request?.requestId || request?.request_id || '').trim()
  if (!requestId) return null

  return {
    requestId,
    streamId: '',
    runtimeManaged: true,
    ...extra,
  }
}

export function buildSessionMessagesFromRuntimeSnapshot(snapshot = null) {
  const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : []
  const items = Array.isArray(snapshot?.items) ? snapshot.items : []
  const itemsByTurn = new Map()

  for (const item of items) {
    const turnId = String(item?.turnId || item?.turn_id || '').trim()
    if (!turnId) continue
    const list = itemsByTurn.get(turnId) || []
    list.push(item)
    itemsByTurn.set(turnId, list)
  }

  const messages = []
  for (const turn of turns) {
    const turnId = String(turn?.id || '').trim()
    if (!turnId) continue
    const turnItems = itemsByTurn.get(turnId) || []
    const userItem =
      turnItems.find((item) => String(item?.kind || '').trim() === 'userMessage') || null
    const assistantItem =
      turnItems.find((item) => String(item?.kind || '').trim() === 'agentMessage') || null
    const reasoningItem =
      turnItems.find((item) => String(item?.kind || '').trim() === 'reasoning') || null

    if (userItem) {
      messages.push(buildUserMessage(userItem))
    }

    if (
      assistantItem ||
      reasoningItem ||
      ['failed', 'interrupted'].includes(String(turn?.status || '').trim())
    ) {
      messages.push(buildAssistantMessage(turn, assistantItem, reasoningItem))
    }
  }

  return messages
}

export function buildSessionPermissionRequestsFromRuntimeSnapshot(snapshot = null) {
  const requests = Array.isArray(snapshot?.permissionRequests) ? snapshot.permissionRequests : []
  return requests
    .map((request) =>
      normalizeRuntimeManagedRequest(request, {
        toolName: String(request?.toolName || '').trim(),
        displayName: String(request?.displayName || request?.toolName || '').trim(),
        title: String(request?.title || '').trim(),
        description: String(request?.description || '').trim(),
        decisionReason: String(request?.decisionReason || '').trim(),
        inputPreview: String(request?.inputPreview || '').trim(),
      })
    )
    .filter(Boolean)
}

export function buildSessionAskUserRequestsFromRuntimeSnapshot(snapshot = null) {
  const requests = Array.isArray(snapshot?.askUserRequests) ? snapshot.askUserRequests : []
  return requests
    .map((request) =>
      normalizeRuntimeManagedRequest(request, {
        title: String(request?.title || '').trim(),
        prompt: String(request?.prompt || request?.question || '').trim(),
        description: String(request?.description || '').trim(),
        questions: Array.isArray(request?.questions) ? request.questions : [],
      })
    )
    .filter(Boolean)
}

export function buildSessionExitPlanRequestsFromRuntimeSnapshot(snapshot = null) {
  const requests = Array.isArray(snapshot?.exitPlanRequests) ? snapshot.exitPlanRequests : []
  return requests
    .map((request) =>
      normalizeRuntimeManagedRequest(request, {
        toolUseId: String(request?.turnId || request?.turn_id || '').trim(),
        title: String(request?.title || '').trim(),
        allowedPrompts: Array.isArray(request?.allowedPrompts) ? request.allowedPrompts : [],
      })
    )
    .filter(Boolean)
}

export function buildSessionPlanModeFromRuntimeSnapshot(snapshot = null) {
  return {
    active: snapshot?.planMode?.active === true,
    summary: String(snapshot?.planMode?.summary || '').trim(),
    note: String(snapshot?.planMode?.note || '').trim(),
  }
}
