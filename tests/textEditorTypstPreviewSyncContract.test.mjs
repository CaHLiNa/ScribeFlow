import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const componentPath = path.join(repoRoot, 'src/components/editor/TextEditor.vue')
const componentSource = readFileSync(componentPath, 'utf8')

test('Typst source-to-preview sync accepts workspace native previews as valid targets', () => {
  assert.match(componentSource, /function hasActiveTypstNativePreviewTarget\(\)/)
  assert.match(componentSource, /getWorkspacePreviewStateForFile\(props\.filePath\)/)
  assert.match(componentSource, /workspacePreviewState\?\.previewKind === 'native'/)
  assert.match(componentSource, /workspacePreviewState\?\.previewVisible === true/)
  assert.match(componentSource, /getOpenPreviewPathForSource\(props\.filePath, 'native'\)/)
})

test('Markdown source-to-preview sync accepts workspace html previews as valid targets', () => {
  assert.match(componentSource, /function hasActiveMarkdownPreviewTarget\(\)/)
  assert.match(componentSource, /workspacePreviewState\?\.previewKind === 'html'/)
  assert.match(componentSource, /workspacePreviewState\?\.previewVisible === true/)
  assert.match(componentSource, /hasPreviewForSource\(props\.filePath, 'html'\)/)
})

test('LaTeX source-to-preview sync accepts workspace pdf previews and wires source double click', () => {
  assert.match(componentSource, /function hasActiveLatexPdfPreviewTarget\(\)/)
  assert.match(componentSource, /workspacePreviewState\?\.previewKind === 'pdf'/)
  assert.match(componentSource, /workspacePreviewState\?\.previewVisible === true/)
  assert.match(componentSource, /getOpenPreviewPathForSource\(props\.filePath, 'pdf'\)/)
  assert.match(componentSource, /function handleLatexDoubleClick\(event\)/)
  assert.match(componentSource, /addEventListener\('dblclick', handleLatexDoubleClick\)/)
  assert.match(componentSource, /latexStore\.requestForwardSync\(props\.filePath, location\.line, location\.column\)/)
})
