import test from 'node:test'
import assert from 'node:assert/strict'

import { createChatRuntimeConfigRuntime } from '../src/domains/chat/chatRuntimeConfigRuntime.js'

test('chat runtime config runtime throws when a non-opencode runtime has no access', async () => {
  const runtime = createChatRuntimeConfigRuntime({
    getWorkspace: () => ({ path: '/workspace/demo' }),
    getLiveSession: () => null,
    buildChatRuntimeConfigImpl: async () => ({ access: null, runtimeId: 'anthropic' }),
    noApiKeyMessageImpl: (modelId) => `Missing key for ${modelId}`,
  })

  await assert.rejects(
    runtime.buildConfig({ id: 's1', modelId: 'sonnet' }),
    /Missing key for sonnet/
  )
})

test('chat runtime config runtime updates runtime metadata on the live session', async () => {
  const session = { id: 's1', label: 'Chat 1' }
  const runtime = createChatRuntimeConfigRuntime({
    getWorkspace: () => ({ path: '/workspace/demo' }),
    getLiveSession: () => session,
    buildChatRuntimeConfigImpl: async () => ({
      access: { provider: 'anthropic' },
      provider: 'anthropic',
      thinkingConfig: { budgetTokens: 2048 },
      systemPrompt: 'prompt',
      toolRole: 'general',
      toolProfile: null,
      allowedTools: ['search'],
      initialToolChoice: 'required',
      runtimeId: 'native',
      strictRuntime: false,
      runtimeSessionId: 'runtime-1',
      opencodeEndpoint: null,
      opencodeIdleDisposeMs: null,
      sessionLabel: 'Chat 1',
    }),
  })

  const config = await runtime.buildConfig(session)
  config.onRuntimeMeta({
    runtimeId: 'opencode',
    strictRuntime: true,
    runtimeSessionId: 'runtime-2',
  })

  assert.equal(config.workspace.path, '/workspace/demo')
  assert.deepEqual(session._ai, {
    role: 'general',
    source: 'chat',
    label: 'Chat 1',
    runtimeId: 'opencode',
    strictRuntime: true,
    runtimeSessionId: 'runtime-2',
  })
  assert.equal(config.initialToolChoice, 'required')
})

test('chat runtime config runtime tracks input tokens and records usage with cost', async () => {
  const recorded = []
  const session = { id: 's1', label: 'Chat 1', _lastInputTokens: 5 }
  const runtime = createChatRuntimeConfigRuntime({
    getWorkspace: () => ({ path: '/workspace/demo' }),
    getLiveSession: () => session,
    buildChatRuntimeConfigImpl: async () => ({
      access: { provider: 'anthropic' },
      provider: 'anthropic',
      thinkingConfig: null,
      systemPrompt: 'prompt',
      toolRole: 'general',
      toolProfile: null,
      allowedTools: null,
      runtimeId: 'native',
      strictRuntime: false,
      runtimeSessionId: null,
      opencodeEndpoint: null,
      opencodeIdleDisposeMs: null,
      sessionLabel: 'Chat 1',
    }),
    calculateCostImpl: () => 9.5,
    recordUsageEntryImpl: (payload) => {
      recorded.push(payload)
    },
  })

  const config = await runtime.buildConfig(session)
  const usage = { input_total: 42, output_total: 7, cost: 0 }
  config.onUsage(usage, 'sonnet')

  assert.equal(usage.cost, 9.5)
  assert.equal(session._lastInputTokens, 42)
  assert.equal(recorded.length, 1)
  assert.equal(recorded[0].provider, 'anthropic')
  assert.equal(recorded[0].sessionId, 's1')
})

test('chat runtime config runtime allows opencode without API access', async () => {
  const session = { id: 's1', label: 'Chat 1' }
  const runtime = createChatRuntimeConfigRuntime({
    getWorkspace: () => ({ path: '/workspace/demo' }),
    getLiveSession: () => session,
    buildChatRuntimeConfigImpl: async () => ({
      access: null,
      provider: null,
      thinkingConfig: null,
      systemPrompt: 'prompt',
      toolRole: 'general',
      toolProfile: null,
      allowedTools: null,
      runtimeId: 'opencode',
      strictRuntime: true,
      runtimeSessionId: 'runtime-1',
      opencodeEndpoint: 'http://localhost:3000',
      opencodeIdleDisposeMs: 1234,
      sessionLabel: 'Chat 1',
    }),
  })

  const config = await runtime.buildConfig(session)
  const usage = { input_total: 0 }
  config.onUsage(usage, 'opencode-model')

  assert.equal(config.runtimeId, 'opencode')
  assert.equal(usage.cost, 0)
})
