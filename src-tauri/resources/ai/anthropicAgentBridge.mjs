#!/usr/bin/env node

import readline from 'node:readline'

function writeEvent(payload = {}) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function normalizeAnthropicBaseUrlForSdk(baseUrl = '') {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v\d+\/messages$/, '')
    .replace(/\/v\d+$/, '')
}

function createControlChannel() {
  const interfaceRef = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })
  const pendingPermissionResolvers = new Map()
  const pendingAskUserResolvers = new Map()
  const pendingExitPlanResolvers = new Map()
  let initialized = false
  let initialResolver = null

  const initial = new Promise((resolve) => {
    initialResolver = resolve
  })

  interfaceRef.on('line', (line) => {
    const trimmed = String(line || '').trim()
    if (!trimmed) return

    let payload = null
    try {
      payload = JSON.parse(trimmed)
    } catch {
      return
    }

    if (!initialized) {
      initialized = true
      initialResolver?.(payload)
      return
    }

    if (payload?.kind === 'permission_response') {
      const requestId = String(payload.requestId || '').trim()
      const resolve = pendingPermissionResolvers.get(requestId)
      if (resolve) {
        pendingPermissionResolvers.delete(requestId)
        resolve(payload)
      }
    }

    if (payload?.kind === 'ask_user_response') {
      const requestId = String(payload.requestId || '').trim()
      const resolve = pendingAskUserResolvers.get(requestId)
      if (resolve) {
        pendingAskUserResolvers.delete(requestId)
        resolve(payload)
      }
    }

    if (payload?.kind === 'exit_plan_response') {
      const requestId = String(payload.requestId || '').trim()
      const resolve = pendingExitPlanResolvers.get(requestId)
      if (resolve) {
        pendingExitPlanResolvers.delete(requestId)
        resolve(payload)
      }
    }
  })

  interfaceRef.on('close', () => {
    for (const resolve of pendingPermissionResolvers.values()) {
      resolve({
        behavior: 'deny',
        message: 'The Anthropic SDK control channel was closed.',
      })
    }
    pendingPermissionResolvers.clear()

    for (const resolve of pendingAskUserResolvers.values()) {
      resolve({
        answers: {},
        message: 'The Anthropic SDK control channel was closed.',
      })
    }
    pendingAskUserResolvers.clear()

    for (const resolve of pendingExitPlanResolvers.values()) {
      resolve({
        action: 'deny',
        feedback: 'The Anthropic SDK control channel was closed.',
      })
    }
    pendingExitPlanResolvers.clear()
  })

  return {
    initial,
    waitForPermissionResponse(requestId = '', signal) {
      return new Promise((resolve) => {
        const normalizedRequestId = String(requestId || '').trim()
        if (!normalizedRequestId) {
          resolve({ behavior: 'deny', message: 'Missing permission request id.' })
          return
        }

        pendingPermissionResolvers.set(normalizedRequestId, resolve)

        if (signal) {
          signal.addEventListener('abort', () => {
            if (pendingPermissionResolvers.has(normalizedRequestId)) {
              pendingPermissionResolvers.delete(normalizedRequestId)
              resolve({
                behavior: 'deny',
                message: 'The permission request was aborted.',
              })
            }
          }, { once: true })
        }
      })
    },
    waitForAskUserResponse(requestId = '', signal) {
      return new Promise((resolve) => {
        const normalizedRequestId = String(requestId || '').trim()
        if (!normalizedRequestId) {
          resolve({ answers: {}, message: 'Missing ask-user request id.' })
          return
        }

        pendingAskUserResolvers.set(normalizedRequestId, resolve)

        if (signal) {
          signal.addEventListener('abort', () => {
            if (pendingAskUserResolvers.has(normalizedRequestId)) {
              pendingAskUserResolvers.delete(normalizedRequestId)
              resolve({
                answers: {},
                message: 'The ask-user request was aborted.',
              })
            }
          }, { once: true })
        }
      })
    },
    waitForExitPlanResponse(requestId = '', signal) {
      return new Promise((resolve) => {
        const normalizedRequestId = String(requestId || '').trim()
        if (!normalizedRequestId) {
          resolve({ action: 'deny', feedback: 'Missing exit-plan request id.' })
          return
        }

        pendingExitPlanResolvers.set(normalizedRequestId, resolve)

        if (signal) {
          signal.addEventListener('abort', () => {
            if (pendingExitPlanResolvers.has(normalizedRequestId)) {
              pendingExitPlanResolvers.delete(normalizedRequestId)
              resolve({
                action: 'deny',
                feedback: 'The exit-plan request was aborted.',
              })
            }
          }, { once: true })
        }
      })
    },
  }
}

