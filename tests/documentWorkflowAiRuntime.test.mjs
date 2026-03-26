import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowAiRuntime } from '../src/domains/document/documentWorkflowAiRuntime.js'

function createRuntime() {
  const fixTaskCalls = []
  const diagnoseTaskCalls = []
  const prepareTaskCalls = []
  const startCalls = []

  const runtime = createDocumentWorkflowAiRuntime({
    startWorkflowRunImpl: async (payload) => {
      startCalls.push(payload)
      return {
        sessionId: `session-${startCalls.length}`,
        workflow: { run: { id: `run-${startCalls.length}` } },
      }
    },
    createFixTaskImpl: (options = {}) => {
      fixTaskCalls.push(options)
      return { kind: 'fix', ...options }
    },
    createDiagnoseTaskImpl: (options = {}) => {
      diagnoseTaskCalls.push(options)
      return { kind: 'diagnose', ...options }
    },
    prepareTaskImpl: async (task = {}) => {
      prepareTaskCalls.push(task)
      return {
        ...task,
        prompt: `prepared:${task.kind}`,
        _preparedTexTypFixer: true,
      }
    },
  })

  return {
    runtime,
    fixTaskCalls,
    diagnoseTaskCalls,
    prepareTaskCalls,
    startCalls,
  }
}

test('document workflow ai runtime starts fix workflows in-place with document-workflow metadata', async () => {
  const { runtime, fixTaskCalls, prepareTaskCalls, startCalls } = createRuntime()
  const chatStore = { id: 'chat' }

  const result = await runtime.launchFixForFile('/workspace/main.tex', {
    chatStore,
    sessionId: 'session-existing',
  })

  assert.equal(result.sessionId, 'session-1')
  assert.deepEqual(fixTaskCalls, [{
    filePath: '/workspace/main.tex',
    source: 'document-workflow',
    entryContext: 'document-workflow',
  }])
  assert.deepEqual(prepareTaskCalls, [{
    kind: 'fix',
    filePath: '/workspace/main.tex',
    source: 'document-workflow',
    entryContext: 'document-workflow',
  }])
  assert.deepEqual(startCalls, [{
    chatStore,
    modelId: undefined,
    sessionId: 'session-existing',
    autoSendMessage: true,
    hideAutoSendMessage: true,
    task: {
      kind: 'fix',
      filePath: '/workspace/main.tex',
      source: 'document-workflow',
      entryContext: 'document-workflow',
      prompt: 'prepared:fix',
      _preparedTexTypFixer: true,
    },
  }])
})

test('document workflow ai runtime starts diagnose workflows without auto-opening chat surfaces', async () => {
  const { runtime, diagnoseTaskCalls, prepareTaskCalls, startCalls } = createRuntime()

  await runtime.launchDiagnoseForFile('/workspace/main.typ', {
    chatStore: { id: 'chat' },
    modelId: 'gpt-5.4',
  })

  assert.deepEqual(diagnoseTaskCalls, [{
    filePath: '/workspace/main.typ',
    source: 'document-workflow',
    entryContext: 'document-workflow',
  }])
  assert.deepEqual(prepareTaskCalls, [{
    kind: 'diagnose',
    filePath: '/workspace/main.typ',
    source: 'document-workflow',
    entryContext: 'document-workflow',
  }])
  assert.deepEqual(startCalls, [{
    chatStore: { id: 'chat' },
    modelId: 'gpt-5.4',
    sessionId: null,
    autoSendMessage: true,
    hideAutoSendMessage: true,
    task: {
      kind: 'diagnose',
      filePath: '/workspace/main.typ',
      source: 'document-workflow',
      entryContext: 'document-workflow',
      prompt: 'prepared:diagnose',
      _preparedTexTypFixer: true,
    },
  }])
})

test('document workflow ai runtime ignores unsupported document types', async () => {
  const { runtime, fixTaskCalls, diagnoseTaskCalls, prepareTaskCalls, startCalls } = createRuntime()

  const fixResult = await runtime.launchFixForFile('/workspace/chapter.md')
  const diagnoseResult = await runtime.launchDiagnoseForFile('/workspace/chapter.md')

  assert.equal(fixResult, null)
  assert.equal(diagnoseResult, null)
  assert.deepEqual(fixTaskCalls, [])
  assert.deepEqual(diagnoseTaskCalls, [])
  assert.deepEqual(prepareTaskCalls, [])
  assert.deepEqual(startCalls, [])
})

test('document workflow ai runtime requires an explicit chat store for auditable workflow sessions', async () => {
  const { runtime, fixTaskCalls, diagnoseTaskCalls, prepareTaskCalls, startCalls } = createRuntime()

  const fixResult = await runtime.launchFixForFile('/workspace/main.tex')
  const diagnoseResult = await runtime.launchDiagnoseForFile('/workspace/main.typ')

  assert.equal(fixResult, null)
  assert.equal(diagnoseResult, null)
  assert.deepEqual(fixTaskCalls, [])
  assert.deepEqual(diagnoseTaskCalls, [])
  assert.deepEqual(prepareTaskCalls, [])
  assert.deepEqual(startCalls, [])
})
