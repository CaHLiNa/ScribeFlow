import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSkillSupportPromptBlock, isSupportedSkillSupportFile } from '../src/services/ai/skillSupportFiles.js'

test('isSupportedSkillSupportFile accepts common text support files and rejects SKILL.md', () => {
  assert.equal(isSupportedSkillSupportFile('/tmp/skill/rubric.md'), true)
  assert.equal(isSupportedSkillSupportFile('/tmp/skill/scripts/helper.py'), true)
  assert.equal(isSupportedSkillSupportFile('/tmp/skill/SKILL.md'), false)
  assert.equal(isSupportedSkillSupportFile('/tmp/skill/image.png'), false)
})

test('buildSkillSupportPromptBlock renders loaded support files into prompt text', () => {
  const block = buildSkillSupportPromptBlock([
    {
      relativePath: 'rubric.md',
      content: 'Keep the prose concise.',
    },
  ])

  assert.match(block, /rubric\.md/)
  assert.match(block, /Keep the prose concise/)
})
