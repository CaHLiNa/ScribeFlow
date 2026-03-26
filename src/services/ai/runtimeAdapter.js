import { DirectChatTransport, ToolLoopAgent, stepCountIs } from 'ai'
import { createModel, buildProviderOptions, convertSdkUsage } from '../aiSdk'
import { createTauriFetch } from '../tauriFetch'
import { getAiTools } from '../chatTools'
import { resolveAllowedToolNames } from './toolRegistry'
import { sendWithOpencodeRuntime } from './opencodeAdapter'

export const AI_RUNTIME_IDS = {
  LEGACY: 'legacy',
  OPENCODE: 'opencode',
}

export const DEFAULT_AI_RUNTIME_ID = AI_RUNTIME_IDS.LEGACY

export function normalizeRuntimeId(runtimeId) {
  const value = String(runtimeId || '').trim().toLowerCase()
  if (value === AI_RUNTIME_IDS.OPENCODE) return AI_RUNTIME_IDS.OPENCODE
  return AI_RUNTIME_IDS.LEGACY
}

function buildLegacyTools(config) {
  const allowedTools = resolveAllowedToolNames({
    profile: config.toolProfile,
    role: config.toolRole,
    allowedTools: config.allowedTools,
  })

  return {
    ...getAiTools(config.workspace, { allowedTools }),
    ...config.extraTools,
  }
}

function createLegacyAgent(config) {
  const tauriFetch = createTauriFetch()
  const model = createModel(config.access, tauriFetch)
  const tools = buildLegacyTools(config)
  const providerOptions = buildProviderOptions(config.thinkingConfig, config.provider)

  return new ToolLoopAgent({
    model,
    tools,
    instructions: config.systemPrompt,
    toolChoice: config.toolChoice || 'auto',
    stopWhen: stepCountIs(config.maxSteps || 15),
    providerOptions,
    prepareStep({ steps, messages }) {
      const preparedStep = {}
      if (steps.length === 0 && config.initialToolChoice) {
        preparedStep.toolChoice = config.initialToolChoice
      }

      // Only re-inject native PDF parts from the last tool loop step.
      const lastStep = steps[steps.length - 1]
      if (!lastStep) {
        return Object.keys(preparedStep).length > 0 ? preparedStep : undefined
      }

      const pdfParts = []
      for (const toolResult of lastStep.toolResults) {
        if (toolResult.output?._type === 'pdf' && toolResult.output.base64) {
          pdfParts.push({
            type: 'file',
            data: toolResult.output.base64,
            mediaType: 'application/pdf',
            filename: toolResult.output.filename,
          })
        }
      }

      if (pdfParts.length === 0) {
        return Object.keys(preparedStep).length > 0 ? preparedStep : undefined
      }

      preparedStep.messages = [
        ...messages,
        { role: 'user', content: pdfParts },
      ]
      return preparedStep
    },
    onStepFinish(event) {
      if (config.onUsage && event.usage) {
        const normalized = convertSdkUsage(event.usage, event.providerMetadata, config.provider)
        config.onUsage(normalized, config.access.model)
      }
    },
  })
}

export async function sendWithLegacyRuntime({ config, messages, abortSignal }) {
  const agent = createLegacyAgent(config)
  const transport = new DirectChatTransport({ agent, sendReasoning: true })
  return await transport.sendMessages({ messages, abortSignal })
}

export async function sendWithRuntimeAdapter({ config, messages, abortSignal }) {
  const runtimeId = normalizeRuntimeId(config?.runtimeId)

  if (runtimeId === AI_RUNTIME_IDS.OPENCODE) {
    try {
      return await sendWithOpencodeRuntime({
        config,
        messages,
        abortSignal,
        trigger: config?.trigger,
        messageId: config?.messageId,
      })
    } catch (error) {
      if (config?.strictRuntime || !config?.access) throw error
      console.warn('[ai-runtime] opencode runtime unavailable, falling back to legacy runtime:', error)
    }
  }

  return await sendWithLegacyRuntime({ config, messages, abortSignal })
}
