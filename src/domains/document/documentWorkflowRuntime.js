import { executeDocumentWorkflowController } from '../../services/documentWorkflow/controllerBridge.js'

function normalizeBinding(binding = null) {
  if (!binding || typeof binding !== 'object') return null
  if (!binding.previewPath || !binding.sourcePath) return null
  return {
    previewPath: String(binding.previewPath),
    sourcePath: String(binding.sourcePath),
    previewKind: binding.previewKind || null,
    kind: binding.kind || null,
    paneId: binding.paneId || null,
    detachOnClose: binding.detachOnClose !== false,
  }
}

export function createDocumentWorkflowRuntime({
  getSession,
  getPreviewPrefs,
  getPreviewBindings,
  bindPreview,
  unbindPreview,
  getPreferredPreviewKind,
  clearDetached,
  markDetached,
  handlePreviewClosed,
  setSessionState,
  getIsReconciling,
  setIsReconciling,
  setLastTrigger,
  getEditorStore,
  jumpPreviewToCursor,
} = {}) {
  async function invokeController(operation, params = {}) {
    const editorStore = getEditorStore?.()
    if (!editorStore) return null

    return executeDocumentWorkflowController({
      operation,
      activeFile: params.activeFile || editorStore.activeTab || '',
      activePaneId: params.activePaneId || editorStore.activePaneId || '',
      previewPrefs: getPreviewPrefs?.() || {},
      previewBindings: Object.values(getPreviewBindings?.() || {}),
      session: getSession?.() || {},
      ...params,
    }).catch(() => null)
  }

  async function applyPlan(plan = null) {
    const editorStore = getEditorStore?.()
    if (!editorStore || !plan || typeof plan !== 'object') return null

    const result = plan.result || null
    const trigger = result?.trigger || plan.followupRequest?.trigger || ''
    if (trigger) {
      setLastTrigger?.(trigger)
    }

    if (typeof plan.clearDetachedSourcePath === 'string' && plan.clearDetachedSourcePath) {
      clearDetached?.(plan.clearDetachedSourcePath)
    }

    const binding = normalizeBinding(plan.bindPreview)
    if (binding) {
      bindPreview?.(binding)
    }

    if (plan.sessionState && typeof plan.sessionState === 'object') {
      setSessionState?.(plan.sessionState)
    }

    if (typeof plan.markDetachedSourcePath === 'string' && plan.markDetachedSourcePath) {
      markDetached?.(plan.markDetachedSourcePath)
    }

    if (typeof plan.unbindPreviewPath === 'string' && plan.unbindPreviewPath) {
      unbindPreview?.(plan.unbindPreviewPath)
    }

    if (typeof plan.closePreviewPath === 'string' && plan.closePreviewPath) {
      if (!plan.unbindPreviewPath && !plan.markDetachedSourcePath) {
        handlePreviewClosed?.(plan.closePreviewPath)
      }
      editorStore.closeFileFromAllPanes(plan.closePreviewPath)
    }

    const paneAction = plan.paneAction || null
    if (paneAction?.type === 'open-file-in-pane') {
      const previewPath = String(paneAction.previewPath || '')
      const previewPaneId = String(paneAction.previewPaneId || '')
      if (previewPath && previewPaneId) {
        editorStore.openFileInPane(previewPath, previewPaneId, {
          activatePane: paneAction.activatePane === true,
        })
      }
    } else if (paneAction?.type === 'split-pane-with-preview') {
      const previewPath = String(paneAction.previewPath || '')
      const sourcePaneId = String(paneAction.sourcePaneId || '')
      if (previewPath && sourcePaneId) {
        editorStore.splitPaneWith(sourcePaneId, 'vertical', previewPath)
      }
    }

    if (plan.followupRequest && typeof plan.followupRequest === 'object') {
      const followup = await invokeController('reconcile', {
        activeFile: String(plan.followupRequest.activeFile || ''),
        activePaneId: String(plan.followupRequest.activePaneId || ''),
        trigger: String(plan.followupRequest.trigger || ''),
        force: plan.followupRequest.force === true,
        previewKindOverride: String(plan.followupRequest.previewKindOverride || ''),
      })
      return applyPlan(followup)
    }

    return result
  }

  async function reconcile(options = {}) {
    if (getIsReconciling?.()) return null
    setIsReconciling?.(true)
    try {
      const plan = await invokeController('reconcile', {
        trigger: options.trigger || 'manual',
        force: options.force === true,
        previewKindOverride: options.previewKindOverride || '',
      })
      return applyPlan(plan)
    } finally {
      setIsReconciling?.(false)
    }
  }

  async function closePreviewForSource(sourcePath, options = {}) {
    if (!sourcePath) return null
    const kind = options.kind || null
    const previewKind = options.previewKind || (kind ? getPreferredPreviewKind?.(kind) : null) || ''
    const plan = await invokeController('close-preview', {
      sourcePath,
      previewKind,
      trigger: options.trigger || 'close-preview',
      reconcileAfterClose: options.reconcile !== false,
    })
    return applyPlan(plan)
  }

  async function ensurePreviewForSource(sourcePath, options = {}) {
    const editorStore = getEditorStore?.()
    if (!sourcePath || !editorStore) return null

    const previousActivePaneId = editorStore.activePaneId
    const previousActiveTab = editorStore.activeTab
    const previewKind = options.previewKind || ''

    const result = await applyPlan(await invokeController('ensure-preview', {
      sourcePath,
      sourcePaneId: options.sourcePaneId || editorStore.activePaneId || '',
      previewKind,
      trigger: options.trigger || 'manual-open-preview',
      activatePreview: options.activatePreview === true,
    }))

    if (options.activatePreview !== true) {
      editorStore.activePaneId = previousActivePaneId
      if (previousActivePaneId && previousActiveTab) {
        editorStore.setActiveTab(previousActivePaneId, previousActiveTab)
      }
      return result
    }

    if (result?.previewPaneId && result?.previewPath) {
      editorStore.openFileInPane(result.previewPath, result.previewPaneId, { activatePane: true })
    }
    return result
  }

  async function revealPreview(sourcePath, options = {}) {
    const result = await applyPlan(await invokeController('reveal-preview', {
      sourcePath,
      sourcePaneId: options.sourcePaneId || getEditorStore?.()?.activePaneId || '',
      previewKind: options.previewKind || '',
      trigger: options.trigger || 'reveal-preview',
      activatePreview: true,
    }))

    if (result?.previewPaneId && result?.previewPath) {
      getEditorStore?.()?.openFileInPane(result.previewPath, result.previewPaneId, { activatePane: true })
    }

    if (options.jump && result) {
      jumpPreviewToCursor?.({
        kind: result.kind,
        previewKind: result.previewKind,
        sourcePath,
      })
    }

    return result
  }

  return {
    closePreviewForSource,
    ensurePreviewForSource,
    revealPreview,
    reconcile,
  }
}
