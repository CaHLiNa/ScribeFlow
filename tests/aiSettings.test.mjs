import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_PROVIDER_DEFINITIONS,
  createDefaultAiConfig,
  getAiProviderConfig,
  isAiProviderReady,
  normalizeAiConfig,
  normalizeAiProviderId,
  providerRequiresAiApiKey,
  providerUsesAutomaticModel,
  resolveAiKeychainKey,
  resolveAiProviderModel,
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
  assert.equal(config.providers.openai.model, 'gpt-5')
  assert.equal(config.providers.custom.baseUrl, '')
  assert.equal(config.providers.custom.model, '')
  assert.ok(Array.isArray(config.enabledTools))
  assert.deepEqual(config.enabledTools, [])
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
  assert.equal(config.providers.openai.model, 'gpt-5')
  assert.equal(config._apiKeyFallbacks.openai, 'sk-legacy')
  assert.equal(config._credentialStorage.openai, 'mirrored-file-fallback')
  assert.deepEqual(config.enabledTools, [])
})

test('normalizeAiConfig only preserves configurable risky tools from stored config', () => {
  const config = normalizeAiConfig({
    version: 4,
    enabledTools: ['read-workspace-file', 'delete-workspace-path'],
    providers: {},
  })

  assert.equal(config.enabledTools.includes('delete-workspace-path'), true)
  assert.equal(config.enabledTools.includes('read-workspace-file'), false)
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
  assert.equal(config.providers.anthropic.model, 'claude-sonnet-4-5')
})

test('resolveAiKeychainKey maps provider ids to isolated credential slots', () => {
  assert.equal(resolveAiKeychainKey('openai'), 'ai-api-key-openai')
  assert.equal(resolveAiKeychainKey('minimax'), 'ai-api-key-minimax')
  assert.equal(resolveAiKeychainKey('unknown-provider'), 'ai-api-key-custom')
})

test('built-in providers use automatic model resolution while custom providers keep manual model input', () => {
  assert.equal(providerUsesAutomaticModel('openai'), true)
  assert.equal(providerUsesAutomaticModel('anthropic'), true)
  assert.equal(providerUsesAutomaticModel('custom'), false)

  assert.equal(resolveAiProviderModel('openai', { model: 'gpt-5.4' }), 'gpt-5.4')
  assert.equal(resolveAiProviderModel('openai', {}), 'gpt-5')
  assert.equal(resolveAiProviderModel('anthropic', { model: 'claude-3-7-sonnet-latest' }), 'claude-3-7-sonnet-latest')
  assert.equal(resolveAiProviderModel('anthropic', {}), 'claude-sonnet-4-5')
  assert.equal(resolveAiProviderModel('custom', { model: 'my-local-model' }), 'my-local-model')
})

test('Anthropic SDK runtime does not require an API key to be ready', () => {
  const anthropicConfig = getAiProviderConfig(
    {
      currentProviderId: 'anthropic',
      providers: {
        anthropic: {
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'claude-sonnet-4-5',
          sdk: {
            runtimeMode: 'sdk',
          },
        },
      },
    },
    'anthropic'
  )

  assert.equal(providerRequiresAiApiKey('anthropic', anthropicConfig), false)
  assert.equal(isAiProviderReady('anthropic', anthropicConfig, ''), true)
})

test('Anthropic HTTP runtime still requires an API key to be ready', () => {
  const anthropicConfig = getAiProviderConfig(
    {
      currentProviderId: 'anthropic',
      providers: {
        anthropic: {
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'claude-sonnet-4-5',
          sdk: {
            runtimeMode: 'http',
          },
        },
      },
    },
    'anthropic'
  )

  assert.equal(providerRequiresAiApiKey('anthropic', anthropicConfig), true)
  assert.equal(isAiProviderReady('anthropic', anthropicConfig, ''), false)
  assert.equal(isAiProviderReady('anthropic', anthropicConfig, 'sk-test'), true)
})
