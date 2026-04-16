import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeEnabledAiToolIds, resolveEnabledAiTools } from '../src/services/ai/toolRegistry.js'

test('normalizeEnabledAiToolIds keeps explicit empty arrays and defaults when unset', () => {
  assert.equal(normalizeEnabledAiToolIds(undefined).length > 0, true)
  assert.deepEqual(normalizeEnabledAiToolIds([]), [])
})

test('resolveEnabledAiTools filters the registry to enabled tool ids', () => {
  const tools = resolveEnabledAiTools(['open-note-draft'])

  assert.equal(tools.length, 1)
  assert.equal(tools[0].id, 'open-note-draft')
})
