import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDocumentExportSummary,
  resolveDocumentExportState,
} from '../src/domains/document/documentExportRuntime.js'

const t = (value, params = {}) =>
  String(value || '').replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))

test('document export runtime keeps markdown in a preview-first workflow', () => {
  const state = resolveDocumentExportState({
    filePath: '/workspace/note.md',
    uiState: { kind: 'markdown', phase: 'ready' },
    previewState: { previewVisible: true },
  })

  assert.deepEqual(state, {
    kind: 'markdown',
    exportPhase: 'ready',
    canExport: false,
    canOpenArtifact: false,
    artifactPath: '',
    artifactLabel: 'HTML preview',
    targetLabel: 'Workspace preview',
    targetHint: 'Markdown stays export-light and relies on preview rendering inside the workspace.',
  })
})

test('document export runtime marks latex and typst outputs as external artifacts when available', () => {
  const latexState = resolveDocumentExportState({
    filePath: '/workspace/paper.tex',
    uiState: { kind: 'latex', phase: 'ready' },
    artifactPath: '/workspace/build/paper.pdf',
    artifactReady: true,
  })
  const typstState = resolveDocumentExportState({
    filePath: '/workspace/paper.typ',
    uiState: { kind: 'typst', phase: 'compiling' },
    artifactPath: '/workspace/build/paper.pdf',
    artifactReady: true,
  })

  assert.equal(latexState.canExport, true)
  assert.equal(latexState.canOpenArtifact, true)
  assert.equal(latexState.exportPhase, 'ready')
  assert.equal(typstState.exportPhase, 'exporting')
})

test('document export runtime builds human-readable summaries for preview, ready, and build-required states', () => {
  assert.deepEqual(
    buildDocumentExportSummary(
      {
        kind: 'markdown',
        canOpenArtifact: false,
      },
      t,
    ),
    {
      title: 'Preview-first workflow',
      description: 'Markdown stays in the workspace preview loop instead of generating a compiled artifact.',
      actionLabel: 'Open preview',
      actionHint: 'Use the workspace preview to inspect the rendered draft.',
    },
  )

  assert.deepEqual(
    buildDocumentExportSummary(
      {
        kind: 'latex',
        canOpenArtifact: true,
        artifactPath: '/workspace/build/paper.pdf',
      },
      t,
    ),
    {
      title: 'Export ready',
      description: 'A compiled document output is available for external review.',
      actionLabel: 'Open output',
      actionHint: '/workspace/build/paper.pdf',
    },
  )

  assert.deepEqual(
    buildDocumentExportSummary(
      {
        kind: 'typst',
        canOpenArtifact: false,
      },
      t,
    ),
    {
      title: 'Build required',
      description: 'Run the document workflow to generate a fresh exportable output.',
      actionLabel: 'Compile',
      actionHint: 'No output has been generated yet.',
    },
  )
})
