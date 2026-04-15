import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAiContextBundle, recommendAiSkills } from '../src/domains/ai/aiContextRuntime.js'
import { AI_SKILL_DEFINITIONS, buildPreparedAiBrief } from '../src/services/ai/skillRegistry.js'

test('buildAiContextBundle only keeps editor selection when it matches the active document', () => {
  const bundle = buildAiContextBundle({
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

test('recommendAiSkills prioritizes citation-grounded revision when document, selection, and reference exist', () => {
  const bundle = buildAiContextBundle({
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

  const recommendations = recommendAiSkills(bundle, AI_SKILL_DEFINITIONS)

  assert.equal(recommendations[0].id, 'revise-with-citations')
  assert.equal(recommendations[0].available, true)
})

test('buildPreparedAiBrief includes the selected passage and reference grounding', () => {
  const bundle = buildAiContextBundle({
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

  const brief = buildPreparedAiBrief('revise-with-citations', bundle)

  assert.match(brief, /Task: Revise the selected passage/)
  assert.match(brief, /Transformers remain under-motivated/)
  assert.match(brief, /vaswani2017/)
})
