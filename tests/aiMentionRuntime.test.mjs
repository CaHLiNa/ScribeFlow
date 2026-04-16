import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAiComposerSuggestion,
  detectAiComposerToken,
  getAiComposerSuggestions,
  parseAiPromptResourceMentions,
  resolveMentionedWorkspaceFiles,
} from '../src/domains/ai/aiMentionRuntime.js'

test('detectAiComposerToken reads the active trailing token', () => {
  const token = detectAiComposerToken('Review this section with @chap')

  assert.equal(token.prefix, '@')
  assert.equal(token.query, 'chap')
})

test('getAiComposerSuggestions returns workspace file suggestions for @ mentions', () => {
  const suggestions = getAiComposerSuggestions({
    prompt: 'Review @main',
    workspacePath: '/ws',
    files: [
      { path: '/ws/main.tex', name: 'main.tex', is_dir: false },
      { path: '/ws/notes.md', name: 'notes.md', is_dir: false },
    ],
  })

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].insertText, '@main.tex')
})

test('getAiComposerSuggestions returns tool suggestions for # mentions', () => {
  const suggestions = getAiComposerSuggestions({
    prompt: 'Use #read',
    tools: [
      { id: 'read-active-document', label: 'Read active document', description: 'Read current draft' },
      { id: 'open-note-draft', label: 'Open note draft', description: 'Open note draft' },
    ],
  })

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].insertText, '#read-active-document')
})

test('applyAiComposerSuggestion replaces the trailing token', () => {
  const next = applyAiComposerSuggestion('Review @ma', {
    insertText: '@main.tex',
  })

  assert.equal(next, 'Review @main.tex ')
})

test('parseAiPromptResourceMentions extracts unique file and tool mentions', () => {
  const mentions = parseAiPromptResourceMentions('Check @main.tex with #read-active-document and @main.tex again')

  assert.deepEqual(mentions.fileMentions, ['main.tex'])
  assert.deepEqual(mentions.toolMentions, ['read-active-document'])
})

test('resolveMentionedWorkspaceFiles matches relative paths and basenames', () => {
  const files = [
    { path: '/ws/docs/main.tex', name: 'main.tex', is_dir: false },
    { path: '/ws/notes.md', name: 'notes.md', is_dir: false },
  ]

  const matches = resolveMentionedWorkspaceFiles(['docs/main.tex', 'notes.md'], files, '/ws')

  assert.deepEqual(matches.map((entry) => entry.path), ['/ws/docs/main.tex', '/ws/notes.md'])
})
