import { invoke } from '@tauri-apps/api/core'

export async function respondAnthropicAgentSdkPermission({
  streamId = '',
  requestId = '',
  behavior = 'deny',
  persist = false,
  message = '',
} = {}) {
  await invoke('respond_ai_anthropic_sdk_permission', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      behavior,
      persist,
      message,
    },
  })
}

export async function respondAnthropicAgentSdkAskUser({
  streamId = '',
  requestId = '',
  answers = {},
} = {}) {
  await invoke('respond_ai_anthropic_sdk_ask_user', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      answers,
    },
  })
}

export async function respondAnthropicAgentSdkExitPlan({
  streamId = '',
  requestId = '',
  action = 'deny',
  feedback = '',
} = {}) {
  await invoke('respond_ai_anthropic_sdk_exit_plan', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      action,
      feedback,
    },
  })
}
