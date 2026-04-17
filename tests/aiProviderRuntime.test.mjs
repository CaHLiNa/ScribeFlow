import test from 'node:test'
import assert from 'node:assert/strict'

import { getAiProviderAdapter } from '../src/services/ai/runtime/providerRegistry.js'
import {
  resolveAnthropicSdkAutoAllowedTools,
  resolveAnthropicSdkAvailableTools,
} from '../src/services/ai/runtime/anthropicSdkPolicy.js'
import { shouldFallbackFromAnthropicSdk } from '../src/services/ai/runtime/anthropicSdkRuntime.js'
import {
  normalizeAnthropicBaseUrl,
  normalizeGoogleBaseUrl,
  normalizeOpenAiBaseUrl,
} from '../src/services/ai/runtime/urlUtils.js'
import { runAiProviderRuntime } from '../src/services/ai/runtime/providerRuntime.js'

test('provider registry maps shipped providers to the expected adapters', () => {
  assert.equal(getAiProviderAdapter('anthropic').providerType, 'anthropic')
  assert.equal(getAiProviderAdapter('google').providerType, 'google')
  assert.equal(getAiProviderAdapter('deepseek').providerType, 'deepseek')
  assert.equal(getAiProviderAdapter('unknown-provider').providerType, 'custom')
})

test('provider runtime URL helpers normalize anthropic google and openai-like base URLs', () => {
  assert.equal(
    normalizeAnthropicBaseUrl('https://api.anthropic.com/v1/messages'),
    'https://api.anthropic.com/v1'
  )
  assert.equal(
    normalizeGoogleBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai'),
    'https://generativelanguage.googleapis.com'
  )
  assert.equal(
    normalizeOpenAiBaseUrl('https://api.deepseek.com/v1/chat/completions'),
    'https://api.deepseek.com/v1'
  )
})

test('anthropic sdk fallback helper only catches bridge availability failures', () => {
  assert.equal(
    shouldFallbackFromAnthropicSdk(new Error('Anthropic SDK bridge script is unavailable.')),
    true
  )
  assert.equal(
    shouldFallbackFromAnthropicSdk(
      new Error("Cannot find package '@anthropic-ai/claude-agent-sdk'")
    ),
    true
  )
  assert.equal(shouldFallbackFromAnthropicSdk(new Error('authentication failed')), false)
})

test('anthropic sdk policy resolves available and auto-allowed tools from per-tool rules', () => {
  const available = resolveAnthropicSdkAvailableTools({
    toolPolicies: {
      Read: 'allow',
      Grep: 'allow',
      Bash: 'deny',
      Edit: 'ask',
    },
  })
  const autoAllowed = resolveAnthropicSdkAutoAllowedTools({
    toolPolicies: {
      Read: 'allow',
      Grep: 'allow',
      Bash: 'deny',
      Edit: 'ask',
    },
  })

  assert.equal(available.includes('Bash'), false)
  assert.equal(available.includes('Edit'), true)
  assert.deepEqual(autoAllowed.includes('Read'), true)
  assert.deepEqual(autoAllowed.includes('Edit'), false)
})

test('anthropic sdk policy can auto-allow every available tool for bypass sessions', () => {
  const available = resolveAnthropicSdkAvailableTools({
    toolPolicies: {
      Read: 'allow',
      Edit: 'ask',
      Bash: 'deny',
    },
  })
  const autoAllowed = resolveAnthropicSdkAutoAllowedTools({
    autoAllowAll: true,
    toolPolicies: {
      Read: 'allow',
      Edit: 'ask',
      Bash: 'deny',
    },
  })

  assert.deepEqual(autoAllowed.sort(), available.sort())
})

