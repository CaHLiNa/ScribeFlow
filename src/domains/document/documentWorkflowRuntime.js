export function createDocumentWorkflowRuntime({
  getSession,
  getPreviewPrefs,
  getPreviewBinding,
  inferPreviewKind,
  bindPreview,
  getOpenPreviewPathForSource,
  getPreferredPreviewKind,
  clearDetached,
  handlePreviewClosed,
  setSessionState,
  getIsReconciling,
  setIsReconciling,
  setLastTrigger,
  getEditorStore,
  getDocumentWorkflowKindImpl,
  createWorkspacePreviewAction,
  getPreferredWorkflowPreviewKind,
  createWorkflowPreviewPath,
  reconcileDocumentWorkflowImpl,
  findWorkflowPreviewPaneImpl,
  jumpPreviewToCursor,
} = {}) {
  function reconcile(options = {}) {
    if (getIsReconciling?.()) return null

    const editorStore = getEditorStore?.()
    if (!editorStore) return null

    setIsReconciling?.(true)
    try {
      const result = reconcileDocumentWorkflowImpl?.({
        activeFile: editorStore.activeTab,
        activePaneId: editorStore.activePaneId,
        paneTree: editorStore.paneTree,
        trigger: options.trigger || 'manual',
        workflowStore: {
          previewPrefs: getPreviewPrefs?.() || {},
          session: {
            detachedSources: getSession?.()?.detachedSources || {},
          },
          getPreviewBinding: (previewPath) => getPreviewBinding?.(previewPath),
          inferPreviewKind: (sourcePath, previewPath) => inferPreviewKind?.(sourcePath, previewPath),
        },
        force: options.force === true,
        createWorkspacePreviewAction,
        getDocumentWorkflowKind: getDocumentWorkflowKindImpl,
        getPreferredWorkflowPreviewKind,
        createWorkflowPreviewPath,
        previewKindOverride: options.previewKindOverride || null,
        allowLegacyPaneResult: options.allowLegacyPaneResult === true,
      }) || null

      setLastTrigger?.(result?.trigger || options.trigger || 'manual')

      if (!result || result.type === 'inactive') {
        setSessionState?.({
          activeFile: null,
          activeKind: null,
          sourcePaneId: editorStore.activePaneId,
          previewPaneId: null,
          previewKind: null,
          previewSourcePath: null,
          state: 'inactive',
        })
        return result
      }

      if (result.type === 'detached') {
        setSessionState?.({
          activeFile: result.sourcePath,
          activeKind: result.kind,
          sourcePaneId: result.sourcePaneId,
          previewPaneId: null,
          previewKind: result.previewKind,
          previewSourcePath: result.sourcePath,
          state: 'detached-by-user',
        })
        return result
      }

      if (result.type === 'source-only') {
        setSessionState?.({
          activeFile: result.sourcePath,
          activeKind: result.kind,
          sourcePaneId: result.sourcePaneId,
          previewPaneId: null,
          previewKind: result.previewKind,
          previewSourcePath: result.sourcePath,
          state: 'source-only',
        })
        return result
      }

      if (result.type === 'workspace-preview') {
        if (result.preserveOpenLegacy && result.legacyPreviewPath) {
          bindPreview?.({
            previewPath: result.legacyPreviewPath,
            sourcePath: result.sourcePath || result.filePath,
            previewKind: result.previewKind,
            kind: result.kind,
            paneId: result.legacyPreviewPaneId || null,
            detachOnClose: false,
          })
        }
        setSessionState?.({
          activeFile: result.sourcePath || result.filePath,
          activeKind: result.kind,
          sourcePaneId: result.sourcePaneId,
          previewPaneId: null,
          previewKind: result.previewKind,
          previewSourcePath: result.sourcePath || result.filePath,
          state: 'workspace-preview',
        })
        return {
          ...result,
          previewPaneId: null,
          previewPath: null,
        }
      }

      let previewPaneId = result.previewPaneId
      let previewPath = result.previewPath

      if (result.type === 'open-neighbor' && previewPaneId && previewPath) {
        editorStore.openFileInPane(previewPath, previewPaneId, { activatePane: false })
      } else if (result.type === 'split-right' && previewPath) {
        previewPaneId = editorStore.splitPaneWith(result.sourcePaneId, 'vertical', previewPath)
      } else if (result.type === 'ready-existing' && previewPaneId && previewPath && options.force) {
        editorStore.openFileInPane(previewPath, previewPaneId, { activatePane: false })
      }

      if (previewPath) {
        const previewLeaf = findWorkflowPreviewPaneImpl?.(editorStore.paneTree, previewPath)
        if (previewLeaf?.id) {
          previewPaneId = previewLeaf.id
        }
        bindPreview?.({
          previewPath,
          sourcePath: result.sourcePath,
          previewKind: result.previewKind,
          kind: result.kind,
          paneId: previewPaneId,
        })
      }

      setSessionState?.({
        activeFile: result.sourcePath,
        activeKind: result.kind,
        sourcePaneId: result.sourcePaneId,
        previewPaneId: previewPaneId || null,
        previewKind: result.previewKind,
        previewSourcePath: result.sourcePath,
        state: previewPaneId ? 'ready' : result.state,
      })

      return {
        ...result,
        previewPaneId: previewPaneId || null,
        previewPath,
      }
    } finally {
      setIsReconciling?.(false)
    }
  }

  function closePreviewForSource(sourcePath, options = {}) {
    const editorStore = getEditorStore?.()
    const kind = getDocumentWorkflowKindImpl?.(sourcePath)
    if (!kind || !editorStore) return null

    const previewKind = options.previewKind || getPreferredPreviewKind?.(kind)
    const previewPath = getOpenPreviewPathForSource?.(sourcePath, previewKind)
    if (!previewPath) return null

    handlePreviewClosed?.(previewPath)
    editorStore.closeFileFromAllPanes(previewPath)

    if (options.reconcile !== false) {
      reconcile({
        trigger: options.trigger || 'close-preview',
        previewKindOverride: previewKind,
      })
    }

    return {
      type: 'closed-preview',
      kind,
      sourcePath,
      previewKind,
      previewPath,
    }
  }

  function ensurePreviewForSource(sourcePath, options = {}) {
    const editorStore = getEditorStore?.()
    const kind = getDocumentWorkflowKindImpl?.(sourcePath)
    if (!kind || !editorStore) return null

    const previewKind = options.previewKind || getPreferredPreviewKind?.(kind)
    clearDetached?.(sourcePath)

    const previousActivePaneId = editorStore.activePaneId
    const previousActiveTab = editorStore.activeTab

    editorStore.activePaneId = options.sourcePaneId || editorStore.activePaneId

    const result = reconcile({
      trigger: options.trigger || 'manual-open-preview',
      force: true,
      previewKindOverride: previewKind,
    })

    if (!options.activatePreview) {
      editorStore.activePaneId = previousActivePaneId
      if (previousActiveTab && previousActivePaneId) {
        editorStore.setActiveTab(previousActivePaneId, previousActiveTab)
      }
    } else if (result?.previewPaneId && result.previewPath) {
      editorStore.openFileInPane(result.previewPath, result.previewPaneId, { activatePane: true })
    }

    return result
  }

  function revealPreview(sourcePath, options = {}) {
    const result = ensurePreviewForSource(sourcePath, {
      force: true,
      activatePreview: true,
      previewKind: options.previewKind,
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || 'reveal-preview',
    })

    if (result?.type === 'workspace-preview') {
      if (options.jump) {
        jumpPreviewToCursor?.({
          kind: result.kind,
          previewKind: result.previewKind,
          sourcePath,
        })
      }
      return result
    }

    if (!result?.previewPaneId || !result?.previewPath) return result

    const editorStore = getEditorStore?.()
    if (!editorStore) return result

    editorStore.openFileInPane(result.previewPath, result.previewPaneId, { activatePane: true })

    if (options.jump) {
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
