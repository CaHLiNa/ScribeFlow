import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_PROVIDER_DEFINITIONS,
  createDefaultAiConfig,
  getAiProviderConfig,
  normalizeAiConfig,
  normalizeAiProviderId,
  resolveAiKeychainKey,
} from '../src/services/ai/settings.js'

test('normalizeAiProviderId migrates legacy openai-compatible ids and unknown ids', () => {
  assert.equal(normalizeAiProviderId('openai-compatible'), 'openai')
  assert.equal(normalizeAiProviderId('deepseek'), 'deepseek')
  assert.equal(normalizeAiProviderId('unknown-provider'), 'custom')
})

test('createDefaultAiConfig includes all shipped provider presets', () => {
  const config = createDefaultAiConfig()

  assert.equal(
    Object.keys(config.providers).length,
    AI_PROVIDER_DEFINITIONS.length
  )
  assert.equal(config.currentProviderId, 'openai')
  assert.equal(config.providers.openai.baseUrl, 'https://api.openai.com/v1')
  assert.equal(config.providers.custom.baseUrl, '')
  assert.ok(Array.isArray(config.enabledTools))
  assert.ok(config.enabledTools.length > 0)
})

test('normalizeAiConfig migrates the legacy single-provider shape into the multi-provider map', () => {
  const config = normalizeAiConfig({
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1/',
    model: 'gpt-4.1-mini',
    temperature: 0.4,
    _apiKeyFallback: 'sk-legacy',
    _credentialStorage: 'mirrored-file-fallback',
  })

  assert.equal(config.currentProviderId, 'openai')
  assert.equal(config.providers.openai.baseUrl, 'https://api.openai.com/v1')
  assert.equal(config.providers.openai.model, 'gpt-4.1-mini')
  assert.equal(config._apiKeyFallbacks.openai, 'sk-legacy')
  assert.equal(config._credentialStorage.openai, 'mirrored-file-fallback')
  assert.ok(config.enabledTools.length > 0)
})

test('getAiProviderConfig returns normalized defaults for providers not yet configured', () => {
  const config = createDefaultAiConfig()
  const providerConfig = getAiProviderConfig(config, 'anthropic')

  assert.equal(providerConfig.providerId, 'anthropic')
  assert.equal(providerConfig.baseUrl, 'https://api.anthropic.com/v1')
  assert.equal(providerConfig.temperature, 0.2)
  assert.equal(providerConfig.sdk.runtimeMode, 'sdk')
  assert.equal(providerConfig.sdk.approvalMode, 'per-tool')
  assert.equal(providerConfig.sdk.toolPolicies.Read, 'allow')
  assert.equal(providerConfig.sdk.toolPolicies.Bash, 'deny')
})

test('normalizeAiConfig preserves anthropic sdk runtime and tool policy overrides', () => {
  const config = normalizeAiConfig({
    currentProviderId: 'anthropic',
    providers: {
      anthropic: {
        baseUrl: 'https://api.anthropic.com/v1/',
        model: 'claude-sonnet-4-6',
        sdk: {
          runtimeMode: 'http',
          approvalMode: 'plan',
          toolPolicies: {
            Bash: 'ask',
            Read: 'deny',
          },
        },
      },
    },
  })

  assert.equal(config.providers.anthropic.sdk.runtimeMode, 'http')
  assert.equal(config.providers.anthropic.sdk.approvalMode, 'plan')
  assert.equal(config.providers.anthropic.sdk.toolPolicies.Bash, 'ask')
  assert.equal(config.providers.anthropic.sdk.toolPolicies.Read, 'deny')
  assert.equal(config.providers.anthropic.sdk.toolPolicies.Grep, 'allow')
})

test('resolveAiKeychainKey maps provider ids to isolated credential slots', () => {
  assert.equal(resolveAiKeychainKey('openai'), 'ai-api-key-openai')
  assert.equal(resolveAiKeychainKey('minimax'), 'ai-api-key-minimax')
  assert.equal(resolveAiKeychainKey('unknown-provider'), 'ai-api-key-custom')
})
