import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAiContextBundle, recommendAiSkills } from '../src/domains/ai/aiContextRuntime.js'

const BUILT_IN_ACTION_DEFINITIONS = [
  {
    id: 'workspace-agent',
    kind: 'built-in-action',
    titleKey: 'Workspace agent',
    descriptionKey:
      'Ask the agent to inspect the current workspace, use tools, and continue the task in context.',
    requiredContext: ['workspace'],
  },
]

test('buildAiContextBundle only keeps editor selection when it matches the active document', () => {
  const bundle = buildAiContextBundle({
    workspacePath: '/workspace',
    activeFile: '/workspace/paper.md',
    selection: {
      filePath: '/workspace/other.md',
      from: 4,
      to: 18,
      text: 'stale selection',
    },
    selectedReference: null,
  })

  assert.equal(bundle.document.available, true)
  assert.equal(bundle.selection.available, false)
  assert.equal(bundle.selection.text, '')
})

test('buildAiContextBundle ignores a persisted selected reference when reference context is inactive', () => {
  const bundle = buildAiContextBundle({
    workspacePath: '/workspace',
    activeFile: '/workspace/paper.md',
    selection: null,
    selectedReference: {
      id: 'ref-1',
      title: 'Attention Is All You Need',
      citationKey: 'vaswani2017',
      year: '2017',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
    },
    referenceActive: false,
  })

  assert.equal(bundle.document.available, true)
  assert.equal(bundle.reference.available, false)
  assert.equal(bundle.reference.title, '')
})

test('recommendAiSkills still exposes the workspace agent when document context exists', () => {
  const bundle = buildAiContextBundle({
    workspacePath: '/workspace',
    activeFile: '/workspace/paper.md',
    selection: {
      filePath: '/workspace/paper.md',
      from: 10,
      to: 42,
      text: 'Transformers remain under-motivated in this section.',
    },
    selectedReference: {
      id: 'ref-1',
      title: 'Attention Is All You Need',
      citationKey: 'vaswani2017',
      year: '2017',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
    },
  })

  const recommendations = recommendAiSkills(bundle, BUILT_IN_ACTION_DEFINITIONS)

  assert.equal(recommendations[0].id, 'workspace-agent')
  assert.equal(recommendations[0].available, true)
})
