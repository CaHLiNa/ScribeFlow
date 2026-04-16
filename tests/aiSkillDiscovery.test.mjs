import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSkillSearchLocations,
  isAltalsManagedFilesystemSkill,
  mergeDiscoveredSkills,
  parseSkillMarkdown,
} from '../src/services/ai/skillDiscovery.js'

test('parseSkillMarkdown reads frontmatter name and description from SKILL.md', () => {
  const parsed = parseSkillMarkdown(`---
name: research-ideation
description: Explore research ideas with structured prompts.
---

# Research Ideation

Use this skill to generate research directions.
`)

  assert.equal(parsed.name, 'research-ideation')
  assert.equal(parsed.slug, 'research-ideation')
  assert.equal(parsed.description, 'Explore research ideas with structured prompts.')
})

test('parseSkillMarkdown reads YAML block-scalar descriptions from SKILL.md frontmatter', () => {
  const parsed = parseSkillMarkdown(`---
name: gstack
description: |
  Fast headless browser for QA testing and site dogfooding. Navigate pages, interact with
  elements, verify state, diff before/after, and capture bug evidence.
---

# Gstack
`)

  assert.equal(parsed.name, 'gstack')
  assert.match(parsed.description, /Fast headless browser/)
  assert.match(parsed.description, /capture bug evidence/)
  assert.equal(parsed.description.includes('|'), false)
})

test('parseSkillMarkdown falls back to the first paragraph when description is missing', () => {
  const parsed = parseSkillMarkdown(`# Draft rebuttal

Generate a rebuttal outline grounded in reviewer comments.

More details follow here.
`, 'draft-rebuttal')

  assert.equal(parsed.name, 'draft-rebuttal')
  assert.match(parsed.description, /Generate a rebuttal outline/)
})

test('buildSkillSearchLocations includes only Altals managed user and workspace roots', () => {
  const locations = buildSkillSearchLocations({
    workspacePath: '/tmp/project',
    globalConfigDir: '/tmp/config',
  })

  const paths = locations.map((entry) => entry.path)

  assert.deepEqual(paths, [
    '/tmp/config/skills',
    '/tmp/project/.altals/skills',
  ])
})

test('mergeDiscoveredSkills keeps the later skill when duplicate names exist', () => {
  const skills = mergeDiscoveredSkills([
    {
      id: 'a',
      name: 'review-response',
      directoryPath: '/config/skills/review-response',
      scope: 'user',
    },
    {
      id: 'b',
      name: 'review-response',
      directoryPath: '/workspace/.altals/skills/review-response',
      scope: 'workspace',
    },
  ])

  assert.equal(skills.length, 1)
  assert.equal(skills[0].id, 'b')
  assert.equal(skills[0].scope, 'workspace')
})

test('isAltalsManagedFilesystemSkill accepts Altals sources and workspace .altals paths only', () => {
  assert.equal(
    isAltalsManagedFilesystemSkill({
      kind: 'filesystem-skill',
      source: 'altals-global',
      directoryPath: '/config/skills/review-response',
    }),
    true
  )
  assert.equal(
    isAltalsManagedFilesystemSkill({
      kind: 'filesystem-skill',
      source: '',
      directoryPath: '/workspace/.altals/skills/review-response',
    }),
    true
  )
  assert.equal(
    isAltalsManagedFilesystemSkill({
      kind: 'filesystem-skill',
      source: 'codex-home',
      directoryPath: '/Users/tester/.codex/skills/review-response',
    }),
    false
  )
})
