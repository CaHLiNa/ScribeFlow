import {
  applyDocumentWorkflowLatexPreviewState,
  applyDocumentWorkflowPreviewBindingState,
  applyDocumentWorkflowSessionMutation,
  createDocumentWorkflowPersistentState,
  loadDocumentWorkflowSessionState,
  reconcileDocumentWorkflowLatexPreviewState,
  resolveDocumentWorkflowPreviewCloseEffect,
  saveDocumentWorkflowSessionState,
} from '../services/documentWorkflow/sessionStateBridge.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  isDocumentWorkflowSource,
} from '../domains/document/documentWorkflowPolicy.js'
import { previewSourcePathFromPath } from '../utils/fileTypes.js'

export function createDefaultDocumentWorkflowPersistentState() {
  return createDocumentWorkflowPersistentState()
}

export function createDefaultDocumentWorkflowPreviewPrefs() {
  return createDefaultDocumentWorkflowPersistentState().previewPrefs
}

export function createDefaultDocumentWorkflowSession() {
  return createDefaultDocumentWorkflowPersistentState().session
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
    await this.reconcileLatexPreviewStates()
    this._persistentStateHydrated = true
    return this.snapshotPersistentState()
  },

  queuePersistentStateSave() {
    const workspace = this._getWorkspaceStore?.() || null
    if (!workspace?.workspaceDataDir) return

    clearTimeout(this._persistentStateSaveTimer)
    this._persistentStateSaveRevision = (this._persistentStateSaveRevision || 0) + 1
    const revision = this._persistentStateSaveRevision
    this._persistentStateSaveTimer = setTimeout(() => {
      void this.persistPersistentStateImmediate(revision)
    }, 80)
  },

  async persistPersistentStateImmediate(expectedRevision = null) {
    const workspace = this._getWorkspaceStore?.() || null
    if (!workspace?.workspaceDataDir) return null

    clearTimeout(this._persistentStateSaveTimer)
    this._persistentStateSaveTimer = null

    const revision = expectedRevision ?? ((this._persistentStateSaveRevision || 0) + 1)
    this._persistentStateSaveRevision = revision
    const snapshot = this.snapshotPersistentState()
    const state = await saveDocumentWorkflowSessionState(workspace.workspaceDataDir, snapshot)

    if (this._persistentStateSaveRevision === revision) {
      this.applyPersistentState(state)
    }
    this._persistentStateHydrated = true
    return state
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
      const nextPreviewState = {
        artifactPath: String(detail.previewPath || detail.pdfPath || detail.pdf_path || '').trim(),
        synctexPath: String(detail.synctexPath || detail.synctex_path || '').trim(),
        compileTargetPath: targetPath,
        lastCompiled: Number(detail.lastCompiled || 0),
        sourceFingerprint: String(detail.sourceFingerprint || '').trim(),
      }
      void (async () => {
        if (sourcePath) {
          await this.setLatexPreviewStateForFile(sourcePath, nextPreviewState)
        }
        if (targetPath && targetPath !== sourcePath) {
          await this.setLatexPreviewStateForFile(targetPath, nextPreviewState)
        }
      })()
    })
  },

  async setLatexPreviewStateForFile(filePath, state = {}) {
    const applied = await applyDocumentWorkflowLatexPreviewState(
      this.snapshotPersistentState(),
      filePath,
      state,
    )
    if (!applied?.changed) return

    this.applyPersistentState(applied.state)
    this.queuePersistentStateSave()
  },

  getLatexArtifactPathForFile(filePath) {
    const normalizedFilePath = String(filePath || '').trim()
    if (!normalizedFilePath) return ''
    return String(
      this.latexPreviewStates?.[normalizedFilePath]?.artifactPath
      || this.latexArtifactPaths?.[normalizedFilePath]
      || ''
    )
  },

  getLatexPreviewStateForFile(filePath) {
    const normalizedFilePath = String(filePath || '').trim()
    if (!normalizedFilePath) return null

    const previewState = this.latexPreviewStates?.[normalizedFilePath] || null
    const artifactPath = String(previewState?.artifactPath || this.latexArtifactPaths?.[normalizedFilePath] || '')
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

  async reconcileLatexPreviewStates() {
    const reconciled = await reconcileDocumentWorkflowLatexPreviewState(this.snapshotPersistentState())
    const nextState = reconciled?.state || {}
    const nextArtifactPaths = nextState?.latexArtifactPaths || {}
    const nextPreviewStates = nextState?.latexPreviewStates || {}

    if (!reconciled?.changed) {
      return {
        latexArtifactPaths: nextArtifactPaths,
        latexPreviewStates: nextPreviewStates,
      }
    }

    this.applyPersistentState(nextState)
    this.queuePersistentStateSave()
    return {
      latexArtifactPaths: nextArtifactPaths,
      latexPreviewStates: nextPreviewStates,
    }
  },

  async bindPreview({ previewPath, sourcePath, previewKind, kind, paneId = null, detachOnClose = true }) {
    const applied = await applyDocumentWorkflowPreviewBindingState(
      this.snapshotPersistentState(),
      'bind',
      {
        previewPath,
        sourcePath,
        previewKind,
        kind,
        paneId,
        detachOnClose,
      },
      '',
    )
    if (!applied?.changed) return

    this.applyPersistentState(applied.state)
    this.queuePersistentStateSave()
  },

  async unbindPreview(previewPath) {
    const applied = await applyDocumentWorkflowPreviewBindingState(
      this.snapshotPersistentState(),
      'unbind',
      {},
      previewPath,
    )
    if (!applied?.changed) return

    this.applyPersistentState(applied.state)
    this.queuePersistentStateSave()
  },

  async applySessionMutation(mutation = {}) {
    const applied = await applyDocumentWorkflowSessionMutation(
      this.snapshotPersistentState(),
      mutation,
    )
    if (!applied?.changed) return

    this.applyPersistentState(applied.state)
    this.queuePersistentStateSave()
  },

  async markDetached(sourcePath) {
    await this.applySessionMutation({
      intent: 'mark-detached',
      sourcePath,
    })
  },

  async clearDetached(sourcePath) {
    await this.applySessionMutation({
      intent: 'clear-detached',
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
    await this.applySessionMutation({
      intent: 'set-workspace-preview-visibility',
      filePath,
      visibility,
    })
  },

  async setWorkspacePreviewRequestForFile(filePath, previewKind = null) {
    await this.applySessionMutation({
      intent: 'set-workspace-preview-request',
      filePath,
      previewKind,
    })
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

  async getSourcePathForPreview(previewPath) {
    const binding = this.getPreviewBinding(previewPath)
    return binding?.sourcePath || (await previewSourcePathFromPath(previewPath)) || (isDocumentWorkflowSource(previewPath) ? previewPath : null)
  },

  findPreviewBindingForSource(sourcePath, previewKind = null) {
    return Object.values(this.previewBindings).find(binding => (
      binding.sourcePath === sourcePath
      && (!previewKind || binding.previewKind === previewKind)
    )) || null
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
    const effect = await resolveDocumentWorkflowPreviewCloseEffect(
      previewPath,
      this.getPreviewBinding(previewPath),
    )
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
      return this.getPreviewPathForSource(sourcePath, previewKind || this.session.previewKind)
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
    await this.applySessionMutation({
      intent: 'set-session-state',
      sessionPatch: payload,
    })
  },
}
