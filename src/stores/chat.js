import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Chat } from '@ai-sdk/vue'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { nanoid } from './utils'
import { useWorkspaceStore } from './workspace'
import { events } from '../services/telemetry'
import { calculateCost } from '../services/tokenUsage'
import { cleanPartsForStorage } from '../services/aiSdk'
import { createChatTransport } from '../services/chatTransport'
import { appendUnresolvedCommentsToContent } from '../services/documentComments'
import { isUsageBudgetExceeded, recordUsageEntry } from '../services/usageAccess'
import { noApiKeyMessage } from '../utils/errorMessages'
import { useAiArtifactsStore } from './aiArtifacts'
import { useAiWorkflowRunsStore } from './aiWorkflowRuns'
import {
  buildPersistedChatSessionData,
  buildPersistedChatSessionMeta,
  hydratePersistedChatSession,
} from './chatSessionPersistence'
import { createChatPersistenceRuntime } from '../domains/chat/chatPersistenceRuntime'
import { createChatSessionLifecycleRuntime } from '../domains/chat/chatSessionLifecycleRuntime'
import { createChatLiveInstanceRuntime } from '../domains/chat/chatLiveInstanceRuntime'
import { createChatMessageRuntime } from '../domains/chat/chatMessageRuntime'
import { createChatRuntimeConfigRuntime } from '../domains/chat/chatRuntimeConfigRuntime'
import { createChatTitleRuntime, buildSmartChatSessionLabel } from '../domains/chat/chatTitleRuntime'
import { generateWorkspaceText } from '../services/ai/textGeneration'
import { buildChatRuntimeConfig } from '../services/ai/runtimeConfig'
import { shouldSkipAutoTitleForSession } from '../services/ai/sessionLabeling'
import { t } from '../i18n'
import {
  chatActiveSessionId,
  chatAllSessionsMeta,
  chatPendingPrefill,
  chatPendingSelection,
  chatSessions,
} from './chatSessionState.js'

// Chat instances live OUTSIDE Pinia (non-reactive container).
// Each Chat's internal messages/status use Vue ref() — reactive when accessed.
const chatInstances = new Map() // sessionId → Chat

