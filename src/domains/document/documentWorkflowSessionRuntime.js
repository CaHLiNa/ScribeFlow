import { pathExists } from '../../services/pathExists.js'
import {
  createDocumentWorkflowPersistentState,
  loadDocumentWorkflowSessionState,
  saveDocumentWorkflowSessionState,
} from '../../services/documentWorkflow/sessionStateBridge.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  isDocumentWorkflowSource,
} from '../../services/documentWorkflow/policy.js'
import { previewSourcePathFromPath } from '../../utils/fileTypes.js'
import { resolveDocumentPreviewCloseEffect } from './documentWorkspacePreviewRuntime.js'

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
      if (sourcePath) {
        this.setLatexPreviewStateForFile(sourcePath, nextPreviewState)
      }
      if (targetPath && targetPath !== sourcePath) {
        this.setLatexPreviewStateForFile(targetPath, nextPreviewState)
      }
    })
  },

  setLatexPreviewStateForFile(filePath, state = {}) {
    const normalizedFilePath = String(filePath || '').trim()
    if (!normalizedFilePath) return

    const normalizedState = {
      artifactPath: String(state.artifactPath || '').trim(),
      synctexPath: String(state.synctexPath || '').trim(),
      compileTargetPath: String(state.compileTargetPath || '').trim(),
      lastCompiled: Number(state.lastCompiled || 0),
      sourceFingerprint: String(state.sourceFingerprint || '').trim(),
    }
    const hasRuntimeState = Boolean(
      normalizedState.artifactPath
      || normalizedState.synctexPath
      || normalizedState.compileTargetPath
      || normalizedState.lastCompiled
      || normalizedState.sourceFingerprint
    )

    const nextArtifactPaths = { ...(this.latexArtifactPaths || {}) }
    const nextPreviewStates = { ...(this.latexPreviewStates || {}) }

    if (!hasRuntimeState) {
      if (!nextArtifactPaths[normalizedFilePath] && !nextPreviewStates[normalizedFilePath]) return
      delete nextArtifactPaths[normalizedFilePath]
      delete nextPreviewStates[normalizedFilePath]
    } else {
      const previousArtifactPath = String(nextArtifactPaths[normalizedFilePath] || '')
      const previousState = nextPreviewStates[normalizedFilePath] || null
      const unchanged =
        previousArtifactPath === normalizedState.artifactPath
        && previousState
        && previousState.artifactPath === normalizedState.artifactPath
        && previousState.synctexPath === normalizedState.synctexPath
        && previousState.compileTargetPath === normalizedState.compileTargetPath
        && Number(previousState.lastCompiled || 0) === normalizedState.lastCompiled
        && previousState.sourceFingerprint === normalizedState.sourceFingerprint
      if (unchanged) return

      if (normalizedState.artifactPath) {
        nextArtifactPaths[normalizedFilePath] = normalizedState.artifactPath
      } else {
        delete nextArtifactPaths[normalizedFilePath]
      }
      nextPreviewStates[normalizedFilePath] = normalizedState
    }

    this.latexArtifactPaths = nextArtifactPaths
    this.latexPreviewStates = nextPreviewStates
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
    const sourcePaths = Array.from(new Set([
      ...Object.keys(this.latexArtifactPaths || {}),
      ...Object.keys(this.latexPreviewStates || {}),
    ]))
    if (sourcePaths.length === 0) {
      return {
        latexArtifactPaths: this.latexArtifactPaths || {},
        latexPreviewStates: this.latexPreviewStates || {},
      }
    }

    const keptEntries = await Promise.all(sourcePaths.map(async (sourcePath) => {
      const previewState = this.latexPreviewStates?.[sourcePath] || null
      const artifactPath = String(previewState?.artifactPath || this.latexArtifactPaths?.[sourcePath] || '')
      if (!artifactPath || !(await pathExists(artifactPath))) {
        return null
      }

      const synctexPath = String(previewState?.synctexPath || '')
      const hasSynctexPath = synctexPath ? await pathExists(synctexPath) : false

      return [
        sourcePath,
        artifactPath,
        {
          artifactPath,
          synctexPath: hasSynctexPath ? synctexPath : '',
          compileTargetPath: String(previewState?.compileTargetPath || ''),
          lastCompiled: Number(previewState?.lastCompiled || 0),
          sourceFingerprint: String(previewState?.sourceFingerprint || ''),
        },
      ]
    }))

    const nextArtifactPaths = Object.fromEntries(
      keptEntries
        .filter(Boolean)
        .map(([sourcePath, artifactPath]) => [sourcePath, artifactPath])
    )
    const nextPreviewStates = Object.fromEntries(
      keptEntries
        .filter(Boolean)
        .map(([sourcePath, , previewState]) => [sourcePath, previewState])
    )

    const artifactPathsUnchanged = JSON.stringify(nextArtifactPaths) === JSON.stringify(this.latexArtifactPaths || {})
    const previewStatesUnchanged = JSON.stringify(nextPreviewStates) === JSON.stringify(this.latexPreviewStates || {})
    if (artifactPathsUnchanged && previewStatesUnchanged) {
      return {
        latexArtifactPaths: nextArtifactPaths,
        latexPreviewStates: nextPreviewStates,
      }
    }

    this.latexArtifactPaths = nextArtifactPaths
    this.latexPreviewStates = nextPreviewStates
    this.queuePersistentStateSave()
    return {
      latexArtifactPaths: nextArtifactPaths,
      latexPreviewStates: nextPreviewStates,
    }
  },

  bindPreview({ previewPath, sourcePath, previewKind, kind, paneId = null, detachOnClose = true }) {
    if (!previewPath || !sourcePath) return
    this.previewBindings = {
      ...this.previewBindings,
      [previewPath]: {
        previewPath,
        sourcePath,
        previewKind,
        kind,
        paneId,
        detachOnClose,
      },
    }
    this.queuePersistentStateSave()
  },

  unbindPreview(previewPath) {
    if (!previewPath || !this.previewBindings[previewPath]) return
    const next = { ...this.previewBindings }
    delete next[previewPath]
    this.previewBindings = next
    this.queuePersistentStateSave()
  },

  markDetached(sourcePath) {
    if (!sourcePath) return
    this.session.detachedSources = {
      ...this.session.detachedSources,
      [sourcePath]: true,
    }
    if (this.session.previewSourcePath === sourcePath) {
      this.session.state = 'detached-by-user'
    }
    this.queuePersistentStateSave()
  },

  clearDetached(sourcePath) {
    if (!sourcePath || !this.session.detachedSources[sourcePath]) return
    const next = { ...this.session.detachedSources }
    delete next[sourcePath]
    this.session.detachedSources = next
    this.queuePersistentStateSave()
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

  setWorkspacePreviewVisibility(filePath, visibility = 'visible') {
    if (!filePath) return
    this.workspacePreviewVisibility = {
      ...this.workspacePreviewVisibility,
      [filePath]: visibility === 'hidden' ? 'hidden' : 'visible',
    }
    this.queuePersistentStateSave()
  },

  setWorkspacePreviewRequestForFile(filePath, previewKind = null) {
    if (!filePath) return
    const next = { ...this.workspacePreviewRequests }
    if (previewKind) {
      next[filePath] = previewKind
    } else {
      delete next[filePath]
    }
    this.workspacePreviewRequests = next
    this.queuePersistentStateSave()
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
    return binding?.sourcePath || previewSourcePathFromPath(previewPath) || (isDocumentWorkflowSource(previewPath) ? previewPath : null)
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

  handlePreviewClosed(previewPath) {
    const effect = resolveDocumentPreviewCloseEffect(previewPath, {
      previewBinding: this.getPreviewBinding(previewPath),
    })
    if (effect.sourcePath && effect.markDetached) {
      this.markDetached(effect.sourcePath)
    }
    this.unbindPreview(previewPath)
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

  setSessionState(payload) {
    this.session = {
      ...this.session,
      ...payload,
    }
    this.queuePersistentStateSave()
  },
}