function extractAssistantText(message = null) {
  const blocks = Array.isArray(message?.message?.content) ? message.message.content : []
  return blocks
    .map((block) => {
      if (block?.type === 'text') return String(block.text || '')
      return ''
    })
    .join('')
}

function extractAssistantReasoning(message = null) {
  const blocks = Array.isArray(message?.message?.content) ? message.message.content : []
  return blocks
    .map((block) => {
      if (block?.type === 'thinking') return String(block.thinking || '')
      return ''
    })
    .join('')
}

function ensureToolRecord(state, toolCallId = '', toolName = '') {
  const normalizedToolCallId = String(toolCallId || '').trim()
  if (!normalizedToolCallId) return null
  if (!state.tools.has(normalizedToolCallId)) {
    state.tools.set(normalizedToolCallId, {
      toolCallId: normalizedToolCallId,
      toolName: String(toolName || '').trim() || normalizedToolCallId,
      status: 'running',
    })
  }
  return state.tools.get(normalizedToolCallId) || null
}

function resolveAskUserPrompt(input = {}) {
  if (Array.isArray(input.questions) && input.questions.length > 0) {
    const firstQuestion = input.questions[0]
    return String(firstQuestion?.question || firstQuestion?.prompt || '').trim()
  }
  return String(
    input.question
    || input.prompt
    || input.message
    || input.text
    || ''
  ).trim()
}

function parseAskUserQuestions(input = {}) {
  const questions = Array.isArray(input.questions) ? input.questions : []
  return questions
    .map((question, index) => {
      const raw = question && typeof question === 'object' ? question : {}
      const options = Array.isArray(raw.options)
        ? raw.options
            .map((option) => ({
              label: String(option?.label || '').trim(),
              description: String(option?.description || '').trim(),
            }))
            .filter((option) => option.label)
        : []

      return {
        id: String(raw.id || `question-${index + 1}`).trim(),
        header: String(raw.header || '').trim(),
        question: String(raw.question || raw.prompt || '').trim(),
        multiSelect: raw.multiSelect === true,
        options,
      }
    })
    .filter((question) => question.question)
}

function parseExitPlanAllowedPrompts(input = {}) {
  const allowedPrompts = Array.isArray(input.allowedPrompts) ? input.allowedPrompts : []
  return allowedPrompts
    .map((entry) => ({
      tool: String(entry?.tool || 'Bash').trim() || 'Bash',
      prompt: String(entry?.prompt || '').trim(),
    }))
    .filter((entry) => entry.prompt)
}

function extractToolResultText(content = null) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry?.type === 'text') return String(entry.text || '')
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text
    return JSON.stringify(content)
  }
  return ''
}

function normalizeTaskUsage(usage = null) {
  if (!usage || typeof usage !== 'object') return null

  return {
    totalTokens: Number(usage.total_tokens || 0) || 0,
    toolUses: Number(usage.tool_uses || 0) || 0,
    durationMs: Number(usage.duration_ms || 0) || 0,
  }
}

function normalizePermissionMode(value = '') {
  const normalized = String(value || '').trim()
  if (normalized === 'plan') return 'plan'
  if (normalized === 'bypassPermissions' || normalized === 'bypass-permissions') {
    return 'bypassPermissions'
  }
  return 'acceptEdits'
}

