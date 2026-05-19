import { invokeCommand as invoke } from '../tauriBridge.ts'

export function invokeDocumentWorkflowBridge(command, params = {}) {
  return invoke(command, { params })
}
