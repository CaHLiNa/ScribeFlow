import { getViewerType } from '../../utils/fileTypes.js'
import { createDocumentWorkspacePreviewAction } from './documentWorkspacePreviewRuntime.js'

export function createDocumentWorkflowTypstPaneRuntime({
  getEditorStore,
  getWorkflowStore,
} = {}) {
  const typstPdfPaneState = new Map()

  function createWorkspacePreviewResult(sourcePath, options = {}) {
    return createDocumentWorkspacePreviewAction({
      path: sourcePath,
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || 'workflow-toggle-preview',
      nativePreviewSupported: options.previewKind !== 'pdf',
    })
  }

  function isPreviewHostPane(editorStore, paneId) {
    const pane = editorStore?.findPane?.(editorStore.paneTree, paneId)
    if (!pane) return false
    if (!pane.activeTab) return true
    const viewerType = getViewerType(pane.activeTab)
    return viewerType === 'typst-native-preview' || viewerType === 'pdf'
  }

  function isOwnedTypstSharedPane(editorStore, pane, previewPath, artifactPath, requiredTab = '') {
    if (!pane) return false
    if (!isPreviewHostPane(editorStore, pane.id)) return false
    if (requiredTab && !pane.tabs.includes(requiredTab)) return false
    const hasExpectedTab = pane.tabs.includes(previewPath) || pane.tabs.includes(artifactPath)
    if (!hasExpectedTab) return false
    if (pane.tabs.some(tab => tab !== previewPath && tab !== artifactPath)) return false
    if (!pane.activeTab) return true
    return pane.activeTab === previewPath || pane.activeTab === artifactPath
  }

  function getOwnedPaneById(editorStore, paneId, previewPath, artifactPath, requiredTab = '') {
    if (!paneId) return null
    const pane = editorStore?.findPane?.(editorStore.paneTree, paneId) || null
    return isOwnedTypstSharedPane(editorStore, pane, previewPath, artifactPath, requiredTab) ? pane : null
  }

  function getOwnedPaneWithTab(editorStore, tabPath, previewPath, artifactPath, requiredTab = '') {
    if (!tabPath) return null
    const pane = editorStore?.findPaneWithTab?.(tabPath) || null
    return isOwnedTypstSharedPane(editorStore, pane, previewPath, artifactPath, requiredTab) ? pane : null
  }

  function getTrackedTypstPdfState(editorStore, sourcePath, previewPath = '', artifactPath = '') {
    const state = typstPdfPaneState.get(sourcePath)
    if (!state?.paneId) return null

    const pane = getOwnedPaneById(editorStore, state.paneId, previewPath, artifactPath)
    if (!pane) {
      typstPdfPaneState.delete(sourcePath)
      return null
    }

    return state
  }

  function getTypstSharedPaneInfo(editorStore, workflowStore, sourcePath, previewPath, artifactPath, sourcePaneId) {
    const previewBinding = workflowStore?.findPreviewBindingForSource?.(sourcePath, 'native')
    const bindingPane = getOwnedPaneById(
      editorStore,
      previewBinding?.paneId || '',
      previewPath,
      artifactPath,
      previewPath,
    )
    const previewTabPane = getOwnedPaneWithTab(editorStore, previewPath, previewPath, artifactPath, previewPath)
    const sessionPane = (
      workflowStore?.session?.previewSourcePath === sourcePath
      && workflowStore?.session?.previewKind === 'native'
    )
      ? getOwnedPaneById(
          editorStore,
          workflowStore?.session?.previewPaneId || '',
          previewPath,
          artifactPath,
          previewPath,
        )
      : null
    const previewPane = bindingPane || previewTabPane || sessionPane || null

    if (previewPane?.id) {
      return {
        paneId: previewPane.id,
        pane: previewPane,
        previewPath,
        artifactPath,
        hasPreview: true,
        pdfMode: getTrackedTypstPdfState(editorStore, sourcePath, previewPath, artifactPath)?.mode || null,
      }
    }

    const tracked = getTrackedTypstPdfState(editorStore, sourcePath, previewPath, artifactPath)
    if (tracked?.paneId) {
      return {
        paneId: tracked.paneId,
        pane: editorStore?.findPane?.(editorStore.paneTree, tracked.paneId) || null,
        previewPath,
        artifactPath,
        hasPreview: false,
        pdfMode: tracked.mode,
      }
    }

    const existingPdfPane = getOwnedPaneWithTab(editorStore, artifactPath, previewPath, artifactPath, artifactPath)
    if (existingPdfPane?.id) {
      return {
        paneId: existingPdfPane.id,
        pane: existingPdfPane,
        previewPath,
        artifactPath,
        hasPreview: false,
        pdfMode: 'owned',
      }
    }

    const neighborPane = editorStore?.findRightNeighborLeaf?.(sourcePaneId)
    if (neighborPane?.id && isPreviewHostPane(editorStore, neighborPane.id)) {
      return {
        paneId: neighborPane.id,
        pane: neighborPane,
        previewPath,
        artifactPath,
        hasPreview: false,
        pdfMode: null,
      }
    }

    return {
      paneId: '',
      pane: null,
      previewPath,
      artifactPath,
      hasPreview: false,
      pdfMode: null,
    }
  }

  function openTypstPdfInPane(editorStore, sourcePath, artifactPath, paneId, mode) {
    if (!paneId) return false
    typstPdfPaneState.set(sourcePath, { paneId, mode })
    editorStore?.openFileInPane?.(artifactPath, paneId, { activatePane: true })
    return true
  }

  function closeTypstSharedPane(editorStore, workflowStore, sourcePath, previewPath, artifactPath, paneId, trigger) {
    if (previewPath) {
      workflowStore?.closePreviewForSource?.(sourcePath, {
        previewKind: 'native',
        trigger,
        reconcile: false,
      })
    }

    if (paneId) {
      const pane = editorStore?.findPane?.(editorStore.paneTree, paneId)
      if (pane?.tabs.includes(artifactPath)) {
        editorStore?.closeTab?.(paneId, artifactPath)
      }
    } else {
      editorStore?.closeFileFromAllPanes?.(artifactPath)
    }

    typstPdfPaneState.delete(sourcePath)
    workflowStore?.reconcile?.({ trigger })
  }

  async function revealPreviewForFile(sourcePath, options = {}) {
    if (!sourcePath) return null

    if (!options.allowLegacyPaneResult) {
      return createWorkspacePreviewResult(sourcePath, {
        sourcePaneId: options.sourcePaneId,
        trigger: options.openTrigger || 'workflow-toggle-preview',
        previewKind: 'native',
      })
    }

    const editorStore = getEditorStore?.() || null
    const workflowStore = getWorkflowStore?.() || null
    if (!editorStore || !workflowStore) return null

    const previewPath = workflowStore.getPreviewPathForSource?.(sourcePath, 'native') || ''
    const artifactPath = workflowStore.getArtifactPathForFile?.(sourcePath, options.buildOptions || {}) || ''
    const shared = getTypstSharedPaneInfo(
      editorStore,
      workflowStore,
      sourcePath,
      previewPath,
      artifactPath,
      options.sourcePaneId,
    )
    const activeTab = shared.pane?.activeTab || ''

    if (shared.paneId && activeTab === previewPath) {
      closeTypstSharedPane(
        editorStore,
        workflowStore,
        sourcePath,
        previewPath,
        artifactPath,
        shared.paneId,
        options.closeTrigger || 'typst-preview-toggle-close',
      )
      return null
    }

    if (shared.paneId && activeTab === artifactPath) {
      const result = workflowStore.ensurePreviewForSource?.(sourcePath, {
        previewKind: 'native',
        activatePreview: false,
        sourcePaneId: options.sourcePaneId,
        trigger: options.switchTrigger || 'typst-preview-toggle-switch',
      }) || null
      const targetPaneId = result?.previewPaneId || shared.paneId
      if (previewPath && targetPaneId) {
        editorStore.openFileInPane(previewPath, targetPaneId, { activatePane: true })
        if (shared.pdfMode === 'owned') {
          const targetPane = editorStore.findPane?.(editorStore.paneTree, targetPaneId)
          if (targetPane?.tabs.includes(artifactPath)) {
            editorStore.closeTab?.(targetPaneId, artifactPath)
          }
        }
      }
      typstPdfPaneState.delete(sourcePath)
      return result
    }

    const result = await workflowStore.togglePreviewForSource?.(sourcePath, {
      previewKind: 'native',
      activatePreview: true,
      jump: true,
      sourcePaneId: options.sourcePaneId,
      trigger: options.openTrigger || 'workflow-toggle-preview',
    })
    typstPdfPaneState.delete(sourcePath)
    return result || null
  }

  function revealPdfForFile(sourcePath, options = {}) {
    if (!sourcePath) return null

    if (!options.allowLegacyPaneResult) {
      return createWorkspacePreviewResult(sourcePath, {
        sourcePaneId: options.sourcePaneId,
        trigger: options.trigger || 'typst-pdf-reveal',
        previewKind: 'pdf',
      })
    }

    const editorStore = getEditorStore?.() || null
    const workflowStore = getWorkflowStore?.() || null
    if (!editorStore || !workflowStore) return null

    const artifactPath = workflowStore.getArtifactPathForFile?.(sourcePath, options.buildOptions || {})
    if (!artifactPath) return null

    const previewPath = workflowStore.getPreviewPathForSource?.(sourcePath, 'native') || ''
    const shared = getTypstSharedPaneInfo(
      editorStore,
      workflowStore,
      sourcePath,
      previewPath,
      artifactPath,
      options.sourcePaneId,
    )
    const activeTab = shared.pane?.activeTab || ''

    if (shared.paneId && activeTab === artifactPath) {
      if (shared.pdfMode === 'overlay' && previewPath) {
        editorStore.openFileInPane(previewPath, shared.paneId, { activatePane: true })
      } else {
        const pane = editorStore.findPane?.(editorStore.paneTree, shared.paneId)
        if (pane?.tabs.includes(artifactPath)) {
          editorStore.closeTab?.(shared.paneId, artifactPath)
        }
      }
      typstPdfPaneState.delete(sourcePath)
      return null
    }

    if (shared.paneId && activeTab === previewPath) {
      openTypstPdfInPane(editorStore, sourcePath, artifactPath, shared.paneId, 'overlay')
      return null
    }

    if (shared.paneId) {
      openTypstPdfInPane(
        editorStore,
        sourcePath,
        artifactPath,
        shared.paneId,
        shared.hasPreview ? 'overlay' : 'owned',
      )
      return null
    }

    const newPaneId = editorStore.splitPaneWith?.(options.sourcePaneId, 'vertical', artifactPath)
    if (newPaneId) {
      typstPdfPaneState.set(sourcePath, { paneId: newPaneId, mode: 'owned' })
      editorStore.setActivePane?.(newPaneId)
    }

    return null
  }

  return {
    revealPreviewForFile,
    revealPdfForFile,
  }
}