function emitStreamEvent(event = {}) {
  writeEvent({
    kind: 'event',
    event,
  })
}

function maybeEmitResumeStart(state) {
  if (!state.waitingResumePending) return

  state.waitingResumePending = false
  state.taskStates.clear()
  emitStreamEvent({
    type: 'resume_start',
    messageId: `resume:${Date.now().toString(36)}`,
  })
}

function buildPermissionRequestSummary(input = {}) {
  const serialized = JSON.stringify(input || {})
  if (!serialized || serialized === '{}') return ''
  return serialized.length > 280
    ? `${serialized.slice(0, 280).trimEnd()}…`
    : serialized
}

function handleRawSdkStreamEvent(rawEvent = {}, state) {
  if (rawEvent?.type === 'content_block_start' && rawEvent?.content_block?.type === 'tool_use') {
    const toolCallId = String(rawEvent.content_block.id || '').trim()
    const toolName = String(rawEvent.content_block.name || '').trim()
    const toolInput = rawEvent.content_block.input && typeof rawEvent.content_block.input === 'object'
      ? rawEvent.content_block.input
      : {}
    const record = ensureToolRecord(state, toolCallId, toolName)
    if (record) {
      emitStreamEvent({
        type: 'tool_call_start',
        toolCallId: record.toolCallId,
        toolName: record.toolName,
      })

      if (toolName === 'EnterPlanMode') {
        state.permissionMode = 'plan'
        emitStreamEvent({
          type: 'plan_mode_start',
          summary: String(toolInput.summary || '').trim(),
          note: String(toolInput.note || '').trim(),
        })
        emitStreamEvent({
          type: 'permission_mode_changed',
          mode: 'plan',
        })
      }

      if (['Bash', 'TodoWrite'].includes(toolName)) {
        emitStreamEvent({
          type: 'background_task',
          id: record.toolCallId,
          label: toolName,
          status: 'running',
        })
      }
    }
    return
  }

  if (rawEvent?.delta?.type === 'text_delta' && rawEvent.delta.text) {
    maybeEmitResumeStart(state)
    const delta = String(rawEvent.delta.text || '')
    state.content += delta
    emitStreamEvent({
      type: 'chunk',
      delta,
      text: state.content,
    })
    return
  }

  if (rawEvent?.delta?.type === 'thinking_delta' && rawEvent.delta.thinking) {
    maybeEmitResumeStart(state)
    const delta = String(rawEvent.delta.thinking || '')
    state.reasoning += delta
    emitStreamEvent({
      type: 'reasoning',
      delta,
      text: state.reasoning,
    })
    return
  }

  if (rawEvent?.type === 'message_delta' && rawEvent?.delta?.stop_reason) {
    state.stopReason = String(rawEvent.delta.stop_reason || '').trim()
  }
}

function handleSdkSystemMessage(message = {}, state) {
  const subtype = String(message?.subtype || '').trim()

  if (subtype === 'compacting') {
    emitStreamEvent({ type: 'compacting' })
    return
  }

  if (subtype === 'compact_boundary') {
    emitStreamEvent({ type: 'compact_complete' })
    return
  }

  if (subtype === 'task_started' && message.task_id) {
    state.taskStates.set(String(message.task_id || '').trim(), 'running')
    emitStreamEvent({
      type: 'task_started',
      taskId: String(message.task_id || '').trim(),
      description: String(message.description || '').trim(),
      taskType: String(message.task_type || '').trim(),
      toolUseId: String(message.tool_use_id || '').trim(),
    })
    return
  }

  if (subtype === 'task_progress' && message.task_id) {
    emitStreamEvent({
      type: 'task_progress',
      taskId: String(message.task_id || '').trim(),
      toolUseId: String(message.tool_use_id || '').trim(),
      description: String(message.description || '').trim(),
      lastToolName: String(message.last_tool_name || '').trim(),
      usage: normalizeTaskUsage(message.usage),
    })
    return
  }

  if (subtype === 'task_notification' && message.task_id) {
    const taskId = String(message.task_id || '').trim()
    const status = String(message.status || 'completed').trim() || 'completed'
    state.taskStates.set(taskId, status)
    emitStreamEvent({
      type: 'task_notification',
      taskId,
      toolUseId: String(message.tool_use_id || '').trim(),
      status,
      summary: String(message.summary || '').trim(),
      outputFile: String(message.output_file || '').trim(),
      usage: normalizeTaskUsage(message.usage),
    })

    const taskStates = [...state.taskStates.values()]
    if (
      taskStates.length > 0
      && taskStates.every((value) => ['completed', 'failed', 'stopped'].includes(value))
      && !state.waitingResumePending
    ) {
      state.waitingResumePending = true
      emitStreamEvent({
        type: 'waiting_resume',
        message: '',
      })
    }
  }
}

