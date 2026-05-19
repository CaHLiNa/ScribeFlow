function normalizeExtensionId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeWorkspaceRoot(value = '') {
  return String(value || '').trim()
}

function uniqueWorkspaceRoots(values = []) {
  return [...new Set(values.map((value) => normalizeWorkspaceRoot(value || '/')).filter(Boolean))]
}

function normalizePendingPromptOwner(owner = null) {
  if (!owner || typeof owner !== 'object') return null
  const extensionId = normalizeExtensionId(owner.extensionId || owner.extension_id || '')
  const workspaceRoot = normalizeWorkspaceRoot(owner.workspaceRoot || owner.workspace_root || '')
  if (!extensionId) return null
  return {
    extensionId,
    workspaceRoot,
  }
}

export function activeRuntimeSlotsForExtension(hostStatus = {}, extensionId = '') {
  const normalizedExtensionId = normalizeExtensionId(extensionId)
  if (!normalizedExtensionId || !Array.isArray(hostStatus?.activeRuntimeSlots)) return []
  return hostStatus.activeRuntimeSlots
    .map((entry) => ({
      extensionId: normalizeExtensionId(entry?.extensionId || entry?.extension_id || ''),
      workspaceRoot: normalizeWorkspaceRoot(entry?.workspaceRoot || entry?.workspace_root || ''),
    }))
    .filter((entry) => entry.extensionId === normalizedExtensionId)
}

export function buildExtensionHostDiagnostics({
  extensionId = '',
  workspaceRoot = '',
  hostStatus = {},
  runtimeEntry = {},
} = {}) {
  const normalizedExtensionId = normalizeExtensionId(extensionId)
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot)
  const activeRuntimeSlots = activeRuntimeSlotsForExtension(hostStatus, normalizedExtensionId)
  const activeWorkspaceRuntimeSlots = normalizedWorkspaceRoot
    ? activeRuntimeSlots.filter((entry) => entry.workspaceRoot === normalizedWorkspaceRoot)
    : []
  const otherWorkspaceRuntimeSlots = normalizedWorkspaceRoot
    ? activeRuntimeSlots.filter((entry) => entry.workspaceRoot !== normalizedWorkspaceRoot)
    : []
  const pendingPromptOwner = normalizePendingPromptOwner(hostStatus?.pendingPromptOwner)
  const ownsPendingPrompt = pendingPromptOwner?.extensionId === normalizedExtensionId
  const blockedByForeignPrompt = Boolean(
    pendingPromptOwner &&
    normalizedExtensionId &&
    pendingPromptOwner.extensionId !== normalizedExtensionId,
  )
  const pendingPromptWorkspaceRoot = ownsPendingPrompt ? pendingPromptOwner?.workspaceRoot || '' : ''

  return {
    extensionId: normalizedExtensionId,
    workspaceRoot: normalizedWorkspaceRoot,
    activated: Boolean(runtimeEntry?.activated),
    slotCount: activeRuntimeSlots.length,
    activeRuntimeSlots,
    activeWorkspaceSlotCount: activeWorkspaceRuntimeSlots.length,
    activeWorkspaceRoots: uniqueWorkspaceRoots(
      activeWorkspaceRuntimeSlots.map((entry) => entry.workspaceRoot || '/'),
    ),
    otherWorkspaceSlotCount: otherWorkspaceRuntimeSlots.length,
    otherWorkspaceRoots: uniqueWorkspaceRoots(
      otherWorkspaceRuntimeSlots.map((entry) => entry.workspaceRoot || '/'),
    ),
    workspaceRoots: uniqueWorkspaceRoots(activeRuntimeSlots.map((entry) => entry.workspaceRoot || '/')),
    pendingPromptOwner,
    blockedByForeignPrompt,
    ownsPendingPrompt,
    pendingPromptWorkspaceRoot,
    pendingPromptInActiveWorkspace: Boolean(
      ownsPendingPrompt &&
      normalizedWorkspaceRoot &&
      pendingPromptWorkspaceRoot === normalizedWorkspaceRoot
    ),
    blockingPromptWorkspaceRoot: pendingPromptOwner?.workspaceRoot || '',
    hasActiveWorkspaceRuntime: activeWorkspaceRuntimeSlots.length > 0,
    hasOtherWorkspaceRuntime: otherWorkspaceRuntimeSlots.length > 0,
    hasLiveRuntime: activeRuntimeSlots.length > 0 || Boolean(runtimeEntry?.activated),
  }
}
