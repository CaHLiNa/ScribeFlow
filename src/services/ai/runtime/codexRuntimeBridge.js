import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const CODEX_RUNTIME_EVENT = 'codex-runtime-event'

export async function startCodexRuntimeThread({ title = '', cwd = '' } = {}) {
  return invoke('runtime_thread_start', {
    params: {
      title,
      cwd: cwd || null,
    },
  })
}

export async function listCodexRuntimeThreads() {
  return invoke('runtime_thread_list')
}

export async function readCodexRuntimeThread(threadId = '') {
  return invoke('runtime_thread_read', {
    params: {
      threadId,
    },
  })
}

export async function renameCodexRuntimeThread({ threadId = '', title = '' } = {}) {
  return invoke('runtime_thread_rename', {
    params: {
      threadId,
      title,
    },
  })
}

export async function archiveCodexRuntimeThread(threadId = '') {
  return invoke('runtime_thread_archive', {
    params: {
      threadId,
    },
  })
}

export async function unarchiveCodexRuntimeThread(threadId = '') {
  return invoke('runtime_thread_unarchive', {
    params: {
      threadId,
    },
  })
}

export async function forkCodexRuntimeThread({ threadId = '', title = '' } = {}) {
  return invoke('runtime_thread_fork', {
    params: {
      threadId,
      title,
    },
  })
}

export async function rollbackCodexRuntimeThread({ threadId = '', turns = 1 } = {}) {
  return invoke('runtime_thread_rollback', {
    params: {
      threadId,
      turns,
    },
  })
}

export async function requestCodexRuntimePermission(request = {}) {
  return invoke('runtime_permission_request', { params: request })
}

export async function resolveCodexRuntimePermission(request = {}) {
  return invoke('runtime_permission_resolve', { params: request })
}

export async function requestCodexRuntimeAskUser(request = {}) {
  return invoke('runtime_ask_user_request', { params: request })
}

export async function resolveCodexRuntimeAskUser(request = {}) {
  return invoke('runtime_ask_user_resolve', { params: request })
}

export async function requestCodexRuntimeExitPlan(request = {}) {
  return invoke('runtime_exit_plan_request', { params: request })
}

export async function resolveCodexRuntimeExitPlan(request = {}) {
  return invoke('runtime_exit_plan_resolve', { params: request })
}

export async function setCodexRuntimePlanMode(request = {}) {
  return invoke('runtime_plan_mode_set', { params: request })
}

export async function runCodexRuntimeTurn({
  threadId = '',
  userText = '',
  provider = {},
  workspacePath = '',
  enabledToolIds = [],
} = {}) {
  return invoke('runtime_turn_run', {
    params: {
      threadId,
      userText,
      provider: {
        providerId: provider.providerId,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        systemPrompt: provider.systemPrompt || '',
        temperature: provider.temperature,
        maxTokens: provider.maxTokens,
      },
      workspacePath,
      enabledToolIds,
    },
  })
}

export async function interruptCodexRuntimeTurn({ threadId = '', turnId = '' } = {}) {
  return invoke('runtime_turn_interrupt', {
    params: {
      threadId,
      turnId,
    },
  })
}

export async function listenCodexRuntimeEvents(onEvent = () => {}) {
  return listen(CODEX_RUNTIME_EVENT, (event) => {
    onEvent(event?.payload || {})
  })
}
