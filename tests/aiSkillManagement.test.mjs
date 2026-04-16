import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isManagedSkill,
  isWritableSkill,
  rewriteSkillMarkdown,
  resolveManagedSkillRoots,
} from '../src/services/ai/skillManagement.js'

test('resolveManagedSkillRoots uses workspace local skills and global config skills', async () => {
  const roots = await resolveManagedSkillRoots({
    workspacePath: '/workspace/project',
    globalConfigDir: '/global/altals',
  })

  assert.equal(roots.workspace, '/workspace/project/.altals/skills')
  assert.equal(roots.user, '/global/altals/skills')
})

test('isManagedSkill recognizes managed workspace and user skill roots', () => {
  const roots = {
    workspace: '/workspace/project/.altals/skills',
    user: '/global/altals/skills',
  }

  assert.equal(
    isManagedSkill({ directoryPath: '/workspace/project/.altals/skills/revise-with-citations' }, roots),
    true
  )
  assert.equal(
    isManagedSkill({ directoryPath: '/global/altals/skills/revise-with-citations' }, roots),
    true
  )
  assert.equal(
    isManagedSkill({ directoryPath: '/workspace/project/.codex/skills/revise-with-citations' }, roots),
    false
  )
})

test('isWritableSkill recognizes only Altals managed skill roots', () => {
  const writableRoots = [
    '/global/altals/skills',
    '/workspace/project/.altals/skills',
  ]

  assert.equal(
    isWritableSkill({ directoryPath: '/global/altals/skills/academic-researcher' }, writableRoots),
    true
  )
  assert.equal(
    isWritableSkill({ directoryPath: '/workspace/project/.altals/skills/revise-with-citations' }, writableRoots),
    true
  )
  assert.equal(
    isWritableSkill({ directoryPath: '/Users/tester/.codex/skills/academic-researcher' }, writableRoots),
    false
  )
  assert.equal(
    isWritableSkill({ directoryPath: '/workspace/project/skills/custom-pack' }, writableRoots),
    false
  )
})

test('rewriteSkillMarkdown preserves unknown frontmatter while updating name and body', () => {
  const next = rewriteSkillMarkdown(`---
name: academic-researcher
description: Research helper
version: 0.1.0
tags: [Research, Writing]
---

# Academic Researcher

Use this skill to analyze papers.
`, {
    nextName: 'academic-researcher-copy',
    nextDescription: '',
    nextBody: '# Academic Researcher Copy\n\nUpdated workflow body.',
  })

  assert.match(next, /name: academic-researcher-copy/)
  assert.doesNotMatch(next, /^description:/m)
  assert.match(next, /version: 0\.1\.0/)
  assert.match(next, /tags: \[Research, Writing\]/)
  assert.match(next, /Updated workflow body\./)
})
