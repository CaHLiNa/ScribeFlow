import { defineStore } from 'pinia'
import { EDITOR_RUNTIME_EVENT_NAME } from '../domains/editor/editorRuntimeContract'
import { PRIMARY_TEXT_SURFACE_TARGETS } from '../domains/editor/primaryTextSurfaceTargets'
import {
  applyNativeEditorTransaction,
  applyNativeEditorExternalContent,
  inspectNativeEditorInteractionContext,
  listenToNativeEditorEvents,
  nativeEditorBridgeAvailable,
  openNativeEditorDocument,
  recordNativeEditorWorkflowEvent,
  replaceNativeEditorDocumentText,
  setNativeEditorDiagnostics,
  setNativeEditorOutlineContext,
  setNativeEditorSelections,
  startNativeEditorSession,
  stopNativeEditorSession,
} from '../services/editorRuntime/nativeBridge'

export const EDITOR_RUNTIME_MODES = Object.freeze({
  WEB: 'web',
  NATIVE_EXPERIMENTAL: 'native-experimental',
})

const MAX_TELEMETRY_EVENTS = 200
const MODE_STORAGE_KEY = 'editorRuntime.mode'
const MAX_LATENCY_SAMPLES = 40
const TYPING_LATENCY_STORAGE_KEY = 'editorRuntime.typingLatencySamples'
const REOPEN_VERIFICATION_STORAGE_KEY = 'editorRuntime.reopenVerification'
let telemetryListener = null
let nativeRuntimeListener = null
const pendingTypingLatencyByPath = new Map()

function utf8ByteLength(value = '') {
  try {
    return new TextEncoder().encode(String(value || '')).length
  } catch {
    return String(value || '').length
  }
}

function clampStringOffset(text = '', offset = 0) {
  const normalized = String(text || '')
  const numeric = Number(offset || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(normalized.length, Math.trunc(numeric)))
}

function jsOffsetToUtf8Offset(text = '', offset = 0) {
  const normalized = String(text || '')
  const safeOffset = clampStringOffset(normalized, offset)
  return utf8ByteLength(normalized.slice(0, safeOffset))
}

function readStoredMode(fallback = EDITOR_RUNTIME_MODES.WEB) {
  try {
    const value = String(localStorage.getItem(MODE_STORAGE_KEY) ?? '').trim()
    return Object.values(EDITOR_RUNTIME_MODES).includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

function writeStoredString(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Ignore localStorage persistence failures.
  }
}

function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore localStorage persistence failures.
  }
}

