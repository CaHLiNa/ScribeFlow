import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAiContextBundle, recommendAiSkills } from '../src/domains/ai/aiContextRuntime.js'
import { AI_SKILL_DEFINITIONS, buildPreparedAiBrief } from '../src/services/ai/skillRegistry.js'

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

test('recommendAiSkills still exposes grounded shell actions when document context exists', () => {
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

  const recommendations = recommendAiSkills(bundle, AI_SKILL_DEFINITIONS)

  assert.equal(recommendations[0].id, 'grounded-chat')
  assert.equal(recommendations[0].available, true)
})

test('buildPreparedAiBrief includes filesystem skill markdown and grounded context', () => {
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

  const brief = buildPreparedAiBrief({
    id: 'fs-skill:workspace:revise-with-citations',
    kind: 'filesystem-skill',
    name: 'revise-with-citations',
    slug: 'revise-with-citations',
    scope: 'workspace',
    skillFilePath: '/workspace/.altals/skills/revise-with-citations/SKILL.md',
    directoryPath: '/workspace/.altals/skills/revise-with-citations',
    supportingFiles: ['rubric.md'],
    markdown: '# Revise With Citations\n\nReturn JSON.',
  }, bundle)

  assert.match(brief, /Skill: revise-with-citations/)
  assert.match(brief, /Transformers remain under-motivated/)
  assert.match(brief, /vaswani2017/)
  assert.match(brief, /rubric\.md/)
})

test('buildPreparedAiBrief ignores filesystem skills outside Altals managed roots', () => {
  const bundle = buildAiContextBundle({
    workspacePath: '/workspace',
    activeFile: '/workspace/paper.md',
    selection: null,
    selectedReference: null,
  })

  const brief = buildPreparedAiBrief({
    id: 'fs-skill:user:academic-researcher',
    kind: 'filesystem-skill',
    name: 'academic-researcher',
    slug: 'academic-researcher',
    scope: 'user',
    source: 'codex-home',
    skillFilePath: '/Users/tester/.codex/skills/academic-researcher/SKILL.md',
    directoryPath: '/Users/tester/.codex/skills/academic-researcher',
    markdown: '# Academic Researcher\n\nExternal instructions.',
  }, bundle)

  assert.equal(brief, '')
})
