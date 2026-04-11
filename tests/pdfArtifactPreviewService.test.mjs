import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const servicePath = path.join(repoRoot, 'src/services/pdf/artifactPreview.js')
const serviceSource = readFileSync(servicePath, 'utf8')

test('latex pdf sync delegates to backend synctex commands', () => {
  assert.match(serviceSource, /invoke\('synctex_forward'/)
  assert.match(serviceSource, /requestLatexWorkshopBackwardSync/)
})
