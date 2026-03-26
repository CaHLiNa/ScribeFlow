export function createChatSessionLifecycleRuntime({
  getSessions,
  getAllSessionsMeta,
  getActiveSessionId,
  setActiveSessionId,
  getShouldersDir,
  getDefaultModelId,
  createSessionId,
  buildSessionLabel,
  now = () => new Date().toISOString(),
  ensureChatInstance,
  getChatInstance,
  stopArtifactSync,
  clearSessionArtifacts,
  clearSessionBinding,
  restoreSessionWorkflow,
  syncSessionArtifacts,
  disposeChatInstance,
  deletePersistedSession,
  readPersistedSession,
  hydratePersistedChatSession,
  saveSession,
  warn = console.warn,
} = {}) {
  function sessions() {
    return getSessions?.() || []
  }

  function activeSession() {
    return sessions().find((session) => session.id === getActiveSessionId?.()) || null
  }

  function createSession(modelId) {
    const nextSessions = sessions()
    const id = createSessionId?.()
    const session = {
      id,
      label: buildSessionLabel?.(nextSessions.length + 1),
      modelId: modelId || getDefaultModelId?.(),
      messages: [],
      status: 'idle',
      createdAt: now(),
      updatedAt: now(),
      _ai: null,
      _workflow: null,
    }
    nextSessions.push(session)
    setActiveSessionId?.(id)
    ensureChatInstance?.(session)
    return id
  }

  function setSessionAiMeta(id, ai = null) {
    const session = sessions().find((item) => item.id === id)
    if (!session) return null
    session._ai = ai ? {
      role: ai.role || 'general',
      taskId: ai.taskId || null,
      source: ai.source || 'chat',
      label: ai.label || session.label,
      runtimeId: ai.runtimeId || null,
      strictRuntime: !!ai.strictRuntime,
      runtimeSessionId: ai.runtimeSessionId || null,
      toolProfile: ai.toolProfile || null,
      allowedTools: Array.isArray(ai.allowedTools) && ai.allowedTools.length > 0 ? [...ai.allowedTools] : null,
      initialToolChoice: ai.initialToolChoice || null,
      artifactIntent: ai.artifactIntent || null,
      entryContext: ai.entryContext || null,
      filePath: ai.filePath || null,
      seedArtifacts: Array.isArray(ai.seedArtifacts) ? ai.seedArtifacts.map((artifact) => ({ ...artifact })) : null,
    } : null

    const chat = getChatInstance?.(id)
    if (chat) {
      syncSessionArtifacts?.(session, chat.state.messagesRef.value)
    }

    return session
  }

  function removeFromSessions(id) {
    const nextSessions = sessions()
    const session = nextSessions.find((item) => item.id === id)
    if (!session) return

    stopArtifactSync?.(id)
    clearSessionArtifacts?.(id)
    clearSessionBinding?.(id)
    disposeChatInstance?.(id)

    const idx = nextSessions.indexOf(session)
    nextSessions.splice(idx, 1)
  }

  async function deleteSession(id) {
    const nextSessions = sessions()
    const session = nextSessions.find((item) => item.id === id) || null
    const meta = getAllSessionsMeta?.() || []
    const metaIdx = meta.findIndex((item) => item.id === id)

    stopArtifactSync?.(id)
    clearSessionArtifacts?.(id)
    clearSessionBinding?.(id)
    disposeChatInstance?.(id)

    if (session) {
      const idx = nextSessions.indexOf(session)
      if (idx !== -1) {
        nextSessions.splice(idx, 1)
      }
    }

    if (metaIdx !== -1) {
      meta.splice(metaIdx, 1)
    }

    deletePersistedSession?.(id)

    if (getActiveSessionId?.() === id) {
      setActiveSessionId?.(nextSessions.length > 0 ? nextSessions[nextSessions.length - 1].id : null)
    }
  }

  async function archiveCurrent() {
    const current = activeSession()
    if (!current) return

    const chat = getChatInstance?.(current.id)
    const hasMessages = chat
      ? chat.state.messagesRef.value.length > 0
      : current.messages.length > 0

    if (!hasMessages) return

    const isStreaming = chat && ['submitted', 'streaming'].includes(chat.state.statusRef.value)
    if (isStreaming) {
      current._background = true
    } else {
      await saveSession?.(current.id)
      removeFromSessions(current.id)
    }
  }

  async function archiveAndNewChat() {
    const current = activeSession()
    if (!current) return

    const chat = getChatInstance?.(current.id)
    const hasMessages = chat
      ? chat.state.messagesRef.value.length > 0
      : current.messages.length > 0

    if (!hasMessages) return

    await archiveCurrent()
    createSession()
  }

  async function reopenSession(id, opts = {}) {
    const existing = sessions().find((session) => session.id === id)
    if (existing) {
      if (existing._background) existing._background = false
      setActiveSessionId?.(id)
      return
    }

    if (!opts.skipArchive) {
      await archiveCurrent()
    }

    if (!getShouldersDir?.()) return

    try {
      const content = await readPersistedSession?.(id)
      const data = JSON.parse(content)
      const session = hydratePersistedChatSession?.(data)

      sessions().push(session)
      setActiveSessionId?.(id)
      if (session._workflow) {
        restoreSessionWorkflow?.(id, session._workflow)
      }

      ensureChatInstance?.(session)
    } catch (error) {
      warn?.('Failed to reopen session:', error)
    }
  }

  return {
    createSession,
    setSessionAiMeta,
    deleteSession,
    reopenSession,
    archiveAndNewChat,
    archiveCurrent,
    removeFromSessions,
  }
}
