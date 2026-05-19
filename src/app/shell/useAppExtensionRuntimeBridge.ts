import { onBeforeUnmount, onMounted } from 'vue'
import {
  listenExtensionHostCallRequested,
  listenExtensionHostInterrupted,
  listenExtensionWindowInputRequested,
  listenExtensionWindowMessage,
} from '../../services/extensions/extensionHostEvents'
import { resolveExtensionHostCall } from '../../services/extensions/extensionHost'
import { describeExtensionCommandError } from '../../domains/extensions/extensionCommandHostState'
import {
  eventMatchesKeybinding,
  isEditableKeybindingTarget,
} from '../../domains/extensions/extensionKeybindings'
import { isLinux, isMac, isWindows } from '../../platform'

function isCommandPaletteShortcut(event) {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key?.toLowerCase() === 'p'
}

export function useAppExtensionRuntimeBridge({
  commandPaletteVisible,
  commandPaletteTarget,
  extensionCommandContext,
  extensionWindowUi,
  extensionsStore,
  toastStore,
  t,
}) {
  let stopExtensionWindowMessageListener = null
  let stopExtensionWindowInputListener = null
  let stopExtensionHostCallListener = null
  let stopExtensionHostInterruptedListener = null

  async function handleGlobalKeydown(event) {
    if (event.defaultPrevented) return
    if (isCommandPaletteShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      commandPaletteVisible.value = true
      return
    }

    if (event.repeat) return
    if (commandPaletteVisible.value || isEditableKeybindingTarget(event.target)) return
    const keybinding = extensionsStore
      .keybindingsForContext(extensionCommandContext.value)
      .find((candidate) =>
        eventMatchesKeybinding(event, candidate, { isMac, isWindows, isLinux })
      )
    if (!keybinding) return
    event.preventDefault()
    event.stopPropagation()
    try {
      await extensionsStore.executeCommand(keybinding, commandPaletteTarget.value)
      toastStore.show(t('Extension task started'), { type: 'success', duration: 2400 })
    } catch (error) {
      const commandError = describeExtensionCommandError(error, t('Failed to start extension task'))
      toastStore.show(
        commandError.messageKey
          ? t(commandError.messageKey, commandError.messageParams)
          : commandError.messageText || t('Failed to start extension task'),
        {
          type: commandError.type,
          duration: 4200,
        },
      )
    }
  }

  async function handleExtensionWindowPromptCancel() {
    await extensionWindowUi.cancel()
    await extensionsStore.syncHostSummaryAfterPromptEvent().catch(() => {})
    await extensionsStore.flushDeferredViewRequests().catch(() => {})
  }

  async function handleExtensionWindowPromptSubmit(value) {
    await extensionWindowUi.resolve(value)
    await extensionsStore.syncHostSummaryAfterPromptEvent().catch(() => {})
    await extensionsStore.flushDeferredViewRequests().catch(() => {})
  }

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown, true)
    void extensionsStore.startHostEventBridge().catch(() => {})
    void listenExtensionWindowMessage((event) => {
      const payload = event?.payload || {}
      const severity = String(payload.severity || 'info')
      const type = severity === 'error'
        ? 'error'
        : severity === 'warning'
          ? 'warning'
          : 'info'
      toastStore.show(String(payload.message || ''), {
        type,
        duration: 3600,
      })
    }).then((unlisten) => {
      stopExtensionWindowMessageListener = unlisten
    }).catch(() => {})
    void listenExtensionWindowInputRequested((event) => {
      extensionWindowUi.presentRequest(event?.payload || {})
      void extensionsStore.syncHostSummaryAfterPromptEvent().catch(() => {})
    }).then((unlisten) => {
      stopExtensionWindowInputListener = unlisten
    }).catch(() => {})
    void listenExtensionHostCallRequested((event) => {
      const payload = event?.payload || {}
      void resolveExtensionHostCall({
        requestId: String(payload.requestId || ''),
        accepted: false,
        result: null,
        error: `Unhandled extension host call kind: ${String(payload.kind || 'unknown')}`,
      }).catch(() => {})
    }).then((unlisten) => {
      stopExtensionHostCallListener = unlisten
    }).catch(() => {})
    void listenExtensionHostInterrupted((event) => {
      const payload = event?.payload || {}
      const requestId = String(payload.requestId || '')
      if (requestId && extensionWindowUi.pendingRequest?.requestId === requestId) {
        extensionWindowUi.clearRequest()
        void extensionsStore.syncHostSummaryAfterPromptEvent().catch(() => {})
        void extensionsStore.flushDeferredViewRequests().catch(() => {})
      }
    }).then((unlisten) => {
      stopExtensionHostInterruptedListener = unlisten
    }).catch(() => {})
    void extensionsStore.refreshRegistry().catch(() => {})
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGlobalKeydown, true)
    extensionsStore.stopHostEventBridge()
    stopExtensionWindowMessageListener?.()
    stopExtensionWindowMessageListener = null
    stopExtensionWindowInputListener?.()
    stopExtensionWindowInputListener = null
    stopExtensionHostCallListener?.()
    stopExtensionHostCallListener = null
    stopExtensionHostInterruptedListener?.()
    stopExtensionHostInterruptedListener = null
  })

  return {
    handleExtensionWindowPromptCancel,
    handleExtensionWindowPromptSubmit,
  }
}
