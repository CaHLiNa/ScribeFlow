function normalizeWorkspaceRoot(value = '') {
  return String(value || '').trim()
}

function normalizeExtensionId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeActionCommandId(action = {}) {
  return String(action?.commandId || action?.command || '').trim()
}

function normalizeResultAction(entry = {}) {
  return String(entry?.action || '').trim().toLowerCase()
}

function isExpandableTreeItem(item = {}) {
  const state = String(item?.collapsibleState || '').trim().toLowerCase()
  return Boolean(state && state !== 'none')
}

function renderTemplate(template = '', params = {}) {
  let rendered = String(template || '')
  for (const [key, value] of Object.entries(params || {})) {
    rendered = rendered.replaceAll(`{${key}}`, String(value ?? ''))
  }
  return rendered
}

export function buildExtensionCommandHostState(diagnostics = {}) {
  if (diagnostics?.ownsPendingPrompt) {
    const promptWorkspaceRoot = normalizeWorkspaceRoot(diagnostics.pendingPromptWorkspaceRoot || '')
    const pendingPromptInActiveWorkspace = diagnostics.pendingPromptInActiveWorkspace === true

    return {
      blocked: true,
      status: 'waiting',
      tone: 'is-warning',
      labelKey: 'Waiting for prompt',
      messageKey: pendingPromptInActiveWorkspace
        ? 'This extension is waiting for prompt input in this workspace. Complete or cancel that prompt before running another command.'
        : 'This extension is waiting for prompt input in {workspace}. Complete or cancel that prompt before running another command.',
      messageParams: pendingPromptInActiveWorkspace
        ? {}
        : { workspace: promptWorkspaceRoot || '/' },
    }
  }

  if (diagnostics?.blockedByForeignPrompt) {
    return {
      blocked: true,
      status: 'blocked',
      tone: 'is-blocked',
      labelKey: 'Blocked',
      messageKey: 'The shared extension host is currently blocked by {extensionId} in {workspace}. Resolve that prompt first.',
      messageParams: {
        extensionId: diagnostics.pendingPromptOwner?.extensionId || '',
        workspace: normalizeWorkspaceRoot(diagnostics.blockingPromptWorkspaceRoot || '') || '/',
      },
    }
  }

  return {
    blocked: false,
    status: 'ready',
    tone: '',
    labelKey: '',
    messageKey: '',
    messageParams: {},
  }
}

export function buildExtensionRuntimeBlockDescriptor(hostState = {}) {
  return {
    blocked: Boolean(hostState?.blocked),
    labelKey: String(hostState?.labelKey || '').trim(),
    messageKey: String(hostState?.messageKey || '').trim(),
    messageParams: hostState?.messageParams && typeof hostState.messageParams === 'object'
      ? { ...hostState.messageParams }
      : {},
    tone: String(hostState?.tone || '').trim(),
    status: String(hostState?.status || '').trim(),
  }
}

export function isRuntimeBlockedCommandAction(action = {}, runtimeBlock = {}) {
  return Boolean(runtimeBlock?.blocked) && Boolean(normalizeActionCommandId(action))
}

export function isRuntimeBlockedResultEntry(entry = {}, runtimeBlock = {}) {
  return Boolean(runtimeBlock?.blocked) &&
    normalizeResultAction(entry) === 'execute-command' &&
    Boolean(normalizeActionCommandId(entry))
}

export function isRuntimeBlockedTreePrimaryAction(item = {}, runtimeBlock = {}) {
  if (!runtimeBlock?.blocked) return false
  return !(isExpandableTreeItem(item) && !normalizeActionCommandId(item))
}

export function isRuntimeBlockedTreeAction(action = {}, runtimeBlock = {}) {
  return isRuntimeBlockedCommandAction(action, runtimeBlock)
}

export function buildExtensionCommandBlockedError(hostState = {}, context = {}) {
  const messageKey = String(hostState?.messageKey || 'The extension command cannot run right now.')
  const messageParams = hostState?.messageParams && typeof hostState.messageParams === 'object'
    ? { ...hostState.messageParams }
    : {}
  const error = new Error(renderTemplate(messageKey, messageParams))
  error.code = 'extension_host_command_blocked'
  error.extensionHostCommandBlocked = true
  error.hostState = String(hostState?.status || 'blocked').trim() || 'blocked'
  error.messageKey = messageKey
  error.messageParams = messageParams
  error.extensionId = normalizeExtensionId(context?.extensionId || '')
  error.commandId = String(context?.commandId || '').trim()
  return error
}

export function isExtensionCommandBlockedError(error = null) {
  return Boolean(
    error?.extensionHostCommandBlocked === true ||
    String(error?.code || '').trim() === 'extension_host_command_blocked'
  )
}

export function describeExtensionCommandError(error = null, fallbackMessageKey = '') {
  if (isExtensionCommandBlockedError(error)) {
    return {
      type: 'warning',
      messageKey: String(error?.messageKey || fallbackMessageKey || '').trim(),
      messageParams: error?.messageParams && typeof error.messageParams === 'object'
        ? { ...error.messageParams }
        : {},
      messageText: String(error?.message || '').trim(),
    }
  }

  return {
    type: 'error',
    messageKey: '',
    messageParams: {},
    messageText: String(error?.message || error || fallbackMessageKey || '').trim(),
  }
}
