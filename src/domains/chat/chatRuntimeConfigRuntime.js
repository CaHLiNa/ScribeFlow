export function createChatRuntimeConfigRuntime({
  getWorkspace,
  getLiveSession,
  buildChatRuntimeConfigImpl,
  calculateCostImpl,
  recordUsageEntryImpl,
  noApiKeyMessageImpl,
} = {}) {
  async function buildConfig(session) {
    const workspace = getWorkspace?.()
    const runtime = await buildChatRuntimeConfigImpl({ session, workspace })
    if (!runtime?.access && runtime?.runtimeId !== 'opencode') {
      throw new Error(noApiKeyMessageImpl(session.modelId))
    }

    const {
      access,
      provider,
      thinkingConfig,
      systemPrompt,
      toolRole,
      toolProfile,
      allowedTools,
      initialToolChoice,
      runtimeId,
      strictRuntime,
      runtimeSessionId,
      opencodeEndpoint,
      opencodeIdleDisposeMs,
      sessionLabel,
    } = runtime

    return {
      access,
      workspace,
      systemPrompt,
      thinkingConfig,
      provider,
      runtimeId,
      strictRuntime,
      runtimeSessionId,
      opencodeEndpoint,
      opencodeIdleDisposeMs,
      sessionLabel,
      toolRole,
      toolProfile,
      allowedTools,
      initialToolChoice,
      onRuntimeMeta: (updates = {}) => {
        const liveSession = getLiveSession?.(session.id)
        if (!liveSession) return
        if (!liveSession._ai) {
          liveSession._ai = {
            role: 'general',
            source: 'chat',
            label: liveSession.label,
          }
        }
        liveSession._ai = {
          ...liveSession._ai,
          runtimeId: updates.runtimeId || liveSession._ai.runtimeId || runtimeId || null,
          strictRuntime: updates.strictRuntime ?? liveSession._ai.strictRuntime ?? strictRuntime ?? false,
          runtimeSessionId: updates.runtimeSessionId || liveSession._ai.runtimeSessionId || runtimeSessionId || null,
        }
      },
      onUsage: (normalized, modelId) => {
        if (access?.provider && calculateCostImpl) {
          normalized.cost = calculateCostImpl(normalized, modelId, access.provider)
        } else {
          normalized.cost = normalized.cost || 0
        }

        if (normalized.input_total > 0) {
          const liveSession = getLiveSession?.(session.id)
          if (liveSession && normalized.input_total > (liveSession._lastInputTokens || 0)) {
            liveSession._lastInputTokens = normalized.input_total
          }
        }

        void recordUsageEntryImpl?.({
          usage: normalized,
          feature: 'chat',
          provider: access?.provider || provider || 'opencode',
          modelId,
          sessionId: session.id,
        })
      },
    }
  }

  return {
    buildConfig,
  }
}
