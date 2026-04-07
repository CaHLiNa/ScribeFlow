import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const docPath = new URL('../../docs/rust-migration/runtime-contracts.md', import.meta.url)

test('runtime contract inventory records critical behavior families', () => {
  const doc = readFileSync(docPath, 'utf8')

  assert.match(doc, /workspace tree hydration/i)
  assert.match(doc, /editor state/i)
  assert.match(doc, /document build/i)
  assert.match(doc, /snapshots/i)
  assert.match(doc, /git history/i)
  assert.match(doc, /tauri command surface/i)
})
