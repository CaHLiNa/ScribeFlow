import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collectArtifactsFromMessage } from '../services/ai/artifacts'
import { t } from '../i18n'

export const useAiArtifactsStore = defineStore('aiArtifacts', () => {
  const bySession = ref({})

  function artifactsForSession(sessionId) {
    return bySession.value[sessionId] || []
  }

  function syncSessionArtifacts(session, messages = []) {
    if (!session?.id) return []

    const context = {
      role: session?._ai?.role || 'general',
      label: session?._ai?.label || session?.label || t('AI'),
      artifactIntent: session?._ai?.artifactIntent || null,
      filePath: session?._ai?.filePath || null,
      sourceFile: session?._ai?.filePath || null,
    }

    const nextArtifacts = [
      ...(Array.isArray(session?._ai?.seedArtifacts)
        ? session._ai.seedArtifacts.map((artifact, index) => ({
            id: artifact?.id || `seed:${session.id}:${index}`,
            messageId: null,
            toolName: null,
            ...artifact,
          }))
        : []),
    ]
    for (const message of messages || []) {
      if (message?.role !== 'assistant') continue
      nextArtifacts.push(...collectArtifactsFromMessage(message, context))
    }

    bySession.value = {
      ...bySession.value,
      [session.id]: nextArtifacts,
    }

    return nextArtifacts
  }

  function clearSession(sessionId) {
    if (!sessionId || !bySession.value[sessionId]) return
    const next = { ...bySession.value }
    delete next[sessionId]
    bySession.value = next
  }

  function clearAll() {
    bySession.value = {}
  }

  return {
    artifactsForSession,
    syncSessionArtifacts,
    clearSession,
    clearAll,
  }
})
