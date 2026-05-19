function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function formatWorkspaceLabel(workspaceRoot = '') {
  return String(workspaceRoot || '').trim() || '/'
}

export function buildExtensionHostStatusSurface(diagnostics = {}, options = {}) {
  const pendingPromptOwner = diagnostics?.pendingPromptOwner || null
  const blockedByForeignPrompt = diagnostics?.blockedByForeignPrompt === true
  const ownsPendingPrompt = diagnostics?.ownsPendingPrompt === true
  const hasActiveWorkspaceRuntime = diagnostics?.hasActiveWorkspaceRuntime === true
  const hasOtherWorkspaceRuntime = diagnostics?.hasOtherWorkspaceRuntime === true
  const activated = diagnostics?.activated === true
  const activeWorkspaceSlotCount = Number(diagnostics?.activeWorkspaceSlotCount || 0)
  const otherWorkspaceSlotCount = Number(diagnostics?.otherWorkspaceSlotCount || 0)
  const activeWorkspaceRoots = unique(Array.isArray(diagnostics?.activeWorkspaceRoots) ? diagnostics.activeWorkspaceRoots : [])
  const otherWorkspaceRoots = unique(Array.isArray(diagnostics?.otherWorkspaceRoots) ? diagnostics.otherWorkspaceRoots : [])
  const hostHasSlots = Array.isArray(options?.hostRuntimeSlots)
    ? options.hostRuntimeSlots.length > 0
    : Boolean(diagnostics?.slotCount)

  let badgeKey = ''
  let titleKey = ''
  let descriptionKey = ''
  let descriptionParams = {}
  let summaryParts = []
  let toneClass = ''
  let recoveryOwner = null

  if (blockedByForeignPrompt || ownsPendingPrompt) {
    badgeKey = blockedByForeignPrompt ? 'Blocked' : 'Waiting for prompt'
    titleKey = 'Extension host is waiting for prompt input'
    descriptionKey = blockedByForeignPrompt
      ? 'A pending prompt from {extensionId} in {workspace} is blocking new top-level host requests until it is completed or cancelled.'
      : 'This extension is waiting for prompt input in {workspace}. Complete or cancel that prompt before running another command.'
    descriptionParams = blockedByForeignPrompt
      ? {
          extensionId: pendingPromptOwner?.extensionId || '',
          workspace: formatWorkspaceLabel(diagnostics?.blockingPromptWorkspaceRoot || ''),
        }
      : {
          workspace: formatWorkspaceLabel(diagnostics?.pendingPromptWorkspaceRoot || ''),
        }
    toneClass = 'is-warning'
    recoveryOwner = blockedByForeignPrompt
      ? {
          extensionId: pendingPromptOwner?.extensionId || '',
          workspaceRoot: formatWorkspaceLabel(diagnostics?.blockingPromptWorkspaceRoot || ''),
        }
      : {
          extensionId: diagnostics?.extensionId || '',
          workspaceRoot: formatWorkspaceLabel(diagnostics?.pendingPromptWorkspaceRoot || ''),
        }
  } else if (hostHasSlots) {
    badgeKey = 'Active'
    titleKey = 'Extension host runtime is active'
    descriptionKey = 'Live runtime slots are currently attached to one or more workspace-scoped extensions.'
    toneClass = hasOtherWorkspaceRuntime ? 'is-info' : 'is-active'
  } else {
    badgeKey = 'Idle'
    titleKey = 'Extension host runtime is idle'
    descriptionKey = 'No extension runtime slots are currently active.'
    toneClass = 'is-idle'
  }

  if (hasActiveWorkspaceRuntime) {
    summaryParts.push(
      activeWorkspaceSlotCount > 1
        ? {
            key: 'Active in {count} slots for this workspace',
            params: { count: activeWorkspaceSlotCount },
          }
        : { key: 'Active in this workspace', params: {} },
    )
  } else if (activated) {
    summaryParts.push({
      key: 'Runtime activated but no active slot is attached to this workspace',
      params: {},
    })
  }

  if (hasOtherWorkspaceRuntime) {
    const roots = otherWorkspaceRoots.map(formatWorkspaceLabel).join(' · ')
    summaryParts.push(
      otherWorkspaceSlotCount > 1
        ? {
            key: 'Also active in other workspaces: {roots}',
            params: { roots },
          }
        : {
            key: 'Also active in another workspace: {roots}',
            params: { roots },
          },
    )
  }

  if (blockedByForeignPrompt) {
    summaryParts.push({
      key: 'Blocked by prompt from {extensionId} in {workspace}',
      params: {
        extensionId: pendingPromptOwner?.extensionId || '',
        workspace: formatWorkspaceLabel(diagnostics?.blockingPromptWorkspaceRoot || ''),
      },
    })
  }

  if (ownsPendingPrompt) {
    summaryParts.push(
      diagnostics?.pendingPromptInActiveWorkspace
        ? { key: 'Waiting for prompt input in this workspace', params: {} }
        : {
            key: 'Waiting for prompt input in {workspace}',
            params: {
              workspace: formatWorkspaceLabel(diagnostics?.pendingPromptWorkspaceRoot || ''),
            },
          },
    )
  }

  return {
    badgeKey,
    titleKey,
    descriptionKey,
    descriptionParams,
    toneClass,
    summaryParts,
    recoveryOwner: recoveryOwner?.extensionId && recoveryOwner?.workspaceRoot
      ? recoveryOwner
      : null,
  }
}
