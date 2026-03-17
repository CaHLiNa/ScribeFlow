import { generateText, streamText } from 'ai'
import { useWorkspaceStore } from '../stores/workspace'
import { resolveApiAccess } from './apiClient'
import { createModel, convertSdkUsage } from './aiSdk'
import { createTauriFetch } from './tauriFetch'
import { calculateCost } from './tokenUsage'
import { isUsageBudgetExceeded, recordUsageEntry } from './usageAccess'

/**
 * Creates a provider for @superdoc-dev/ai AIActions.
 * Uses AI SDK generateText (non-streaming) and streamText (streaming).
 */
export function createDocxAIProvider(modelId) {
  return {
    streamResults: false,

    async getCompletion(messages, options) {
      const workspace = useWorkspaceStore()
      if (isUsageBudgetExceeded()) throw new Error('Monthly budget exceeded.')

      const access = await resolveApiAccess({ modelId }, workspace)
      if (!access) throw new Error('No API key configured for this model.')

      const tauriFetch = createTauriFetch()
      const model = createModel(access, tauriFetch)
      const provider = access.providerHint || access.provider

      const result = await generateText({
        model,
        system: options?.system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        maxOutputTokens: options?.maxTokens || 4096,
      })

      // Record usage
      if (result.usage) {
        const usage = convertSdkUsage(result.usage, result.providerMetadata, provider)
        usage.cost = calculateCost(usage, access.model, access.provider)
        void recordUsageEntry({ usage, feature: 'docx', provider: access.provider, modelId: access.model })
      }

      return result.text || ''
    },

    async *streamCompletion(messages, options) {
      const workspace = useWorkspaceStore()
      if (isUsageBudgetExceeded()) throw new Error('Monthly budget exceeded.')

      const access = await resolveApiAccess({ modelId }, workspace)
      if (!access) throw new Error('No API key configured for this model.')

      const tauriFetch = createTauriFetch()
      const model = createModel(access, tauriFetch)
      const provider = access.providerHint || access.provider

      const result = streamText({
        model,
        system: options?.system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        maxOutputTokens: options?.maxTokens || 4096,
        onFinish({ usage, providerMetadata }) {
          if (usage) {
            const normalized = convertSdkUsage(usage, providerMetadata, provider)
            normalized.cost = calculateCost(normalized, access.model, access.provider)
            void recordUsageEntry({
              usage: normalized,
              feature: 'docx',
              provider: access.provider,
              modelId: access.model,
            })
          }
        },
      })

      for await (const chunk of result.textStream) {
        yield chunk
      }
    },
  }
}
