import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAiInvocationSuggestion,
  getAiInvocationSuggestions,
  inferAiSkillFromPrompt,
  parseAiInvocationInput,
  resolveAiInvocation,
} from '../src/services/ai/invocationRouting.js'

test('parseAiInvocationInput parses slash shell action invocations', () => {
  const parsed = parseAiInvocationInput('/grounded-chat Explain this section')

  assert.equal(parsed.prefix, '/')
  assert.equal(parsed.name, 'grounded-chat')
  assert.equal(parsed.remainder, 'Explain this section')
})

test('resolveAiInvocation routes $skill to Altals skills', () => {
  const resolved = resolveAiInvocation({
    prompt: '$revise-with-citations tighten this paragraph',
    activeSkill: { id: 'grounded-chat' },
    builtInActions: [{ id: 'grounded-chat' }],
    altalsSkills: [{
      id: 'fs-1',
      slug: 'revise-with-citations',
      name: 'revise-with-citations',
      source: 'altals-workspace',
      kind: 'filesystem-skill',
      directoryPath: '/workspace/.altals/skills/revise-with-citations',
    }],
  })

  assert.equal(resolved.resolvedSkill.id, 'fs-1')
  assert.equal(resolved.userInstruction, 'tighten this paragraph')
})

test('resolveAiInvocation ignores filesystem skills outside Altals managed roots', () => {
  const resolved = resolveAiInvocation({
    prompt: '$academic-researcher analyze this section',
    activeSkill: { id: 'grounded-chat' },
    builtInActions: [{ id: 'grounded-chat' }],
    altalsSkills: [{
      id: 'fs-1',
      slug: 'academic-researcher',
      name: 'academic-researcher',
      source: 'codex-home',
      kind: 'filesystem-skill',
      directoryPath: '/Users/tester/.codex/skills/academic-researcher',
    }],
    contextBundle: {
      workspace: { available: true },
    },
  })

  assert.equal(resolved.resolvedSkill.id, 'grounded-chat')
  assert.equal(resolved.userInstruction, '$academic-researcher analyze this section')
})

test('inferAiSkillFromPrompt defaults to grounded chat unless the user invoked a skill explicitly', () => {
  const resolvedSkill = inferAiSkillFromPrompt({
    prompt: 'Please revise this paragraph and add the right citation.',
    builtInActions: [{ id: 'grounded-chat' }],
    altalsSkills: [
      {
        id: 'fs-1',
        slug: 'revise-with-citations',
        name: 'revise-with-citations',
        source: 'altals-workspace',
        kind: 'filesystem-skill',
        directoryPath: '/workspace/.altals/skills/revise-with-citations',
        description: 'Revise the selected passage while staying grounded in the selected reference.',
      },
    ],
    contextBundle: {
      workspace: { available: true },
      selection: { available: true },
      reference: { available: true },
    },
  })

  assert.equal(resolvedSkill.id, 'grounded-chat')
})

test('getAiInvocationSuggestions returns unified slash completions and dollar skill completions', () => {
  const slashSuggestions = getAiInvocationSuggestions({
    prompt: '/re',
    builtInActions: [{ id: 'grounded-chat', titleKey: 'Grounded chat', descriptionKey: 'desc' }],
    altalsSkills: [{
      id: 'fs-1',
      slug: 'revise-with-citations',
      name: 'revise-with-citations',
      description: 'desc',
      source: 'altals-workspace',
      kind: 'filesystem-skill',
      directoryPath: '/workspace/.altals/skills/revise-with-citations',
    }],
    recentSkillIds: ['fs-1'],
  })
  const skillSuggestions = getAiInvocationSuggestions({
    prompt: '$revi',
    builtInActions: [],
    altalsSkills: [{
      id: 'fs-1',
      slug: 'revise-with-citations',
      name: 'revise-with-citations',
      description: 'desc',
      source: 'altals-workspace',
      kind: 'filesystem-skill',
      directoryPath: '/workspace/.altals/skills/revise-with-citations',
    }],
    recentSkillIds: ['fs-1'],
  })

  assert.equal(slashSuggestions[0].insertText, '/revise-with-citations ')
  assert.equal(slashSuggestions[0].groupKey, 'recent-skills')
  assert.equal(skillSuggestions[0].insertText, '$revise-with-citations ')
  assert.equal(skillSuggestions[0].groupKey, 'recent-skills')
})

test('getAiInvocationSuggestions hides skills outside Altals managed roots', () => {
  const suggestions = getAiInvocationSuggestions({
    prompt: '$acad',
    builtInActions: [],
    altalsSkills: [{
      id: 'fs-1',
      slug: 'academic-researcher',
      name: 'academic-researcher',
      description: 'desc',
      source: 'codex-home',
      kind: 'filesystem-skill',
      directoryPath: '/Users/tester/.codex/skills/academic-researcher',
    }],
    recentSkillIds: ['fs-1'],
  })

  assert.equal(suggestions.length, 0)
})

test('applyAiInvocationSuggestion replaces the current invocation token', () => {
  const updated = applyAiInvocationSuggestion('/gro explain this', {
    insertText: '/grounded-chat ',
  })

  assert.equal(updated, '/grounded-chat explain this')
})
