import test from 'node:test'
import assert from 'node:assert/strict'

import { createChatMessageRuntime } from '../src/domains/chat/chatMessageRuntime.js'

function createHarness() {
  const state = {
    sessions: [{ id: 's1', label: 'Chat 1', modelId: 'sonnet' }],
    richHtml: {},
  }
  const sentPayloads = []
  const warnings = []
  const telemetry = []
  const stopped = []
  const chat = {
    state: {
      statusRef: { value: 'ready' },
      messagesRef: { value: [] },
    },
    sendMessage(payload) {
      sentPayloads.push(payload)
      chat.state.messagesRef.value.push({ id: `u-${sentPayloads.length}`, role: 'user' })
    },
    stop() {
      stopped.push(true)
    },
  }

  const runtime = createChatMessageRuntime({
    getSession: (id) => state.sessions.find((session) => session.id === id) || null,
    getChatInstance: (id) => (id === 's1' ? chat : null),
    getOrCreateChat: () => chat,
    isUsageBudgetExceeded: () => false,
    buildSessionLabel: (text) => `Label:${text}`,
    appendUnresolvedCommentsToContent: (path, content) => `[${path}] ${content}`,
    nextTickImpl: async () => {},
    setRichHtml: (messageId, html) => {
      state.richHtml[messageId] = html
    },
    chatSendEvent: (modelId) => telemetry.push(modelId),
    warn: (...args) => warnings.push(args),
  })

  return {
    state,
    chat,
    runtime,
    sentPayloads,
    warnings,
    telemetry,
    stopped,
  }
}

test('chat message runtime builds text refs, multimodal files, and context blocks', async () => {
  const { runtime } = createHarness()

  const payload = await runtime.buildMessageTextAndFiles({
    text: 'Question',
    fileRefs: [
      { path: '/tmp/a.md', content: 'Alpha' },
      { path: '/tmp/b.png', _multimodal: true, _dataUrl: 'data:image/png;base64,abc', _mediaType: 'image/png' },
    ],
    context: {
      file: '/tmp/a.md',
      contextBefore: 'before',
      text: 'selected',
      contextAfter: 'after',
    },
  })

  assert.equal(payload.files.length, 1)
  assert.equal(payload.files[0].filename, 'b.png')
  assert.match(payload.text, /<file-ref path="\/tmp\/a.md">/)
  assert.match(payload.text, /\[\/tmp\/a.md\] Alpha/)
  assert.match(payload.text, /<context file="\/tmp\/a.md">/)
  assert.match(payload.text, /<selection>\nselected\n<\/selection>/)
  assert.match(payload.text, /Question/)
})

test('chat message runtime sends messages, auto-labels first chats, and stores rich html', async () => {
  const { state, runtime, sentPayloads, telemetry } = createHarness()

  const sent = await runtime.sendMessage('s1', {
    text: 'Hello world',
    richHtml: '<p>Hello</p>',
  })

  assert.equal(sent, true)
  assert.equal(state.sessions[0].label, 'Label:Hello world')
  assert.deepEqual(telemetry, ['sonnet'])
  assert.equal(sentPayloads.length, 1)
  assert.equal(sentPayloads[0].text, 'Hello world')
  assert.equal(state.richHtml['u-1'], '<p>Hello</p>')
})

test('chat message runtime can hide internal launch prompts from the visible transcript', async () => {
  const { chat, runtime, sentPayloads } = createHarness()

  const sent = await runtime.sendMessage('s1', {
    text: 'Internal workflow launch prompt',
    hideFromTranscript: true,
  })

  assert.equal(sent, true)
  assert.equal(sentPayloads.length, 1)
  assert.equal(chat.state.messagesRef.value[0]._hiddenFromTranscript, true)
})

test('chat message runtime blocks sends for streaming chats and budget overflow', async () => {
  const { chat, runtime, sentPayloads, warnings } = createHarness()

  chat.state.statusRef.value = 'streaming'
  assert.equal(await runtime.sendMessage('s1', { text: 'Blocked' }), false)

  const budgetRuntime = createChatMessageRuntime({
    getSession: () => ({ id: 's1', label: 'Chat 1', modelId: 'sonnet' }),
    getChatInstance: () => chat,
    getOrCreateChat: () => ({ ...chat, state: { ...chat.state, statusRef: { value: 'ready' }, messagesRef: { value: [] } } }),
    isUsageBudgetExceeded: () => true,
    buildSessionLabel: (text) => text,
    appendUnresolvedCommentsToContent: (path, content) => content,
    nextTickImpl: async () => {},
    setRichHtml: () => {},
    chatSendEvent: () => {},
    warn: (...args) => warnings.push(args),
  })

  assert.equal(await budgetRuntime.sendMessage('s1', { text: 'Budget' }), false)
  assert.equal(sentPayloads.length, 0)
  assert.equal(warnings.length, 2)
})

test('chat message runtime aborts live chat sessions', async () => {
  const { runtime, stopped } = createHarness()

  assert.equal(await runtime.abortSession('s1'), true)
  assert.equal(await runtime.abortSession('missing'), false)
  assert.equal(stopped.length, 1)
})
