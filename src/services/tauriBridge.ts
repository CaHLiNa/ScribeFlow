import { invoke } from '@tauri-apps/api/core'
import { listen, type Event, type UnlistenFn } from '@tauri-apps/api/event'

export type TauriCommandArgs = Record<string, unknown>

export function invokeCommand<TResult = unknown>(
  command: string,
  args?: TauriCommandArgs,
): Promise<TResult> {
  return invoke<TResult>(command, args)
}

export function listenToNativeEvent<TPayload = unknown>(
  eventName: string,
  handler: (payload: TPayload, event: Event<TPayload>) => void,
): Promise<UnlistenFn> {
  return listen<TPayload>(eventName, (event) => {
    handler(event.payload, event)
  })
}
