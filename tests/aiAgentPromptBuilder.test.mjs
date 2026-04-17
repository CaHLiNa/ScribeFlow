import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  requiresStructuredAgentResponse,
} from '../src/services/ai/agentPromptBuilder.js'

test('buildAgentSystemPrompt uses agent-first instructions for agent runtime intent', () => {
  const prompt = buildAgentSystemPrompt({
    skill: { id: 'workspace-agent', kind: 'built-in-action' },
    runtimeIntent: 'agent',
    behaviorId: 'workspace-agent',
    structured: false,
  })

  assert.match(prompt, /Altals Agent/)
  assert.match(prompt, /Operate directly on the current workspace/)
  assert.doesNotMatch(prompt, /Return valid JSON only/)
})

test('buildAgentUserPrompt uses task-first workspace prompt in agent mode', () => {
  const prompt = buildAgentUserPrompt({
    skill: { id: 'workspace-agent', kind: 'built-in-action' },
    runtimeIntent: 'agent',
    userInstruction: 'Fix the failing build.',
    conversation: [{ role: 'user', content: 'Earlier request' }],
    contextBundle: {
      workspace: { path: '/workspace' },
      document: { filePath: '/workspace/src/app.ts' },
      selection: { preview: 'const broken = true' },
      reference: { citationKey: '', title: '' },
    },
    altalsSkills: [
      {
        id: 'fs-skill:workspace:revise-with-citations',
        kind: 'filesystem-skill',
        name: 'revise-with-citations',
        slug: 'revise-with-citations',
        description: 'Revise a paragraph with tighter citation grounding.',
        scope: 'workspace',
        directoryPath: '/workspace/.altals/skills/revise-with-citations',
        skillFilePath: '/workspace/.altals/skills/revise-with-citations/SKILL.md',
        source: 'altals-workspace',
      },
    ],
    enabledToolIds: ['create-workspace-file', 'write-workspace-file', 'open-workspace-file'],
    referencedFiles: [{ relativePath: 'src/app.ts', content: 'export const broken = true' }],
    requestedTools: ['Edit', 'Bash'],
  })

  assert.match(prompt, /^Current task:/m)
  assert.match(prompt, /Fix the failing build\./)
  assert.match(prompt, /^Workspace context:/m)
  assert.match(prompt, /^Available filesystem skills:/m)
  assert.match(prompt, /^Available tools in this Altals runtime:/m)
  assert.match(prompt, /create_workspace_file: Create a new text file inside the current workspace and open it in the editor\./)
  assert.match(prompt, /revise-with-citations \[workspace\]: Revise a paragraph with tighter citation grounding\./)
  assert.match(prompt, /Referenced files:/)
  assert.match(prompt, /User-mentioned tools:/)
  assert.match(prompt, /Recent conversation:/)
  assert.doesNotMatch(prompt, /^Skill:/m)
  assert.doesNotMatch(prompt, /^Additional user instruction:/m)
})

test('buildAgentUserPrompt keeps skill-first prompt shape for explicit skill intent', () => {
  const prompt = buildAgentUserPrompt({
    skill: {
      id: 'fs-skill:workspace:revise-with-citations',
      kind: 'filesystem-skill',
      name: 'revise-with-citations',
      slug: 'revise-with-citations',
      scope: 'workspace',
      skillFilePath: '/workspace/.altals/skills/revise-with-citations/SKILL.md',
      directoryPath: '/workspace/.altals/skills/revise-with-citations',
      supportingFiles: ['rubric.md'],
      markdown: '# Revise With Citations\n\nReturn JSON.',
    },
    runtimeIntent: 'skill',
    userInstruction: 'Tighten this paragraph.',
    enabledToolIds: ['apply-document-patch', 'open-note-draft'],
    supportFiles: [{ path: 'rubric.md', relativePath: 'rubric.md', content: 'Follow the rubric.' }],
    contextBundle: {
      workspace: { path: '/workspace' },
      document: { filePath: '/workspace/paper.md' },
      selection: { available: true, text: 'Original paragraph.' },
      reference: { available: true, title: 'Useful Paper', citationKey: 'smith2024' },
    },
  })

  assert.match(prompt, /^Skill: revise-with-citations/m)
  assert.match(prompt, /^Additional user instruction:/m)
  assert.match(prompt, /^Available tools in this Altals runtime:/m)
  assert.match(prompt, /Return JSON with this shape:/)
})

test('requiresStructuredAgentResponse only disables structured output for default agent intent', () => {
  assert.equal(
    requiresStructuredAgentResponse({
      behaviorId: 'workspace-agent',
      runtimeIntent: 'agent',
    }),
    false
  )
  assert.equal(
    requiresStructuredAgentResponse({
      behaviorId: 'revise-with-citations',
      runtimeIntent: 'skill',
    }),
    true
  )
})