async function main() {
  const controlChannel = createControlChannel()
  const request = await controlChannel.initial
  const prompt = String(request.prompt || '').trim()
  const apiKey = String(request.apiKey || '').trim()
  const model = String(request.model || '').trim()

  if (!prompt) {
    throw new Error('Anthropic Agent SDK prompt is missing.')
  }
  if (!apiKey) {
    throw new Error('Anthropic API key is missing for the SDK bridge.')
  }
  if (!model) {
    throw new Error('Anthropic model is missing for the SDK bridge.')
  }

  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const availableTools = Array.isArray(request.tools) && request.tools.length > 0
    ? request.tools.map((tool) => String(tool || '').trim()).filter(Boolean)
    : ['Read', 'Glob', 'Grep', 'LS']
  const allowedTools = Array.isArray(request.allowedTools) && request.allowedTools.length > 0
    ? request.allowedTools.map((tool) => String(tool || '').trim()).filter(Boolean)
    : availableTools
  const toolPolicies = request.toolPolicies && typeof request.toolPolicies === 'object'
    ? request.toolPolicies
    : {}

  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'altals/1.0.10',
  }

  const normalizedBaseUrl = normalizeAnthropicBaseUrlForSdk(request.baseUrl)
  if (normalizedBaseUrl) {
    env.ANTHROPIC_BASE_URL = normalizedBaseUrl
  } else {
    delete env.ANTHROPIC_BASE_URL
  }

  const state = {
    content: '',
    reasoning: '',
    stopReason: '',
    tools: new Map(),
    taskStates: new Map(),
    waitingResumePending: false,
    permissionMode: normalizePermissionMode(
      request.permissionMode
        || (String(request.approvalMode || '').trim() === 'plan' ? 'plan' : 'acceptEdits')
    ),
  }

  const iterator = query({
    prompt,
    options: {
      model,
      cwd: String(request.cwd || '').trim() || process.cwd(),
      maxTurns: Number.isFinite(Number(request.maxTurns)) ? Number(request.maxTurns) : 8,
      systemPrompt: String(request.systemPrompt || '').trim() || undefined,
      includePartialMessages: true,
      permissionMode: state.permissionMode === 'plan' ? 'plan' : 'default',
      tools: availableTools,
      allowedTools,
      canUseTool: async (toolName, input, options) => {
        const normalizedToolName = String(toolName || '').trim()
        const explicitPolicy = String(toolPolicies?.[normalizedToolName] || '').trim()

        if (normalizedToolName === 'AskUserQuestion') {
          emitStreamEvent({
            type: 'ask_user_request',
            requestId: options.toolUseID,
            toolUseId: options.toolUseID,
            toolName: normalizedToolName,
            title: String(input.title || '').trim(),
            prompt: resolveAskUserPrompt(input),
            description: String(input.description || '').trim(),
            questions: parseAskUserQuestions(input),
          })

          const response = await controlChannel.waitForAskUserResponse(
            options.toolUseID,
            options.signal
          )

          emitStreamEvent({
            type: 'ask_user_resolved',
            requestId: options.toolUseID,
            toolUseId: options.toolUseID,
            toolName: normalizedToolName,
          })

          return {
            behavior: 'allow',
            toolUseID: options.toolUseID,
            updatedInput: {
              ...(input && typeof input === 'object' ? input : {}),
              answers: response?.answers && typeof response.answers === 'object'
                ? response.answers
                : {},
            },
          }
        }

        if (normalizedToolName === 'EnterPlanMode') {
          return {
            behavior: 'allow',
            toolUseID: options.toolUseID,
          }
        }

        if (normalizedToolName === 'ExitPlanMode') {
          emitStreamEvent({
            type: 'exit_plan_mode_request',
            requestId: options.toolUseID,
            toolUseId: options.toolUseID,
            toolName: normalizedToolName,
            allowedPrompts: parseExitPlanAllowedPrompts(input),
          })

          const response = await controlChannel.waitForExitPlanResponse(
            options.toolUseID,
            options.signal
          )
          const action = String(response?.action || 'deny').trim()

          emitStreamEvent({
            type: 'exit_plan_mode_resolved',
            requestId: options.toolUseID,
            toolUseId: options.toolUseID,
            toolName: normalizedToolName,
            action,
          })

          if (action === 'approve_auto' || action === 'approve_edit') {
            const nextMode = action === 'approve_auto' ? 'bypassPermissions' : 'acceptEdits'
            state.permissionMode = nextMode
            emitStreamEvent({
              type: 'permission_mode_changed',
              mode: nextMode,
            })

            return {
              behavior: 'allow',
              toolUseID: options.toolUseID,
              updatedInput: input && typeof input === 'object' ? input : {},
            }
          }

          return {
            behavior: 'deny',
            toolUseID: options.toolUseID,
            message: String(
              response?.feedback
              || (action === 'feedback'
                ? 'The user requested plan changes.'
                : 'The user denied the plan.')
            ),
            decisionClassification: 'user_reject',
          }
        }

        if (explicitPolicy === 'deny') {
          emitStreamEvent({
            type: 'permission_resolved',
            requestId: options.toolUseID,
            toolUseId: options.toolUseID,
            toolName: normalizedToolName,
            behavior: 'deny',
          })
          return {
            behavior: 'deny',
            message: `Blocked by Altals tool policy: ${normalizedToolName}`,
            decisionClassification: 'user_reject',
          }
        }

        if (explicitPolicy === 'allow') {
          emitStreamEvent({
            type: 'permission_resolved',
            requestId: options.toolUseID,
            toolUseId: options.toolUseID,
            toolName: normalizedToolName,
            behavior: 'allow',
          })
          return {
            behavior: 'allow',
            toolUseID: options.toolUseID,
            decisionClassification: 'user_permanent',
            updatedPermissions: Array.isArray(options.suggestions) ? options.suggestions : undefined,
          }
        }

        if (state.permissionMode === 'bypassPermissions') {
          return {
            behavior: 'allow',
            toolUseID: options.toolUseID,
            decisionClassification: 'user_temporary',
          }
        }

        emitStreamEvent({
          type: 'permission_request',
          requestId: options.toolUseID,
          toolUseId: options.toolUseID,
          toolName: normalizedToolName,
          title: String(options.title || '').trim(),
          displayName: String(options.displayName || '').trim(),
          description: String(options.description || '').trim(),
          decisionReason: String(options.decisionReason || '').trim(),
          inputPreview: buildPermissionRequestSummary(input),
        })

        const response = await controlChannel.waitForPermissionResponse(
          options.toolUseID,
          options.signal
        )
        const behavior = String(response?.behavior || 'deny').trim() === 'allow' ? 'allow' : 'deny'
        const persist = response?.persist === true

        emitStreamEvent({
          type: 'permission_resolved',
          requestId: options.toolUseID,
          toolUseId: options.toolUseID,
          toolName: normalizedToolName,
          behavior,
          persist,
        })

        if (behavior === 'allow') {
          return {
            behavior: 'allow',
            toolUseID: options.toolUseID,
            decisionClassification: persist ? 'user_permanent' : 'user_temporary',
            updatedPermissions: persist && Array.isArray(options.suggestions)
              ? options.suggestions
              : undefined,
          }
        }

        return {
          behavior: 'deny',
          message: String(response?.message || `Denied by the Altals desktop approval flow: ${normalizedToolName}`),
          toolUseID: options.toolUseID,
          decisionClassification: 'user_reject',
        }
      },
      env,
    },
  })

  for await (const message of iterator) {
    if (message?.type === 'stream_event') {
      handleRawSdkStreamEvent(message.event, state)
      continue
    }

    if (message?.type === 'tool_progress') {
      const toolCallId = String(message.tool_use_id || '').trim()
      const toolName = String(message.tool_name || '').trim()
      const record = ensureToolRecord(state, toolCallId, toolName)
      const elapsedSeconds = Math.max(1, Math.round(Number(message.elapsed_time_seconds || 0)))
      if (record) {
        emitStreamEvent({
          type: 'tool_call_progress',
          toolCallId: record.toolCallId,
          toolName: record.toolName,
          elapsedSeconds,
        })
      }
      emitStreamEvent({
        type: 'task_progress',
        taskId: String(message.task_id || '').trim(),
        toolUseId: toolCallId,
        elapsedSeconds,
      })
      continue
    }

    if (message?.type === 'system') {
      handleSdkSystemMessage(message, state)
      continue
    }

    if (message?.type === 'assistant') {
      maybeEmitResumeStart(state)
      const assistantText = extractAssistantText(message)
      if (assistantText && assistantText.length > state.content.length) {
        const delta = assistantText.slice(state.content.length)
        state.content = assistantText
        emitStreamEvent({
          type: 'chunk',
          delta,
          text: state.content,
        })
      }

      const assistantReasoning = extractAssistantReasoning(message)
      if (assistantReasoning && assistantReasoning.length > state.reasoning.length) {
        const delta = assistantReasoning.slice(state.reasoning.length)
        state.reasoning = assistantReasoning
        emitStreamEvent({
          type: 'reasoning',
          delta,
          text: state.reasoning,
        })
      }
      continue
    }

    if (message?.type === 'user') {
      const blocks = Array.isArray(message?.message?.content) ? message.message.content : []
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue

        const toolCallId = String(block.tool_use_id || '').trim()
        const record = state.tools.get(toolCallId)
        const toolName = String(record?.toolName || toolCallId || 'tool').trim()
        const detail = extractToolResultText(block.content).slice(0, 500)
        const isError = block.is_error === true

        emitStreamEvent({
          type: 'tool_call_done',
          toolCallId,
          toolName,
          detail,
          isError,
        })

        if (toolName === 'ExitPlanMode') {
          emitStreamEvent({
            type: 'plan_mode_end',
          })
        }

        if (['Bash', 'TodoWrite'].includes(toolName)) {
          emitStreamEvent({
            type: 'background_task',
            id: toolCallId,
            label: toolName,
            status: 'done',
            detail,
          })
        }

        state.tools.delete(toolCallId)
      }
      continue
    }

    if (message?.type === 'result' && message?.subtype === 'error') {
      throw new Error(String(message.result || message.error || 'Anthropic Agent SDK run failed.'))
    }
  }

  for (const record of state.tools.values()) {
    emitStreamEvent({
      type: 'tool_call_done',
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      detail: 'The SDK tool run completed.',
      isError: false,
    })
  }

  writeEvent({
    kind: 'done',
    content: state.content,
    reasoning: state.reasoning,
    stopReason: state.stopReason || 'end_turn',
  })
}

main().catch((error) => {
  writeEvent({
    kind: 'error',
    error: error instanceof Error ? error.message : String(error || 'Anthropic Agent SDK run failed.'),
  })
  process.exitCode = 1
})
