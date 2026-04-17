import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('latex store routes auto-build scheduling through Rust compile targets', () => {
  const source = fs.readFileSync(
    new URL('../src/stores/latex.js', import.meta.url),
    'utf8',
  )

  assert.match(source, /resolveLatexCompileTargetsForChange/)
  assert.match(source, /async scheduleAutoBuildForPath\(filePath, options = \{\}\)/)
  assert.match(source, /const targets = await resolveLatexCompileTargetsForChange\(filePath/)
  assert.match(source, /this\.scheduleCompileTarget\(/)
})

test('latex store routes compile queue transitions through Rust runtime commands', () => {
  const source = fs.readFileSync(
    new URL('../src/stores/latex.js', import.meta.url),
    'utf8',
  )

  assert.match(source, /resolveLatexCompileStart/)
  assert.match(source, /resolveLatexCompileFinish/)
  assert.match(source, /resolveLatexCompileFail/)
  assert.doesNotMatch(source, /_activeCompileTargets/)
  assert.doesNotMatch(source, /_recompileNeeded/)
})
