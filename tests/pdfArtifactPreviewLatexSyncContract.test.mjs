import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const componentPath = path.join(repoRoot, 'src/components/editor/PdfArtifactPreview.vue')
const componentSource = readFileSync(componentPath, 'utf8')

test('latex pdf backward sync resolves reported files before dispatching to editors', () => {
  assert.match(componentSource, /resolveLatexSyncTargetPath/)
  assert.match(componentSource, /compileTargetPath: compileState\.value\?\.compileTargetPath \|\| ''/)
  assert.match(componentSource, /workspacePath: workspace\.path \|\| ''/)
  assert.match(componentSource, /file: resolvedFile \|\| result\.file/)
})

test('latex pdf preview self-heals missing synctex state from existing artifacts', () => {
  assert.match(componentSource, /async function ensureLatexSynctexState\(\)/)
  assert.match(componentSource, /!pdfPath \|\| String\(compileState\.value\?\.synctexPath \|\| ''\)\.trim\(\)/)
  assert.match(componentSource, /latexStore\.registerExistingArtifact\?\.\(props\.sourcePath, pdfPath/)
})

test('latex pdf forward sync uses viewport coordinates like latex-workshop before scrolling', () => {
  assert.match(componentSource, /scrollPdfPreviewToPoint/)
})

test('latex pdf preview bridges sync through iframe messages', () => {
  assert.match(componentSource, /channel: 'altals-latex-sync'/)
  assert.match(componentSource, /window\.addEventListener\('message', handleIframeViewerMessage\)/)
  assert.match(componentSource, /if \(data\.type === 'reverse_synctex'\)/)
  assert.match(componentSource, /postLatexViewerMessage\('synctex', \{ data: point \}\)/)
})

test('latex pdf backward sync captures surrounding selection text for source column recovery', () => {
  assert.match(componentSource, /resolveLatexPdfReverseSyncPayload/)
  assert.match(componentSource, /textBeforeSelection: String\(detail\.textBeforeSelection \|\| ''\)/)
  assert.match(componentSource, /textAfterSelection: String\(detail\.textAfterSelection \|\| ''\)/)
})
