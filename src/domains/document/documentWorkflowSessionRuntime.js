import {
  createDocumentWorkflowPersistentState as createDocumentWorkflowPersistentStateFromBridge,
  loadDocumentWorkflowSessionState,
  mutateDocumentWorkflowSessionState,
} from '../../services/documentWorkflow/sessionStateBridge.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  isDocumentWorkflowSource,
} from '../../services/documentWorkflow/policy.js'
import { previewSourcePathFromPath } from '../../utils/fileTypes.js'
import { resolveDocumentPreviewCloseEffect } from './documentWorkspacePreviewRuntime.js'

export function createDefaultDocumentWorkflowPersistentState() {
  return createDocumentWorkflowPersistentStateFromBridge()
}

export function createDefaultDocumentWorkflowPreviewPrefs() {
  return createDefaultDocumentWorkflowPersistentState().previewPrefs
}

export function createDefaultDocumentWorkflowSession() {
  return createDefaultDocumentWorkflowPersistentState().session
}

async function persistDocumentWorkflowStateMutation(store, mutation, payload = {}) {
  const workspace = store._getWorkspaceStore?.() || null
  if (!workspace?.workspaceDataDir) return null

  const state = await mutateDocumentWorkflowSessionState(
    workspace.workspaceDataDir,
    store.snapshotPersistentState(),
    mutation,
    payload,
  )
  store.applyPersistentState(state)
  store._persistentStateHydrated = true
  return state
}

