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
    shouldFallbackFromAnthropicSdk(new Error("Cannot find package '@anthropic-ai/claude-agent-sdk'")),
    true
  )
  assert.equal(
    shouldFallbackFromAnthropicSdk(new Error('authentication failed')),
    false
  )
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