function stableTextFingerprint(value = '') {
  const text = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`
}

export const useEditorRuntimeStore = defineStore('editorRuntime', {
  state: () => ({
    mode: readStoredMode(EDITOR_RUNTIME_MODES.WEB),
    lastNativeSessionId: null,
    nativeRuntimeConnected: false,
    nativeProtocolVersion: 0,
    nativeRuntimeEventCount: 0,
    lastNativeRuntimeEvent: null,
    recentNativeRuntimeEvents: [],
    nativeSessionSnapshot: null,
    nativeDocuments: {},
    telemetryAttached: false,
    telemetryEventCount: 0,
    lastTelemetryEvent: null,
    recentTelemetryEvents: [],
    typingLatencySamples: Array.isArray(readStoredJson(TYPING_LATENCY_STORAGE_KEY, []))
      ? readStoredJson(TYPING_LATENCY_STORAGE_KEY, [])
      : [],
    reopenVerification: readStoredJson(REOPEN_VERIFICATION_STORAGE_KEY, {
      pending: {},
      history: [],
      lastPassedAt: '',
      lastFailedAt: '',
    }),
  }),

  getters: {
    wantsNativeRuntime() {
      return nativeEditorBridgeAvailable()
    },

    useNativePrimarySurface(state) {
      return this.canSwitchToNativePrimarySurface && state.mode === EDITOR_RUNTIME_MODES.NATIVE_EXPERIMENTAL
    },

    cutoverGateStatus(state) {
      const documents = Object.values(state.nativeDocuments || {})
      const workflowKinds = new Set(
        documents
          .map((document) => String(document?.lastWorkflowEvent?.kind || '').trim())
          .filter(Boolean)
      )
      const telemetryTypes = new Set(
        (state.recentTelemetryEvents || [])
          .map((event) => String(event?.type || '').trim())
          .filter(Boolean)
      )
      const hasDiagnosticsPayload = documents.some((document) => Array.isArray(document?.diagnostics))
      const hasOutlineContextPayload = documents.some((document) => document?.outlineContext != null)
      const hasSelections = documents.some((document) => Array.isArray(document?.selections) && document.selections.length > 0)
      const hasPersistEvent = workflowKinds.has('persist-document')
      const hasMarkdownSyncEvent = workflowKinds.has('markdown-forward-sync-request')
      const hasLatexSyncEvent =
        workflowKinds.has('latex-forward-sync-request') || workflowKinds.has('latex-backward-sync-reveal')
      const hasOutlineFollowEvent = workflowKinds.has('outline-active-item')
      const hasCitationEvent =
        workflowKinds.has('citation-insert') || workflowKinds.has('citation-update')

      return {
        nativeSessionReady: {
          ready: !!state.lastNativeSessionId && state.nativeRuntimeConnected,
          evidence: state.lastNativeSessionId || '',
        },
        selectionSemantics: {
          ready: hasSelections,
          evidence: hasSelections ? 'native selections observed' : 'pending selection evidence',
        },
        saveDirtyState: {
          ready: hasPersistEvent,
          evidence: hasPersistEvent ? 'persist-document workflow event observed' : 'pending save evidence',
        },
        outlineFollowCursor: {
          ready: hasOutlineContextPayload && hasOutlineFollowEvent,
          evidence:
            hasOutlineContextPayload && hasOutlineFollowEvent
              ? 'outline context + active item events observed'
              : 'pending outline follow evidence',
        },
        markdownSyncLoops: {
          ready: hasMarkdownSyncEvent,
          evidence: hasMarkdownSyncEvent ? 'markdown sync workflow event observed' : 'pending markdown sync evidence',
        },
        latexSyncLoops: {
          ready: hasLatexSyncEvent,
          evidence: hasLatexSyncEvent ? 'latex sync workflow event observed' : 'pending latex sync evidence',
        },
        diagnosticsFlow: {
          ready: hasDiagnosticsPayload && telemetryTypes.has('diagnostics-update'),
          evidence:
            hasDiagnosticsPayload && telemetryTypes.has('diagnostics-update')
              ? 'diagnostics payload + telemetry observed'
              : 'pending diagnostics evidence',
        },
        citationFlow: {
          ready: hasCitationEvent,
          evidence: hasCitationEvent ? 'citation workflow event observed' : 'pending citation evidence',
        },
        typingLatency: {
          ready:
            state.typingLatencySamples.length >= 3 &&
            state.typingLatencySamples.some((sample) => Number(sample?.textLength || 0) >= 32) &&
            state.typingLatencySamples.every((sample) => Number(sample?.latencyMs || Infinity) <= 150),
          evidence:
            state.typingLatencySamples.length >= 3
              ? `${state.typingLatencySamples.length} samples, max ${Math.max(...state.typingLatencySamples.map((sample) => Number(sample?.latencyMs || 0)))} ms`
              : 'pending latency samples',
        },
        noDataLossAcrossReopen: {
          ready: !!state.reopenVerification?.lastPassedAt,
          evidence:
            state.reopenVerification?.lastPassedAt
              ? `verified at ${state.reopenVerification.lastPassedAt}`
              : 'pending reopen verification',
        },
      }
    },

    canSwitchToNativePrimarySurface() {
      return Object.values(this.cutoverGateStatus).every((gate) => gate.ready === true)
    },

    primarySurfaceTarget() {
      return this.useNativePrimarySurface
        ? PRIMARY_TEXT_SURFACE_TARGETS.NATIVE_PRIMARY
        : PRIMARY_TEXT_SURFACE_TARGETS.WEB
    },
  },

  actions: {
    recordTelemetryEvent(detail = {}) {
      const event = {
        ...detail,
        ts: detail?.ts || new Date().toISOString(),
      }
      this.telemetryEventCount += 1
      this.lastTelemetryEvent = event
      this.recentTelemetryEvents = [
        ...this.recentTelemetryEvents.slice(-(MAX_TELEMETRY_EVENTS - 1)),
        event,
      ]
    },

    clearTelemetryEvents() {
      this.telemetryEventCount = 0
      this.lastTelemetryEvent = null
      this.recentTelemetryEvents = []
    },

    recordNativeRuntimeEvent(payload = {}) {
      const event = {
        ...payload,
        ts: new Date().toISOString(),
      }
      this.nativeRuntimeEventCount += 1
      this.lastNativeRuntimeEvent = event
      this.recentNativeRuntimeEvents = [
        ...this.recentNativeRuntimeEvents.slice(-(MAX_TELEMETRY_EVENTS - 1)),
        event,
      ]

      const sessionId = String(payload?.sessionId || '').trim()
      if (sessionId) {
        this.lastNativeSessionId = sessionId
      }
    },

    clearNativeRuntimeEvents() {
      this.nativeRuntimeEventCount = 0
      this.lastNativeRuntimeEvent = null
      this.recentNativeRuntimeEvents = []
    },

    reduceNativeRuntimeState(payload = {}) {
      const kind = String(payload?.kind || '').trim()
      if (!kind) return

      if (kind === 'ready') {
        this.nativeRuntimeConnected = true
        this.nativeProtocolVersion = Number(payload?.protocolVersion || 0)
        return
      }

      if (kind === 'documentOpened' || kind === 'contentChanged') {
        const path = String(payload?.path || '').trim()
        if (!path) return
        const pendingProbe = pendingTypingLatencyByPath.get(path)
        if (
          pendingProbe &&
          typeof payload?.text === 'string' &&
          stableTextFingerprint(payload.text) === pendingProbe.textFingerprint
        ) {
          const sample = {
            path,
            fileKind: pendingProbe.fileKind,
            textLength: pendingProbe.textLength,
            latencyMs: Math.max(0, Date.now() - pendingProbe.startedAt),
            ts: new Date().toISOString(),
          }
          this.typingLatencySamples = [
            ...this.typingLatencySamples.slice(-(MAX_LATENCY_SAMPLES - 1)),
            sample,
          ]
          writeStoredJson(TYPING_LATENCY_STORAGE_KEY, this.typingLatencySamples)
          pendingTypingLatencyByPath.delete(path)
        }
        this.nativeDocuments = {
          ...this.nativeDocuments,
          [path]: {
            path,
            textLength: Number(payload?.textLength || 0),
            version: Number(payload?.version || this.nativeDocuments[path]?.version || 0),
            text: typeof payload?.text === 'string' ? payload.text : this.nativeDocuments[path]?.text || '',
            textPreview:
              typeof payload?.text === 'string'
                ? payload.text.length > 240
                  ? `${payload.text.slice(0, 240)}\n…`
                  : payload.text
                : this.nativeDocuments[path]?.textPreview || '',
            selections: Array.isArray(payload?.selections)
              ? payload.selections
              : this.nativeDocuments[path]?.selections || [],
            cursor: payload?.cursor || this.nativeDocuments[path]?.cursor || null,
            viewport: payload?.viewport || this.nativeDocuments[path]?.viewport || null,
            diagnostics: Array.isArray(payload?.diagnostics)
              ? payload.diagnostics
              : this.nativeDocuments[path]?.diagnostics || [],
            outlineContext:
              payload?.outlineContext ?? this.nativeDocuments[path]?.outlineContext ?? null,
            lastWorkflowEvent:
              payload?.lastWorkflowEvent ?? this.nativeDocuments[path]?.lastWorkflowEvent ?? null,
            reason: String(payload?.reason || '').trim(),
          },
        }
        return
      }

      if (kind === 'sessionState') {
        const nextDocuments = {}
        for (const entry of Array.isArray(payload?.openDocuments) ? payload.openDocuments : []) {
          const path = String(entry?.path || '').trim()
          if (!path) continue
          nextDocuments[path] = {
            path,
            textLength: Number(entry?.textLength || 0),
            version: Number(entry?.version || 0),
            text: this.nativeDocuments[path]?.text || '',
            textPreview: String(entry?.textPreview || ''),
            selections: Array.isArray(entry?.selections) ? entry.selections : [],
            cursor: entry?.cursor || null,
            viewport: entry?.viewport || null,
            diagnostics: Array.isArray(entry?.diagnostics) ? entry.diagnostics : [],
            outlineContext: entry?.outlineContext ?? null,
            lastWorkflowEvent: entry?.lastWorkflowEvent ?? null,
            reason: this.nativeDocuments[path]?.reason || '',
          }
        }
        this.nativeDocuments = nextDocuments
        return
      }

      if (kind === 'stopped') {
        this.nativeRuntimeConnected = false
      }
    },

    setShadowMode() {
      // Hidden shadow-mode toggles are retired. Native mirroring is always-on in desktop builds.
      return this.wantsNativeRuntime
    },

    setMode(value) {
      const requestedMode = Object.values(EDITOR_RUNTIME_MODES).includes(value)
        ? value
        : EDITOR_RUNTIME_MODES.WEB
      this.mode =
        requestedMode === EDITOR_RUNTIME_MODES.NATIVE_EXPERIMENTAL && !this.canSwitchToNativePrimarySurface
          ? EDITOR_RUNTIME_MODES.WEB
          : requestedMode
      writeStoredString(MODE_STORAGE_KEY, this.mode)
      return this.mode
    },

    beginTypingLatencyProbe({ path = '', text = '', fileKind = 'text' } = {}) {
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      pendingTypingLatencyByPath.set(normalizedPath, {
        startedAt: Date.now(),
        fileKind: String(fileKind || 'text'),
        textLength: String(text || '').length,
        textFingerprint: stableTextFingerprint(text),
      })
      return true
    },

    recordPersistedSnapshot({ path = '', text = '', fileKind = 'text' } = {}) {
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      const snapshot = {
        path: normalizedPath,
        fileKind: String(fileKind || 'text'),
        textFingerprint: stableTextFingerprint(text),
        textLength: String(text || '').length,
        savedAt: new Date().toISOString(),
      }
      this.reopenVerification = {
        ...this.reopenVerification,
        pending: {
          ...(this.reopenVerification?.pending || {}),
          [normalizedPath]: snapshot,
        },
      }
      writeStoredJson(REOPEN_VERIFICATION_STORAGE_KEY, this.reopenVerification)
      return true
    },

    verifyReopenSnapshot({ path = '', text = '', fileKind = 'text' } = {}) {
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      const pending = this.reopenVerification?.pending?.[normalizedPath]
      if (!pending) return false

      const passed = pending.textFingerprint === stableTextFingerprint(text)
      const record = {
        path: normalizedPath,
        fileKind: String(fileKind || pending.fileKind || 'text'),
        textLength: String(text || '').length,
        savedAt: pending.savedAt,
        verifiedAt: new Date().toISOString(),
        passed,
      }

      const nextPending = { ...(this.reopenVerification?.pending || {}) }
      delete nextPending[normalizedPath]

      this.reopenVerification = {
        pending: nextPending,
        history: [...(this.reopenVerification?.history || []).slice(-19), record],
        lastPassedAt: passed ? record.verifiedAt : this.reopenVerification?.lastPassedAt || '',
        lastFailedAt: !passed ? record.verifiedAt : this.reopenVerification?.lastFailedAt || '',
      }
      writeStoredJson(REOPEN_VERIFICATION_STORAGE_KEY, this.reopenVerification)
      return passed
    },

    attachTelemetryListener() {
      if (typeof window === 'undefined') return false
      if (telemetryListener) {
        this.telemetryAttached = true
        return true
      }

      telemetryListener = (event) => {
        this.recordTelemetryEvent(event?.detail || {})
      }

      window.addEventListener(EDITOR_RUNTIME_EVENT_NAME, telemetryListener)
      this.telemetryAttached = true
      return true
    },

    detachTelemetryListener() {
      if (typeof window === 'undefined') return false
      if (telemetryListener) {
        window.removeEventListener(EDITOR_RUNTIME_EVENT_NAME, telemetryListener)
        telemetryListener = null
      }
      this.telemetryAttached = false
      return true
    },

    async attachNativeRuntimeListener() {
      if (!nativeEditorBridgeAvailable()) return false
      if (nativeRuntimeListener) {
        this.nativeRuntimeConnected = true
        return true
      }

      nativeRuntimeListener = await listenToNativeEditorEvents((payload) => {
        this.recordNativeRuntimeEvent(payload)
        this.reduceNativeRuntimeState(payload)
      })
      this.nativeRuntimeConnected = true
      return true
    },

    async detachNativeRuntimeListener() {
      if (nativeRuntimeListener) {
        await nativeRuntimeListener()
        nativeRuntimeListener = null
      }
      this.nativeRuntimeConnected = false
      return true
    },

    async startNativeSession() {
      if (!nativeEditorBridgeAvailable()) return null
      await this.attachNativeRuntimeListener()
      const snapshot = await startNativeEditorSession()
      this.nativeSessionSnapshot = snapshot || null
      if (snapshot?.sessionId) {
        this.lastNativeSessionId = snapshot.sessionId
      }
      this.nativeProtocolVersion = Number(snapshot?.protocolVersion || 0)
      return snapshot
    },

    async syncShadowDocument({ path = '', text = '' } = {}) {
      if (!this.wantsNativeRuntime || !nativeEditorBridgeAvailable()) return null
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return null

      const snapshot = this.nativeSessionSnapshot || (await this.startNativeSession())
      if (!snapshot) return null
      const existingDocument = this.nativeDocuments[normalizedPath] || null
      if (existingDocument && typeof existingDocument.text === 'string' && existingDocument.text === text) {
        return snapshot
      }

      const knownPaths = new Set(
        this.recentNativeRuntimeEvents
          .filter((event) => event?.kind === 'documentOpened')
          .map((event) => String(event?.path || '').trim())
          .filter(Boolean)
      )

      if (knownPaths.has(normalizedPath)) {
        await applyNativeEditorExternalContent({
          path: normalizedPath,
          text,
        })
      } else {
        await openNativeEditorDocument({
          path: normalizedPath,
          text,
        })
      }

      return snapshot
    },

    async replaceNativeDocumentText({ path = '', text = '' } = {}) {
      if (!nativeEditorBridgeAvailable()) return false
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      await this.startNativeSession()
      const existingDocument = this.nativeDocuments[normalizedPath] || null
      if (existingDocument && typeof existingDocument.text === 'string') {
        await applyNativeEditorTransaction({
          path: normalizedPath,
          edits: [
            {
              start: 0,
              end: utf8ByteLength(existingDocument.text),
              text: String(text || ''),
            },
          ],
        })
      } else {
        await replaceNativeEditorDocumentText({
          path: normalizedPath,
          text,
        })
      }
      return true
    },

    async applyNativeTransaction({ path = '', edits = [] } = {}) {
      if (!nativeEditorBridgeAvailable()) return false
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      await this.startNativeSession()
      const currentText = String(
        this.nativeDocuments[normalizedPath]?.text ?? ''
      )
      await applyNativeEditorTransaction({
        path: normalizedPath,
        edits: Array.isArray(edits)
          ? edits.map((edit) => ({
              start: jsOffsetToUtf8Offset(currentText, edit?.start ?? 0),
              end: jsOffsetToUtf8Offset(currentText, edit?.end ?? 0),
              text: String(edit?.text || ''),
            }))
          : [],
      })
      return true
    },

    async setNativeSelections({ path = '', selections = [], viewportOffset = null } = {}) {
      if (!nativeEditorBridgeAvailable()) return false
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      await this.startNativeSession()
      const currentText = String(
        this.nativeDocuments[normalizedPath]?.text ?? ''
      )
      await setNativeEditorSelections({
        path: normalizedPath,
        selections: Array.isArray(selections)
          ? selections.map((selection) => ({
              anchor: jsOffsetToUtf8Offset(currentText, selection?.anchor ?? 0),
              head: jsOffsetToUtf8Offset(currentText, selection?.head ?? 0),
            }))
          : [],
        viewportOffset:
          viewportOffset === null || viewportOffset === undefined
            ? null
            : jsOffsetToUtf8Offset(currentText, viewportOffset),
      })
      return true
    },

    async inspectNativeInteractionContext({ path = '', text = null, selection = null } = {}) {
      if (!nativeEditorBridgeAvailable()) return null
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return null
      await this.startNativeSession()
      const currentText =
        typeof text === 'string'
          ? text
          : String(this.nativeDocuments[normalizedPath]?.text ?? '')
      await inspectNativeEditorInteractionContext({
        path: normalizedPath,
        text: currentText,
        selection:
          selection && typeof selection === 'object'
            ? {
                anchor: jsOffsetToUtf8Offset(currentText, selection?.anchor ?? 0),
                head: jsOffsetToUtf8Offset(currentText, selection?.head ?? 0),
              }
            : null,
      })
    },

    async setNativeDiagnostics({ path = '', diagnostics = [] } = {}) {
      if (!nativeEditorBridgeAvailable()) return false
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      await this.startNativeSession()
      await setNativeEditorDiagnostics({
        path: normalizedPath,
        diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
      })
      return true
    },

    async setNativeOutlineContext({ path = '', context = null } = {}) {
      if (!nativeEditorBridgeAvailable()) return false
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath) return false
      await this.startNativeSession()
      await setNativeEditorOutlineContext({
        path: normalizedPath,
        context: context == null ? null : context,
      })
      return true
    },

    async recordNativeWorkflowEvent({ path = '', event = null } = {}) {
      if (!nativeEditorBridgeAvailable()) return false
      const normalizedPath = String(path || '').trim()
      if (!normalizedPath || event == null) return false
      await this.startNativeSession()
      await recordNativeEditorWorkflowEvent({
        path: normalizedPath,
        event,
      })
      return true
    },

    async stopNativeSession() {
      if (!nativeEditorBridgeAvailable()) return false
      try {
        await stopNativeEditorSession()
      } finally {
        this.nativeSessionSnapshot = null
        this.nativeRuntimeConnected = false
        this.nativeDocuments = {}
      }
      return true
    },
  },
})