export const documentWorkflowSessionActions = {
  snapshotPersistentState() {
    return {
      previewPrefs: this.previewPrefs,
      session: this.session,
      previewBindings: Object.values(this.previewBindings || {}),
      workspacePreviewVisibility: this.workspacePreviewVisibility,
      workspacePreviewRequests: this.workspacePreviewRequests,
      latexArtifactPaths: this.latexArtifactPaths,
      latexPreviewStates: this.latexPreviewStates,
    }
  },

  applyPersistentState(state = {}) {
    const next = {
      ...createDefaultDocumentWorkflowPersistentState(),
      ...state,
    }

    this.previewPrefs = next.previewPrefs || createDefaultDocumentWorkflowPreviewPrefs()
    this.session = {
      ...createDefaultDocumentWorkflowSession(),
      ...(next.session || {}),
    }
    this.previewBindings = Object.fromEntries(
      (Array.isArray(next.previewBindings) ? next.previewBindings : [])
        .filter((binding) => binding?.previewPath)
        .map((binding) => [binding.previewPath, binding]),
    )
    this.workspacePreviewVisibility = next.workspacePreviewVisibility || {}
    this.workspacePreviewRequests = next.workspacePreviewRequests || {}
    this.latexArtifactPaths = next.latexArtifactPaths || {}
    this.latexPreviewStates = next.latexPreviewStates || {}
  },

  async hydratePersistentState(force = false) {
    this.ensureLatexArtifactPersistenceListener()
    const workspace = this._getWorkspaceStore?.() || null
    if (!workspace?.workspaceDataDir) {
      this.applyPersistentState(createDefaultDocumentWorkflowPersistentState())
      this._persistentStateHydrated = false
      return createDefaultDocumentWorkflowPersistentState()
    }
    if (!force && this._persistentStateHydrated) return this.snapshotPersistentState()

    const state = await loadDocumentWorkflowSessionState(workspace.workspaceDataDir)
    this.applyPersistentState(state)
    this._persistentStateHydrated = true
    return this.snapshotPersistentState()
  },

  async persistDocumentWorkflowStateMutation(mutation, payload = {}) {
    return persistDocumentWorkflowStateMutation(this, mutation, payload)
  },

  async persistPreviewPreference(kind, previewKind) {
    return this.persistDocumentWorkflowStateMutation('set-preview-preference', {
      kind,
      previewKind,
    })
  },

  getPreviewBinding(previewPath) {
    return previewPath ? this.previewBindings[previewPath] || null : null
  },

  ensureLatexArtifactPersistenceListener() {
    if (typeof window === 'undefined' || this._latexArtifactPersistenceListenerAttached) return
    this._latexArtifactPersistenceListenerAttached = true
    window.addEventListener('latex-compile-done', (event) => {
      const detail = event?.detail || {}
      const sourcePath = String(detail.texPath || '').trim()
      const targetPath = String(detail.compileTargetPath || '').trim()
      if (!sourcePath && !targetPath) return

      void this.persistDocumentWorkflowStateMutation('apply-latex-compile-result', {
        sourcePath,
        targetPath,
        previewPath: String(detail.previewPath || detail.pdfPath || detail.pdf_path || '').trim(),
        synctexPath: String(detail.synctexPath || detail.synctex_path || '').trim(),
        lastCompiled: Number(detail.lastCompiled || 0),
        sourceFingerprint: String(detail.sourceFingerprint || '').trim(),
      })
    })
  },

  async setLatexPreviewStateForFile(filePath, state = {}) {
    return this.persistDocumentWorkflowStateMutation('set-latex-preview-state', {
      filePath,
      state,
    })
  },

  getLatexArtifactPathForFile(filePath) {
    const normalizedFilePath = String(filePath || '').trim()
    if (!normalizedFilePath) return ''
    return String(
      this.latexPreviewStates?.[normalizedFilePath]?.artifactPath
      || this.latexArtifactPaths?.[normalizedFilePath]
      || '',
    )
  },

  getLatexPreviewStateForFile(filePath) {
    const normalizedFilePath = String(filePath || '').trim()
    if (!normalizedFilePath) return null

    const previewState = this.latexPreviewStates?.[normalizedFilePath] || null
    const artifactPath = String(
      previewState?.artifactPath
      || this.latexArtifactPaths?.[normalizedFilePath]
      || '',
    )
    if (!artifactPath && !previewState) return null

    return {
      status: artifactPath ? 'success' : '',
      pdfPath: artifactPath,
      previewPath: artifactPath,
      synctexPath: String(previewState?.synctexPath || ''),
      compileTargetPath: String(previewState?.compileTargetPath || ''),
      lastCompiled: Number(previewState?.lastCompiled || 0),
      sourceFingerprint: String(previewState?.sourceFingerprint || ''),
    }
  },

  async bindPreview({
    previewPath,
    sourcePath,
    previewKind,
    kind,
    paneId = null,
    detachOnClose = true,
  }) {
    return this.persistDocumentWorkflowStateMutation('bind-preview', {
      previewPath,
      sourcePath,
      previewKind,
      kind,
      paneId,
      detachOnClose,
    })
  },

  async unbindPreview(previewPath) {
    return this.persistDocumentWorkflowStateMutation('unbind-preview', {
      previewPath,
    })
  },

  async markDetached(sourcePath) {
    return this.persistDocumentWorkflowStateMutation('mark-detached', {
      sourcePath,
    })
  },

  async clearDetached(sourcePath) {
    return this.persistDocumentWorkflowStateMutation('clear-detached', {
      sourcePath,
    })
  },

  setMarkdownPreviewState(sourcePath, state) {
    if (!sourcePath) return
    this.markdownPreviewState = {
      ...this.markdownPreviewState,
      [sourcePath]: {
        ...(this.markdownPreviewState[sourcePath] || {}),
        ...state,
      },
    }
  },

  clearMarkdownStates(sourcePath) {
    if (!sourcePath) return
    const nextPreview = { ...this.markdownPreviewState }
    delete nextPreview[sourcePath]
    this.markdownPreviewState = nextPreview
  },

  isWorkspacePreviewHiddenForFile(filePath) {
    return this.workspacePreviewVisibility[filePath] === 'hidden'
  },

  async setWorkspacePreviewVisibility(filePath, visibility = 'visible') {
    return this.persistDocumentWorkflowStateMutation(
      'set-workspace-preview-visibility',
      { filePath, visibility },
    )
  },

  async setWorkspacePreviewRequestForFile(filePath, previewKind = null) {
    return this.persistDocumentWorkflowStateMutation(
      'set-workspace-preview-request',
      { filePath, previewKind },
    )
  },

  getWorkspacePreviewRequestForFile(filePath) {
    if (!filePath) return null
    const previewKind = this.workspacePreviewRequests[filePath] || null
    if (!previewKind) return null
    const activeSourcePath = this.session.previewSourcePath || this.session.activeFile || ''
    if (this.session.state !== 'workspace-preview' || activeSourcePath !== filePath) {
      return null
    }
    return previewKind
  },

  getSourcePathForPreview(previewPath) {
    const binding = this.getPreviewBinding(previewPath)
    return (
      binding?.sourcePath
      || previewSourcePathFromPath(previewPath)
      || (isDocumentWorkflowSource(previewPath) ? previewPath : null)
    )
  },

  findPreviewBindingForSource(sourcePath, previewKind = null) {
    return (
      Object.values(this.previewBindings).find((binding) => (
        binding.sourcePath === sourcePath
        && (!previewKind || binding.previewKind === previewKind)
      )) || null
    )
  },

  hasPreviewForSource(sourcePath, previewKind = null) {
    if (!sourcePath) return false
    if (this.findPreviewBindingForSource(sourcePath, previewKind)) return true
    if (
      this.session.previewSourcePath === sourcePath
      && (!previewKind || this.session.previewKind === previewKind)
      && this.session.previewPaneId
    ) {
      return true
    }
    return false
  },

  async handlePreviewClosed(previewPath) {
    const effect = resolveDocumentPreviewCloseEffect(previewPath, {
      previewBinding: this.getPreviewBinding(previewPath),
    })
    if (effect.sourcePath && effect.markDetached) {
      await this.markDetached(effect.sourcePath)
    }
    await this.unbindPreview(previewPath)
  },

  getOpenPreviewPathForSource(sourcePath, previewKind = null) {
    if (!sourcePath) return null
    const binding = this.findPreviewBindingForSource(sourcePath, previewKind)
    if (binding?.previewPath) return binding.previewPath
    if (
      this.session.previewSourcePath === sourcePath
      && this.session.previewPaneId
      && (!previewKind || this.session.previewKind === previewKind)
    ) {
      return this.getPreviewPathForSource(
        sourcePath,
        previewKind || this.session.previewKind,
      )
    }
    return null
  },

  getPreviewPathForSource(sourcePath, previewKind = null) {
    const kind = getDocumentWorkflowKind(sourcePath)
    if (!kind) return null
    const resolvedKind = previewKind || this.getPreferredPreviewKind(kind)
    return createWorkflowPreviewPath(sourcePath, kind, resolvedKind)
  },

  async setSessionState(payload) {
    return this.persistDocumentWorkflowStateMutation('set-session-state', payload)
  },
}
