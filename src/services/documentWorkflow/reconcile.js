import { invoke } from '@tauri-apps/api/core'

export {
  findRightNeighborLeaf,
  findWorkflowPreviewPane,
} from '../../domains/document/documentWorkflowReconcileRuntime.js'

export async function reconcileDocumentWorkflow(params = {}) {
  const workflowStore = params.workflowStore || {}
  const previewBindings = Object.values(workflowStore.previewBindings || workflowStore._previewBindings || {})
  return invoke('document_workflow_reconcile', {
    params: {
      activeFile: params.activeFile || '',
      activePaneId: params.activePaneId || '',
      paneTree: params.paneTree || null,
      trigger: params.trigger || 'manual',
      previewPrefs: workflowStore.previewPrefs || {},
      detachedSources: workflowStore.session?.detachedSources || {},
      previewBindings,
      force: params.force === true,
      previewKindOverride: params.previewKindOverride || '',
      allowLegacyPaneResult: params.allowLegacyPaneResult === true,
    },
  })
}
