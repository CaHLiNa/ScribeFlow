import {
  buildExtensionCommandHostState,
  buildExtensionRuntimeBlockDescriptor,
  isRuntimeBlockedCommandAction,
  isRuntimeBlockedResultEntry,
  isRuntimeBlockedTreeAction,
  isRuntimeBlockedTreePrimaryAction,
} from './extensionCommandHostState.ts'

export function buildExtensionActionSurfaceState({
  hostDiagnostics = {},
  primaryTreeItem = {},
  treeAction = {},
  headerAction = {},
  resultEntry = {},
} = {}) {
  const runtimeBlock = buildExtensionRuntimeBlockDescriptor(
    buildExtensionCommandHostState(hostDiagnostics)
  )

  return {
    runtimeBlock,
    primaryTreeItemBlocked: isRuntimeBlockedTreePrimaryAction(primaryTreeItem, runtimeBlock),
    treeActionBlocked: isRuntimeBlockedTreeAction(treeAction, runtimeBlock),
    headerActionBlocked: isRuntimeBlockedCommandAction(headerAction, runtimeBlock),
    resultEntryBlocked: isRuntimeBlockedResultEntry(resultEntry, runtimeBlock),
  }
}
