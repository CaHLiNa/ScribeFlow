import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const inventoryPath = new URL('../../docs/rust-migration/desktop-surface-inventory.md', import.meta.url)

test('desktop surface inventory document lists the current workspace panels', () => {
  const doc = readFileSync(inventoryPath, 'utf8')

  assert.match(doc, /Left sidebar/i)
  assert.match(doc, /Center workbench/i)
  assert.match(doc, /Right sidebar/i)
  assert.match(doc, /Workspace lifecycle/i)
  assert.match(doc, /Document workflow/i)
})
