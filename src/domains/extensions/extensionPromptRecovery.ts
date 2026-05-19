function normalizeOwner(owner = null) {
  const extensionId = String(owner?.extensionId || '').trim()
  const workspaceRoot = String(owner?.workspaceRoot || '').trim()
  if (!extensionId || !workspaceRoot) return null
  return {
    extensionId,
    workspaceRoot,
  }
}

export function buildExtensionPromptRecoveryDescriptor(owner = null, options = {}) {
  const normalized = normalizeOwner(owner)
  if (!normalized) {
    return {
      available: false,
      extensionId: '',
      workspaceRoot: '',
      labelKey: '',
      titleKey: '',
      titleParams: {},
    }
  }

  return {
    available: true,
    extensionId: normalized.extensionId,
    workspaceRoot: normalized.workspaceRoot,
    labelKey: options?.cancelling ? 'Cancelling...' : 'Cancel Prompt',
    titleKey: 'Cancel the blocking prompt from {extensionId} in {workspace}.',
    titleParams: {
      extensionId: normalized.extensionId,
      workspace: normalized.workspaceRoot || '/',
    },
  }
}
