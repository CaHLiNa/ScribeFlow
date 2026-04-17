import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSessionAskUserRequestsFromRuntimeSnapshot,
  buildSessionExitPlanRequestsFromRuntimeSnapshot,
  buildSessionMessagesFromRuntimeSnapshot,
  buildSessionPermissionRequestsFromRuntimeSnapshot,
  buildSessionPlanModeFromRuntimeSnapshot,
} from '../src/domains/ai/aiRuntimeThreadMapping.js'

test('buildSessionMessagesFromRuntimeSnapshot rebuilds user and assistant messages from runtime items', () => {
  const messages = buildSessionMessagesFromRuntimeSnapshot({
    turns: [
      {
        id: 'turn-1',
        status: 'completed',
        createdAt: 100,
      },
    ],
    items: [
      {
        id: 'itm-1',
        turnId: 'turn-1',
        kind: 'userMessage',
        text: 'Inspect the workspace',
        createdAt: 100,
      },
      {
        id: 'itm-2',
        turnId: 'turn-1',
        kind: 'reasoning',
        text: 'Reading the active files first.',
        createdAt: 101,
      },
      {
        id: 'itm-3',
        turnId: 'turn-1',
        kind: 'agentMessage',
        text: 'I checked the workspace.',
        createdAt: 102,
      },
    ],
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content, 'Inspect the workspace')
  assert.equal(messages[1].role, 'assistant')
  assert.equal(messages[1].content, 'I checked the workspace.')
  assert.equal(messages[1].parts[0].type, 'support')
  assert.equal(messages[1].parts[1].type, 'text')
})

test('buildSessionMessagesFromRuntimeSnapshot emits an interrupted assistant message when there is no final text', () => {
  const messages = buildSessionMessagesFromRuntimeSnapshot({
    turns: [
      {
        id: 'turn-2',
        status: 'interrupted',
        createdAt: 100,
      },
    ],
    items: [
      {
        id: 'itm-4',
        turnId: 'turn-2',
        kind: 'userMessage',
        text: 'Stop the run',
        createdAt: 100,
      },
    ],
  })

  assert.equal(messages.length, 2)
  assert.equal(messages[1].role, 'assistant')
  assert.match(messages[1].content, /stopped/i)
  assert.equal(messages[1].parts[0].type, 'error')
})

test('runtime snapshot helpers restore pending runtime requests and plan mode', () => {
  const snapshot = {
    permissionRequests: [
      {
        requestId: 'perm-1',
        toolName: 'read_workspace_file',
        displayName: 'Read workspace file',
        title: 'Allow read',
        description: 'Need file access',
        decisionReason: 'User requested inspection',
        inputPreview: '/tmp/file.md',
      },
    ],
    askUserRequests: [
      {
        requestId: 'ask-1',
        title: 'Clarify target',
        prompt: 'Which workspace should I use?',
        description: 'Need an answer before continuing',
        questions: [{ id: 'workspace', header: 'Workspace', question: 'Pick one', options: [] }],
      },
    ],
    exitPlanRequests: [
      {
        requestId: 'exit-1',
        turnId: 'turn-1',
        title: 'Exit plan mode',
        allowedPrompts: [{ tool: 'write_file', prompt: 'Update plan' }],
      },
    ],
    planMode: {
      active: true,
      summary: 'Planning runtime migration',
      note: 'Awaiting user approval',
    },
  }

  assert.deepEqual(buildSessionPermissionRequestsFromRuntimeSnapshot(snapshot), [
    {
      requestId: 'perm-1',
      streamId: '',
      runtimeManaged: true,
      toolName: 'read_workspace_file',
      displayName: 'Read workspace file',
      title: 'Allow read',
      description: 'Need file access',
      decisionReason: 'User requested inspection',
      inputPreview: '/tmp/file.md',
    },
  ])
  assert.deepEqual(buildSessionAskUserRequestsFromRuntimeSnapshot(snapshot), [
    {
      requestId: 'ask-1',
      streamId: '',
      runtimeManaged: true,
      title: 'Clarify target',
      prompt: 'Which workspace should I use?',
      description: 'Need an answer before continuing',
      questions: [{ id: 'workspace', header: 'Workspace', question: 'Pick one', options: [] }],
    },
  ])
  assert.deepEqual(buildSessionExitPlanRequestsFromRuntimeSnapshot(snapshot), [
    {
      requestId: 'exit-1',
      streamId: '',
      runtimeManaged: true,
      toolUseId: 'turn-1',
      title: 'Exit plan mode',
      allowedPrompts: [{ tool: 'write_file', prompt: 'Update plan' }],
    },
  ])
  assert.deepEqual(buildSessionPlanModeFromRuntimeSnapshot(snapshot), {
    active: true,
    summary: 'Planning runtime migration',
    note: 'Awaiting user approval',
  })
})
