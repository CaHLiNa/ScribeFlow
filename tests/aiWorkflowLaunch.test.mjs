import test from 'node:test'
import assert from 'node:assert/strict'

import { createPinia, setActivePinia } from 'pinia'

import { shouldPreserveAiSessionLabel, shouldSkipAutoTitleForSession } from '../src/services/ai/sessionLabeling.js'
import {
  autoSendWorkflowMessage,
  buildTaskSendPayload,
  buildWorkflowSendPayload,
} from '../src/services/ai/launchMessages.js'
import { useAiWorkflowRunsStore } from '../src/stores/aiWorkflowRuns.js'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createFakeChatStore() {
  const sessions = []
  const chats = new Map()
  const sentMessages = []
  const savedSessions = []
  let sessionCounter = 0

  return {
    sessions,
    sentMessages,
    savedSessions,
    createSession(modelId) {
      sessionCounter += 1
      const id = `session-${sessionCounter}`
      sessions.push({
        id,
        label: `Chat ${sessionCounter}`,
        modelId: modelId || 'sonnet',
        _ai: null,
        _workflow: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return id
    },
    getChatInstance(id) {
      return chats.get(id) || null
    },
    getOrCreateChat(session) {
      if (chats.has(session.id)) return chats.get(session.id)
      const state = {
        messagesRef: { value: [] },
        pushMessage(message) {
          this.messagesRef.value.push(clone(message))
        },
      }
      const chat = { state }
      chats.set(session.id, chat)
      return chat
    },
    async sendMessage(sessionId, payload) {
      sentMessages.push({
        sessionId,
        payload: clone(payload),
      })
      const session = sessions.find((item) => item.id === sessionId) || null
      if (!session) return
      const chat = this.getOrCreateChat(session)
      chat.state.pushMessage({
        id: `user-${sentMessages.length}`,
        role: 'user',
        parts: [{
          type: 'text',
          text: payload.text || '',
        }],
        createdAt: new Date().toISOString(),
      })
    },
    async saveSession(id) {
      savedSessions.push(id)
    },
  }
}

test('session labeling rules preserve launcher task labels but not freeform chat', () => {
  assert.equal(shouldPreserveAiSessionLabel({
    taskId: 'review.current-draft',
    source: 'launcher',
  }), true)

  assert.equal(shouldPreserveAiSessionLabel({
    taskId: 'chat.freeform',
    source: 'launcher-input',
  }), false)

  assert.equal(shouldSkipAutoTitleForSession({
    _ai: {
      taskId: 'pdf.summarise',
      source: 'launcher',
    },
  }), true)

  assert.equal(shouldSkipAutoTitleForSession({
    _workflow: {
      run: { id: 'run-1' },
    },
  }), true)

  assert.equal(shouldSkipAutoTitleForSession({
    _ai: {
      taskId: 'chat.freeform',
      source: 'launcher-input',
    },
  }), false)
})

test('task send payload preserves launcher labels but keeps freeform chats flexible', () => {
  const taskPayload = buildTaskSendPayload({
    ai: {
      role: 'researcher',
      taskId: 'pdf.summarise',
      source: 'launcher',
      label: 'Summarise PDF',
      toolProfile: 'researcher',
    },
    text: 'Summarise this PDF by section.',
  })

  const freeformPayload = buildTaskSendPayload({
    ai: {
      role: 'general',
      taskId: 'chat.freeform',
      source: 'launcher-input',
      label: 'General chat',
    },
    text: 'Help me think through this dataset.',
  })

  assert.equal(taskPayload.preserveLabel, true)
  assert.equal(taskPayload.text, 'Summarise this PDF by section.')
  assert.equal(freeformPayload.preserveLabel, false)
})

test('workflow launch helpers auto-send the real prompt before executor checkpoints', async () => {
  setActivePinia(createPinia())
  const chatStore = createFakeChatStore()
  const workflowRuns = useAiWorkflowRunsStore()
  workflowRuns.configureExecutor({ chatStore })

  const sessionId = chatStore.createSession('sonnet')
  const session = chatStore.sessions[0]
  session.label = 'Review current draft'
  session._ai = {
    role: 'reviewer',
    taskId: 'review.current-draft',
    source: 'launcher',
    label: 'Review current draft',
    toolProfile: 'reviewer',
  }

  const task = {
    workflowTemplateId: 'draft.review-revise',
    role: 'reviewer',
    toolProfile: 'reviewer',
    taskId: 'review.current-draft',
    source: 'launcher',
    label: 'Review current draft',
    prompt: 'Review this draft and stop before applying edits.',
    context: {
      currentFile: '/tmp/draft.md',
    },
  }

  const workflow = workflowRuns.createRunFromTemplate({
    templateId: task.workflowTemplateId,
    sessionId,
    context: {
      currentFile: '/tmp/draft.md',
      prompt: task.prompt,
      fileRefs: [{ path: '/tmp/draft.md', content: '# Draft' }],
    },
    autoRun: false,
  })
  session._workflow = workflowRuns.syncRunToSession(session)

  const workflowPayload = buildWorkflowSendPayload({
    task,
    workflow,
    hideFromTranscript: true,
  })
  const sent = await autoSendWorkflowMessage({
    chatStore,
    sessionId,
    task,
    workflow,
    hideFromTranscript: true,
  })

  assert.equal(sent, true)
  assert.equal(workflowPayload.text, 'Review this draft and stop before applying edits.')
  assert.equal(workflowPayload.fileRefs.length, 1)
  assert.equal(workflowPayload.preserveLabel, true)
  assert.equal(workflowPayload.hideFromTranscript, true)

  await workflowRuns.runExecutor({
    runId: workflow.run.id,
    sessionId,
    queueIfRunning: false,
  })
  session._workflow = workflowRuns.syncRunToSession(session)

  assert.equal(chatStore.sentMessages.length, 1)
  assert.equal(chatStore.sentMessages[0].payload.text, 'Review this draft and stop before applying edits.')
  assert.equal(chatStore.sentMessages[0].payload.preserveLabel, true)
  assert.equal(chatStore.sentMessages[0].payload.hideFromTranscript, true)
  assert.equal(session.label, 'Review current draft')
  assert.equal(session._workflow.template.id, 'draft.review-revise')
  assert.equal(session._workflow.run.status, 'waiting_user')
  assert.equal(session._workflow.run.checkpoints[0].type, 'apply_patch')
})

test('workflow launch helper skips empty auto-send payloads', async () => {
  const chatStore = createFakeChatStore()
  const sessionId = chatStore.createSession('sonnet')

  const sent = await autoSendWorkflowMessage({
    chatStore,
    sessionId,
    task: {
      workflowTemplateId: 'draft.review-revise',
      prompt: '',
      context: null,
    },
    workflow: {
      run: {
        context: {
          prompt: '',
          fileRefs: [],
        },
      },
    },
  })

  assert.equal(sent, false)
  assert.equal(chatStore.sentMessages.length, 0)
})
