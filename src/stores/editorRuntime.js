import { defineStore } from 'pinia'
import { EDITOR_RUNTIME_EVENT_NAME } from '../domains/editor/editorRuntimeContract'
import {
  applyNativeEditorExternalContent,
  listenToNativeEditorEvents,
  nativeEditorBridgeAvailable,
  openNativeEditorDocument,
  replaceNativeEditorDocumentText,
  startNativeEditorSession,
  stopNativeEditorSession,
} from '../services/editorRuntime/nativeBridge'

export const EDITOR_RUNTIME_MODES = Object.freeze({
  WEB: 'web',
  NATIVE_EXPERIMENTAL: 'native-experimental',
})

const MAX_TELEMETRY_EVENTS = 200
const SHADOW_MODE_STORAGE_KEY = 'editorRuntime.shadowMode'
const MODE_STORAGE_KEY = 'editorRuntime.mode'
let telemetryListener = null
let nativeRuntimeListener = null

function readStoredBoolean(key, fallback = false) {
  try {
    const value = String(localStorage.getItem(key) ?? '').trim().toLowerCase()
    if (!value) return fallback
    return value === 'true' || value === '1' || value === 'yes' || value === 'on'
  } catch {
    return fallback
  }
}

function writeStoredBoolean(key, value) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // Ignore localStorage persistence failures.
  }
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

export const useEditorRuntimeStore = defineStore('editorRuntime', {
  state: () => ({
    mode: readStoredMode(EDITOR_RUNTIME_MODES.WEB),
    shadowMode: readStoredBoolean(SHADOW_MODE_STORAGE_KEY, false),
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
  }),

  getters: {
    wantsNativeRuntime(state) {
      return state.shadowMode || state.mode === EDITOR_RUNTIME_MODES.NATIVE_EXPERIMENTAL
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
        this.nativeDocuments = {
          ...this.nativeDocuments,
          [path]: {
            path,
            textLength: Number(payload?.textLength || 0),
            text: typeof payload?.text === 'string' ? payload.text : this.nativeDocuments[path]?.text || '',
            textPreview:
              typeof payload?.text === 'string'
                ? payload.text.length > 240
                  ? `${payload.text.slice(0, 240)}\n…`
                  : payload.text
                : this.nativeDocuments[path]?.textPreview || '',
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
            text: this.nativeDocuments[path]?.text || '',
            textPreview: String(entry?.textPreview || ''),
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

    setShadowMode(value) {
      this.shadowMode = value === true
      writeStoredBoolean(SHADOW_MODE_STORAGE_KEY, this.shadowMode)
      return this.shadowMode
    },

    setMode(value) {
      this.mode = Object.values(EDITOR_RUNTIME_MODES).includes(value)
        ? value
        : EDITOR_RUNTIME_MODES.WEB
      writeStoredString(MODE_STORAGE_KEY, this.mode)
      return this.mode
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
      await replaceNativeEditorDocumentText({
        path: normalizedPath,
        text,
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
