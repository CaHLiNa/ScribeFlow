import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getConfigurableAiTools,
  normalizeEnabledAiToolIds,
  resolveEnabledAiTools,
} from '../src/services/ai/toolRegistry.js'

test('normalizeEnabledAiToolIds keeps explicit empty arrays and defaults when unset', () => {
  assert.deepEqual(normalizeEnabledAiToolIds(undefined), [])
  assert.deepEqual(normalizeEnabledAiToolIds([]), [])
})

test('resolveEnabledAiTools filters the registry to enabled tool ids', () => {
  const tools = resolveEnabledAiTools(['open-note-draft'])

  assert.equal(tools.some((tool) => tool.id === 'open-note-draft'), true)
  assert.equal(tools.some((tool) => tool.id === 'create-workspace-file'), true)
})

test('getConfigurableAiTools only exposes risky tools for settings toggles', () => {
  const tools = getConfigurableAiTools()
  assert.deepEqual(
    tools.map((tool) => tool.id),
    ['delete-workspace-path']
  )
})
