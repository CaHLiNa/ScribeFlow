import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAiConversationEventToMessage,
  applyAiToolEventToMessage,
  buildAiAssistantConversationMessage,
  buildAiContextChips,
  buildAiFailedAssistantMessage,
  buildAiPendingAssistantMessage,
  buildAiUserConversationMessage,
  extractAiMessageText,
} from '../src/domains/ai/aiConversationRuntime.js'

test('buildAiContextChips summarizes available document selection and reference context', () => {
  const chips = buildAiContextChips({
    document: { available: true, label: 'draft.md', filePath: '/workspace/draft.md' },
    selection: { available: true, preview: 'Selected paragraph preview' },
    reference: { available: true, citationKey: 'Smith2024', title: 'A Useful Paper' },
  })

  assert.equal(chips.length, 3)
  assert.equal(chips[0].label.length > 0, true)
  assert.match(chips[2].value, /Smith2024/)
})

test('buildAiUserConversationMessage includes context metadata and text part', () => {
  const message = buildAiUserConversationMessage({
    id: 'm1',
    skill: { kind: 'filesystem-skill', name: 'revise-with-citations' },
    userInstruction: 'Tighten this paragraph.',
    contextBundle: {
      document: { available: true, label: 'paper.md' },
    },
  })

  assert.equal(message.role, 'user')
  assert.equal(message.parts[0].type, 'text')
  assert.equal(message.content, 'Tighten this paragraph.')
  assert.equal(message.metadata.skillLabel, 'revise-with-citations')
  assert.equal(message.metadata.contextChips.length, 1)
})

test('buildAiPendingAssistantMessage creates running status part', () => {
  const message = buildAiPendingAssistantMessage({
    id: 'm2',
    skill: { kind: 'built-in-action', titleKey: 'Grounded chat' },
    providerState: { currentProviderLabel: 'OpenAI', model: 'gpt-5.4' },
  })

  assert.equal(message.role, 'assistant')
  assert.deepEqual(message.parts, [])
  assert.match(message.metadata.providerSummary, /OpenAI/)
})

test('applyAiToolEventToMessage merges tool events by tool id', () => {
  const message = buildAiPendingAssistantMessage({
    id: 'm-tools',
    skill: { kind: 'built-in-action', titleKey: 'Grounded chat' },
  })

  const runningMessage = applyAiToolEventToMessage(message, {
    toolId: 'model-response',
    status: 'running',
    label: 'Request model response',
  })
  const doneMessage = applyAiToolEventToMessage(runningMessage, {
    toolId: 'model-response',
    status: 'done',
    label: 'Request model response',
  })

  assert.equal(runningMessage.parts.filter((part) => part.type === 'tool').length, 1)
  assert.equal(doneMessage.parts.filter((part) => part.type === 'tool').length, 1)
  assert.equal(
    doneMessage.parts.find((part) => part.type === 'tool' && part.toolId === 'model-response')?.status,
    'done'
  )
})

test('applyAiConversationEventToMessage streams reasoning and text into the pending message', () => {
  const message = buildAiPendingAssistantMessage({
    id: 'm-stream',
    skill: { kind: 'built-in-action', titleKey: 'Grounded chat' },
  })

  const withReasoning = applyAiConversationEventToMessage(message, {
    eventType: 'assistant-reasoning',
    text: 'Inspecting the active draft and workspace context.',
  })
  const withText = applyAiConversationEventToMessage(withReasoning, {
    eventType: 'assistant-content',
    text: 'Here is the grounded answer.',
  })

  assert.equal(withReasoning.parts.some((part) => part.type === 'support'), true)
  assert.equal(withText.parts.some((part) => part.type === 'text'), true)
  assert.equal(extractAiMessageText(withText).includes('Here is the grounded answer.'), true)
})

test('buildAiAssistantConversationMessage creates status support text and artifact parts', () => {
  const message = buildAiAssistantConversationMessage({
    id: 'm3',
    skill: { kind: 'filesystem-skill', name: 'revise-with-citations' },
    result: {
      content: 'Fallback content',
      events: [
        {
          toolId: 'model-response',
          status: 'done',
          label: 'Request model response',
        },
      ],
      payload: {
        rationale: 'Grounded in the selected source.',
        citation_suggestion: 'Add citation after sentence two.',
      },
      supportFiles: [{ path: 'rubric.md' }],
    },
    artifact: {
      id: 'artifact-1',
      type: 'doc_patch',
      title: 'Document patch',
      replacementText: 'Rewritten paragraph.',
      rationale: 'Grounded in the selected source.',
    },
    providerState: { currentProviderLabel: 'OpenAI', model: 'gpt-5.4' },
  })

  assert.equal(message.parts[0].type, 'tool')
  assert.equal(message.parts[1].type, 'support')
  assert.equal(message.parts[2].type, 'text')
  assert.equal(message.parts[3].type, 'note')
  assert.equal(message.parts[4].type, 'artifact')
})

test('buildAiFailedAssistantMessage creates an error part', () => {
  const message = buildAiFailedAssistantMessage({
    id: 'm4',
    skill: { kind: 'built-in-action', titleKey: 'Grounded chat' },
    error: 'Provider timeout.',
  })

  assert.equal(message.parts[0].type, 'error')
  assert.equal(message.content, 'Provider timeout.')
})

test('extractAiMessageText joins text-like parts and falls back to content', () => {
  const rich = extractAiMessageText({
    parts: [
      { type: 'status', status: 'done' },
      { type: 'support', text: 'Grounding note.' },
      { type: 'text', text: 'Final answer.' },
      { type: 'artifact', artifactId: 'a1' },
    ],
  })
  const flat = extractAiMessageText({ content: 'Flat content' })

  assert.match(rich, /Grounding note/)
  assert.match(rich, /Final answer/)
  assert.equal(flat, 'Flat content')
})