test('provider runtime prefers Anthropic SDK transport when sdk mode succeeds', async () => {
  let sseCalls = 0
  const events = []

  const result = await runAiProviderRuntime({
    providerId: 'anthropic',
    config: {
      sdk: {
        runtimeMode: 'sdk',
      },
    },
    apiKey: 'test',
    userMessage: 'Inspect the workspace.',
    systemMessage: 'You are Altals Agent.',
    contextBundle: {
      workspace: {
        available: true,
        path: '/workspace',
      },
    },
    anthropicSdkRunner: async ({ onEvent }) => {
      onEvent?.({
        type: 'permission_request',
        requestId: 'request-1',
        streamId: 'stream-1',
        transport: 'anthropic-sdk',
      })
      return {
        content: 'Done',
        reasoning: '',
        stopReason: 'end_turn',
        toolRounds: [],
        transport: 'anthropic-sdk',
      }
    },
    sseRunner: async () => {
      sseCalls += 1
      return {
        content: '',
        reasoning: '',
        stopReason: '',
        toolCalls: [],
      }
    },
    onEvent: (event) => {
      events.push(event)
    },
  })

  assert.equal(sseCalls, 0)
  assert.equal(result.transport, 'anthropic-sdk')
  assert.equal(events[0].transport, 'anthropic-sdk')
})

test('provider runtime falls back to SSE when Anthropic SDK is unavailable', async () => {
  let sseCalls = 0

  const result = await runAiProviderRuntime({
    providerId: 'anthropic',
    config: {
      sdk: {
        runtimeMode: 'sdk',
      },
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet',
    },
    apiKey: 'test',
    history: [],
    userMessage: 'Inspect the workspace.',
    systemMessage: 'You are Altals Agent.',
    anthropicSdkRunner: async () => {
      throw new Error('Anthropic SDK bridge script is unavailable.')
    },
    sseRunner: async () => {
      sseCalls += 1
      return {
        content: 'Fallback answer',
        reasoning: '',
        stopReason: 'end_turn',
        toolCalls: [],
      }
    },
    resolveRuntimeTools: () => ({
      tools: [],
      executors: {},
    }),
  })

  assert.equal(sseCalls, 1)
  assert.equal(result.content, 'Fallback answer')
})

test('provider runtime forces create workspace file tool choice for openai-compatible file creation requests', async () => {
  const capturedRequests = []

  await runAiProviderRuntime({
    providerId: 'custom',
    config: {
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'gpt-5.4',
    },
    apiKey: 'test',
    userMessage: '在工作区创建 notes/test.md，写入 OK，并打开它',
    systemMessage: 'You are Altals Agent.',
    resolveRuntimeTools: () => ({
      tools: [
        {
          name: 'create_workspace_file',
          description: 'Create file',
          parameters: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'write_workspace_file',
          description: 'Write file',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      ],
      executors: new Map([
        [
          'create_workspace_file',
          async () => ({
            toolCallId: 'tool-1',
            content: '{"ok":true}',
            isError: false,
          }),
        ],
      ]),
    }),
    sseRunner: async ({ request }) => {
      capturedRequests.push(JSON.parse(request.body))
      if (capturedRequests.length === 1) {
        return {
          content: '',
          reasoning: '',
          stopReason: 'tool_use',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'create_workspace_file',
              arguments: { path: 'notes/test.md' },
            },
          ],
        }
      }

      return {
        content: 'done',
        reasoning: '',
        stopReason: 'end_turn',
        toolCalls: [],
      }
    },
  })

  assert.deepEqual(capturedRequests[0].tool_choice, {
    type: 'function',
    name: 'create_workspace_file',
  })
  assert.equal(capturedRequests[1].tool_choice, undefined)
})

test('provider runtime forces delete workspace path tool choice for delete requests', async () => {
  let capturedRequest = null

  await runAiProviderRuntime({
    providerId: 'custom',
    config: {
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'gpt-5.4',
    },
    apiKey: 'test',
    userMessage: '删除刚才新建的 notes/test.md',
    systemMessage: 'You are Altals Agent.',
    resolveRuntimeTools: () => ({
      tools: [
        {
          name: 'create_workspace_file',
          description: 'Create file',
          parameters: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'delete_workspace_path',
          description: 'Delete file',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      ],
      executors: new Map(),
    }),
    sseRunner: async ({ request }) => {
      capturedRequest = JSON.parse(request.body)
      return {
        content: '',
        reasoning: '',
        stopReason: 'tool_use',
        toolCalls: [],
      }
    },
  })

  assert.deepEqual(capturedRequest.tool_choice, {
    type: 'function',
    name: 'delete_workspace_path',
  })
})