export const useChatStore = defineStore('chat', () => {
  // ─── State ────────────────────────────────────────────────────────
  const sessions = chatSessions
  const activeSessionId = chatActiveSessionId
  const allSessionsMeta = chatAllSessionsMeta // [{ id, label, updatedAt, messageCount }]
  const _chatVersion = ref(0) // Reactive trigger — increment when Chat instances are created/destroyed
  // Prefill/selection queued for the next ChatInput to mount (handles async component timing)
  const pendingPrefill = chatPendingPrefill
  const pendingSelection = chatPendingSelection
  // Reactive map of messageId → richHtml (stored separately from AI SDK-owned message objects)
  const _richHtmlMap = ref(Object.create(null))
  let _chatPersistenceRuntime = null
  let _chatSessionLifecycleRuntime = null
  let _chatLiveInstanceRuntime = null
  let _chatMessageRuntime = null
  let _chatRuntimeConfigRuntime = null
  let _chatTitleRuntime = null

  function _stopArtifactSync(sessionId) {
    return _getChatLiveInstanceRuntime().stopArtifactSync(sessionId)
  }

  function _getChatPersistenceRuntime() {
    if (!_chatPersistenceRuntime) {
      _chatPersistenceRuntime = createChatPersistenceRuntime({
        getShouldersDir: () => useWorkspaceStore().shouldersDir,
        disposeAllChatInstances: () => {
          for (const [id, chat] of chatInstances) {
            try { chat.stop() } catch {
              // Best-effort cleanup during workspace/session reset.
            }
            _stopArtifactSync(id)
          }
          chatInstances.clear()
          _chatVersion.value++
        },
        replaceSessions: (nextSessions) => {
          sessions.value = nextSessions
        },
        setActiveSessionId: (sessionId) => {
          activeSessionId.value = sessionId
        },
        getAllSessionsMeta: () => allSessionsMeta.value,
        replaceAllSessionsMeta: (meta) => {
          allSessionsMeta.value = meta
        },
        clearAiArtifactsAll: () => useAiArtifactsStore().clearAll(),
        clearAiWorkflowRunsAll: () => useAiWorkflowRunsStore().clearAll(),
        createSession: (modelId) => createSession(modelId),
        getSession: (id) => sessions.value.find((session) => session.id === id) || null,
        getChatInstance: (id) => chatInstances.get(id) || null,
        syncRunToSession: (session) => useAiWorkflowRunsStore().syncRunToSession(session),
        cleanPartsForStorage,
        buildPersistedChatSessionData,
        buildPersistedChatSessionMeta,
        untitledLabel: () => t('Untitled'),
        invoke,
        clearPendingPrefill: () => {
          pendingPrefill.value = null
        },
        clearPendingSelection: () => {
          pendingSelection.value = null
        },
        clearRichHtmlMap: () => {
          _richHtmlMap.value = Object.create(null)
        },
      })
    }
    return _chatPersistenceRuntime
  }

  function _getChatSessionLifecycleRuntime() {
    if (!_chatSessionLifecycleRuntime) {
      _chatSessionLifecycleRuntime = createChatSessionLifecycleRuntime({
        getSessions: () => sessions.value,
        getAllSessionsMeta: () => allSessionsMeta.value,
        getActiveSessionId: () => activeSessionId.value,
        setActiveSessionId: (id) => {
          activeSessionId.value = id
        },
        getShouldersDir: () => useWorkspaceStore().shouldersDir,
        getDefaultModelId: () => {
          const workspace = useWorkspaceStore()
          const configDefault = workspace.modelsConfig?.models?.find((model) => model.default)?.id || 'sonnet'
          return workspace.selectedModelId || configDefault
        },
        createSessionId: () => nanoid(12),
        buildSessionLabel: (number) => t('Chat {number}', { number }),
        ensureChatInstance: (session) => getOrCreateChat(session),
        getChatInstance: (id) => chatInstances.get(id) || null,
        stopArtifactSync: (id) => _stopArtifactSync(id),
        clearSessionArtifacts: (id) => useAiArtifactsStore().clearSession(id),
        clearSessionBinding: (id) => useAiWorkflowRunsStore().clearSessionBinding(id),
        restoreSessionWorkflow: (id, workflow) => useAiWorkflowRunsStore().restoreSessionWorkflow(id, workflow),
        syncSessionArtifacts: (session, messages) => useAiArtifactsStore().syncSessionArtifacts(session, messages),
        disposeChatInstance: (id) => {
          const chat = chatInstances.get(id)
          if (chat) {
            try { chat.stop() } catch {
              // Best-effort cleanup for a single disposed live chat instance.
            }
            chatInstances.delete(id)
            _chatVersion.value++
          }
        },
        deletePersistedSession: (id) => {
          const shouldersDir = useWorkspaceStore().shouldersDir
          if (shouldersDir) {
            invoke('delete_path', { path: `${shouldersDir}/chats/${id}.json` }).catch(() => {})
          }
        },
        readPersistedSession: async (id) => {
          const shouldersDir = useWorkspaceStore().shouldersDir
          if (!shouldersDir) return null
          return invoke('read_file', { path: `${shouldersDir}/chats/${id}.json` })
        },
        hydratePersistedChatSession,
        saveSession: (id) => saveSession(id),
      })
    }
    return _chatSessionLifecycleRuntime
  }

  function _getChatMessageRuntime() {
    if (!_chatMessageRuntime) {
      _chatMessageRuntime = createChatMessageRuntime({
        getSession: (id) => sessions.value.find((session) => session.id === id) || null,
        getChatInstance: (id) => chatInstances.get(id) || null,
        getOrCreateChat: (session) => getOrCreateChat(session),
        isUsageBudgetExceeded,
        buildSessionLabel: (text) => buildSmartChatSessionLabel(text, { untitledLabel: t('New chat') }),
        appendUnresolvedCommentsToContent,
        nextTickImpl: () => nextTick(),
        setRichHtml: (messageId, html) => {
          _richHtmlMap.value = { ..._richHtmlMap.value, [messageId]: html }
        },
        chatSendEvent: (modelId) => events.chatSend(modelId),
      })
    }
    return _chatMessageRuntime
  }

  function _getChatTitleRuntime() {
    if (!_chatTitleRuntime) {
      _chatTitleRuntime = createChatTitleRuntime({
        getChatInstance: (id) => chatInstances.get(id) || null,
        getLiveSession: (id) => sessions.value.find((session) => session.id === id) || null,
        shouldSkipAutoTitleForSession,
        getWorkspace: () => useWorkspaceStore(),
        generateWorkspaceText,
        saveSession: (id) => saveSession(id),
        getTitleSystemPrompt: () => t('Generate a concise title (3-8 words) and 3-5 search keywords for this conversation. Return as JSON: {"title": "...", "keywords": ["...", "..."]}. No quotes or punctuation at the end of the title.'),
      })
    }
    return _chatTitleRuntime
  }

  function _getChatRuntimeConfigRuntime() {
    if (!_chatRuntimeConfigRuntime) {
      _chatRuntimeConfigRuntime = createChatRuntimeConfigRuntime({
        getWorkspace: () => useWorkspaceStore(),
        getLiveSession: (id) => sessions.value.find((session) => session.id === id) || null,
        buildChatRuntimeConfigImpl: buildChatRuntimeConfig,
        calculateCostImpl: calculateCost,
        recordUsageEntryImpl: recordUsageEntry,
        noApiKeyMessageImpl: noApiKeyMessage,
      })
    }
    return _chatRuntimeConfigRuntime
  }

  function _getChatLiveInstanceRuntime() {
    if (!_chatLiveInstanceRuntime) {
      _chatLiveInstanceRuntime = createChatLiveInstanceRuntime({
        getChatInstanceById: (id) => chatInstances.get(id) || null,
        setChatInstance: (id, chat) => {
          chatInstances.set(id, chat)
        },
        createChatTransportImpl: createChatTransport,
        buildConfig: (session) => _buildConfig(session),
        ChatCtor: Chat,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        watchImpl: watch,
        syncSessionArtifacts: (session, messages) => {
          useAiArtifactsStore().syncSessionArtifacts(session, messages)
        },
        saveSession: (id) => saveSession(id),
        maybeGenerateTitle: (session) => _maybeGenerateTitle(session),
        removeFromSessions: (id) => _removeFromSessions(id),
        createMessageId: () => `msg-${nanoid()}`,
        notifyInstanceMutation: () => {
          _chatVersion.value++
        },
      })
    }
    return _chatLiveInstanceRuntime
  }

  // ─── Getters ──────────────────────────────────────────────────────
  const activeSession = computed(() =>
    sessions.value.find(s => s.id === activeSessionId.value) || null
  )

  const streamingCount = computed(() => {
    let count = 0
    for (const [id, chat] of chatInstances) {
      const session = sessions.value.find(s => s.id === id)
      if (session?._background) {
        const status = chat.state.statusRef.value
        if (status === 'submitted' || status === 'streaming') count++
      }
    }
    return count
  })

  // ─── Chat Instance Management ───────────────────────────────────

  function getOrCreateChat(session) {
    return _getChatLiveInstanceRuntime().getOrCreateChat(session)
  }

  function getChatInstance(sessionId) {
    void _chatVersion.value // reactive dependency — re-evaluate when Chat instances change
    return _getChatLiveInstanceRuntime().getChatInstance(sessionId)
  }

  async function _buildConfig(session) {
    return _getChatRuntimeConfigRuntime().buildConfig(session)
  }

  // ─── Session Management ─────────────────────────────────────────

  function createSession(modelId) {
    return _getChatSessionLifecycleRuntime().createSession(modelId)
  }

  function setSessionAiMeta(id, ai = null) {
    return _getChatSessionLifecycleRuntime().setSessionAiMeta(id, ai)
  }

  async function deleteSession(id) {
    return _getChatSessionLifecycleRuntime().deleteSession(id)
  }

  async function reopenSession(id, opts = {}) {
    return _getChatSessionLifecycleRuntime().reopenSession(id, opts)
  }

  async function loadAllSessionsMeta() {
    return _getChatPersistenceRuntime().loadAllSessionsMeta()
  }

  function setActiveSession(id) {
    activeSessionId.value = id
  }

  async function archiveAndNewChat() {
    return _getChatSessionLifecycleRuntime().archiveAndNewChat()
  }

  async function _archiveCurrent() {
    return _getChatSessionLifecycleRuntime().archiveCurrent()
  }

  function _removeFromSessions(id) {
    return _getChatSessionLifecycleRuntime().removeFromSessions(id)
  }

  // ─── Messaging ──────────────────────────────────────────────────

  async function sendMessage(
    sessionId,
    { text, fileRefs, context, richHtml, preserveLabel = false, hideFromTranscript = false },
  ) {
    return _getChatMessageRuntime().sendMessage(sessionId, {
      text,
      fileRefs,
      context,
      richHtml,
      preserveLabel,
      hideFromTranscript,
    })
  }

  async function abortSession(sessionId) {
    return _getChatMessageRuntime().abortSession(sessionId)
  }

  async function _buildMessageTextAndFiles({ text, fileRefs, context }) {
    return _getChatMessageRuntime().buildMessageTextAndFiles({ text, fileRefs, context })
  }

  // ─── Persistence ────────────────────────────────────────────────

  async function loadSessions() {
    return _getChatPersistenceRuntime().loadSessions()
  }

  async function saveSession(id) {
    return _getChatPersistenceRuntime().saveSession(id)
  }

  function cleanup() {
    return _getChatPersistenceRuntime().cleanup()
  }

  // ─── Title Generation ──────────────────────────────────────────

  function _maybeGenerateTitle(session) {
    return _getChatTitleRuntime().maybeGenerateTitle(session)
  }

  async function _generateTitle(session) {
    return _getChatTitleRuntime().generateTitle(session)
  }

  // ─── Public API ─────────────────────────────────────────────────

  return {
    // State
    sessions,
    activeSessionId,
    allSessionsMeta,
    pendingPrefill,
    pendingSelection,

    // Getters
    activeSession,
    streamingCount,

    // Chat instance management
    getOrCreateChat,
    getChatInstance,

    // Session management
    createSession,
    setSessionAiMeta,
    deleteSession,
    reopenSession,
    loadAllSessionsMeta,
    setActiveSession,
    archiveAndNewChat,

    // Rich HTML for sent messages (reactive, separate from AI SDK message objects)
    getMsgRichHtml: (msgId) => _richHtmlMap.value[msgId] || null,

    // Messaging
    sendMessage,
    abortSession,

    // Persistence
    loadSessions,
    saveSession,

    // Lifecycle
    cleanup,
  }
})
