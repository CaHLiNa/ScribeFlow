import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspacePreviewSessionState } from '../src/domains/document/documentWorkspacePreviewRuntime.js'

test('workspace preview session state keeps typst workspace preview in native mode', () => {
  const sessionState = createWorkspacePreviewSessionState({
    filePath: '/workspace/paper.typ',
    kind: 'typst',
    previewKind: 'native',
    sourcePaneId: 'pane-source',
    currentSession: {
      activeFile: '/workspace/paper.typ',
      activeKind: 'typst',
      sourcePaneId: 'pane-source',
      previewKind: 'native',
      previewSourcePath: '/workspace/paper.typ',
      state: 'workspace-preview',
    },
  })

  assert.deepEqual(sessionState, {
    activeFile: '/workspace/paper.typ',
    activeKind: 'typst',
    sourcePaneId: 'pane-source',
    previewPaneId: null,
    previewKind: 'native',
    previewSourcePath: '/workspace/paper.typ',
    state: 'workspace-preview',
  })
})
