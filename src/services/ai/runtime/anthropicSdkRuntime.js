import { runAnthropicAgentSdkBridge } from './anthropicSdkBridge.js'
import {
  normalizeAnthropicSdkConfig,
  resolveAnthropicSdkAutoAllowedTools,
  resolveAnthropicSdkAvailableTools,
} from './anthropicSdkPolicy.js'

export function shouldFallbackFromAnthropicSdk(error = null) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /Anthropic SDK bridge script is unavailable/i.test(message)
    || /Cannot find package '@anthropic-ai\/claude-agent-sdk'/i.test(message)
    || /Cannot find module '@anthropic-ai\/claude-agent-sdk'/i.test(message)
    || /Anthropic Agent SDK is not installed/i.test(message)
    || /Failed to spawn Anthropic Agent SDK bridge/i.test(message)
    || /No such file or directory/i.test(message)
}

export async function runAnthropicAgentSdkRuntime({
  config = {},
  apiKey = '',
  userMessage = '',
  systemMessage = '',
  contextBundle = {},
  onEvent,
  signal,
} = {}) {
  const sdkConfig = normalizeAnthropicSdkConfig(config?.sdk)
  const response = await runAnthropicAgentSdkBridge(
    {
      apiKey,
      baseUrl: String(config.baseUrl || '').trim(),
      model: String(config.model || '').trim(),
      prompt: String(userMessage || '').trim(),
      systemPrompt: String(systemMessage || '').trim(),
      cwd: String(contextBundle?.workspace?.path || '').trim(),
      tools: resolveAnthropicSdkAvailableTools(sdkConfig),
      allowedTools: resolveAnthropicSdkAutoAllowedTools(sdkConfig),
      approvalMode: sdkConfig.approvalMode,
      permissionMode:
        sdkConfig.approvalMode === 'plan'
          ? 'plan'
          : (sdkConfig.autoAllowAll ? 'bypassPermissions' : 'acceptEdits'),
      toolPolicies: sdkConfig.toolPolicies,
      maxTurns: 8,
    },
    {
      onEvent,
      signal,
    }
  )

  return {
    content: String(response?.content || ''),
    reasoning: String(response?.reasoning || ''),
    stopReason: String(response?.stopReason || ''),
    toolRounds: [],
    transport: 'anthropic-sdk',
  }
}
