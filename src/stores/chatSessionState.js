import { ref } from 'vue'
import { nanoid } from './utils.js'

export const chatSessions = ref([])
export const chatActiveSessionId = ref(null)
export const chatAllSessionsMeta = ref([])
export const chatPendingPrefill = ref(null)
export const chatPendingSelection = ref(null)

export function createChatSessionRecord({
  modelId = null,
  label = 'Chat',
  id = nanoid(12),
  now = new Date().toISOString(),
} = {}) {
  return {
    id,
    label,
    modelId,
    messages: [],
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    _ai: null,
    _workflow: null,
  }
}

export function appendChatSession(session) {
  if (!session?.id) return null
  const existing = chatSessions.value.find((item) => item.id === session.id)
  if (!existing) {
    chatSessions.value.push(session)
  }
  chatActiveSessionId.value = session.id
  return session.id
}

export function setChatActiveSessionId(sessionId = null) {
  chatActiveSessionId.value = sessionId || null
}

export function setChatPendingPrefill(value = null) {
  chatPendingPrefill.value = value || null
}

export function setChatPendingSelection(value = null) {
  chatPendingSelection.value = value || null
}
