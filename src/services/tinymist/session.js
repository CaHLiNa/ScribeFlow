import { Command } from '@tauri-apps/plugin-shell'
import { invoke } from '@tauri-apps/api/core'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8')
const HEADER_SEPARATOR = new Uint8Array([13, 10, 13, 10]) // \r\n\r\n

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function isWindowsDrivePath(path) {
  return /^[A-Za-z]:[\\/]/.test(path)
}

function encodeFilePath(path) {
  return encodeURI(path)
    .replace(/\?/g, '%3F')
    .replace(/#/g, '%23')
}

export function filePathToTinymistUri(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  if (!normalized) return ''
  if (isWindowsDrivePath(normalized)) {
    return `file:///${encodeFilePath(normalized)}`
  }
  return `file://${encodeFilePath(normalized)}`
}

export function tinymistUriToFilePath(uri) {
  if (!uri) return ''
  try {
    const url = new URL(uri)
    let path = decodeURIComponent(url.pathname || '')
    if (isWindowsDrivePath(path.slice(1))) {
      path = path.slice(1)
    }
    return path
  } catch {
    return ''
  }
}

function concatBytes(left, right) {
  const next = new Uint8Array(left.length + right.length)
  next.set(left, 0)
  next.set(right, left.length)
  return next
}

function toUint8Array(payload) {
  if (payload instanceof Uint8Array) return payload
  if (Array.isArray(payload)) return Uint8Array.from(payload)
  return textEncoder.encode(String(payload || ''))
}

function indexOfSequence(buffer, sequence) {
  outer: for (let index = 0; index <= buffer.length - sequence.length; index += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (buffer[index + offset] !== sequence[offset]) {
        continue outer
      }
    }
    return index
  }
  return -1
}

function parseContentLength(headerText) {
  const match = /content-length:\s*(\d+)/i.exec(headerText)
  return match ? Number.parseInt(match[1], 10) : null
}

function workspaceNameFromPath(workspacePath = '') {
  const parts = String(workspacePath).split('/').filter(Boolean)
  return parts[parts.length - 1] || 'workspace'
}

function buildInitializeParams(workspacePath) {
  const rootUri = workspacePath ? filePathToTinymistUri(workspacePath) : null
  return {
    processId: null,
    clientInfo: {
      name: 'Altals',
      version: '0.2.18',
    },
    rootUri,
    workspaceFolders: rootUri
      ? [{ uri: rootUri, name: workspaceNameFromPath(workspacePath) }]
      : [],
    capabilities: {
      workspace: {
        workspaceFolders: true,
      },
      textDocument: {
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true,
        },
        synchronization: {
          didSave: false,
          willSave: false,
          willSaveWaitUntil: false,
        },
      },
      general: {
        positionEncodings: ['utf-8', 'utf-16'],
      },
    },
  }
}

async function resolveTinymistLaunchStatus() {
  try {
    const status = await invoke('check_tinymist_binary')
    return {
      available: status?.installed === true,
      path: status?.path || null,
      launchCommand: status?.launchCommand || status?.launch_command || null,
    }
  } catch {
    return {
      available: false,
      path: null,
      launchCommand: null,
    }
  }
}

class TinymistSession {
  constructor() {
    this.child = null
    this.command = null
    this.workspacePath = null
    this.started = false
    this.startPromise = null
    this.stdoutBuffer = new Uint8Array(0)
    this.nextRequestId = 1
    this.pendingRequests = new Map()
    this.documents = new Map()
    this.latestDiagnostics = new Map()
    this.latestDocumentSymbols = new Map()
    this.diagnosticSubscribers = new Map()
    this.symbolSubscribers = new Map()
    this.statusSubscribers = new Set()
    this.available = null
    this.lastError = ''
    this.binaryPath = null
    this.activeSessionToken = 0
  }

  subscribeStatus(listener) {
    this.statusSubscribers.add(listener)
    listener(this.getStatus())
    return () => {
      this.statusSubscribers.delete(listener)
    }
  }

  subscribeDiagnostics(filePath, listener) {
    const key = String(filePath || '')
    if (!this.diagnosticSubscribers.has(key)) {
      this.diagnosticSubscribers.set(key, new Set())
    }
    const listeners = this.diagnosticSubscribers.get(key)
    listeners.add(listener)

    if (this.latestDiagnostics.has(key)) {
      listener(this.latestDiagnostics.get(key))
    }

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.diagnosticSubscribers.delete(key)
      }
    }
  }

  subscribeDocumentSymbols(filePath, listener) {
    const key = String(filePath || '')
    if (!this.symbolSubscribers.has(key)) {
      this.symbolSubscribers.set(key, new Set())
    }
    const listeners = this.symbolSubscribers.get(key)
    listeners.add(listener)

    if (this.latestDocumentSymbols.has(key)) {
      listener(this.latestDocumentSymbols.get(key))
    }

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.symbolSubscribers.delete(key)
      }
    }
  }

  getStatus() {
    return {
      available: this.available === true,
      started: this.started,
      lastError: this.lastError,
      binaryPath: this.binaryPath,
      workspacePath: this.workspacePath,
    }
  }

  emitStatus() {
    const status = this.getStatus()
    for (const listener of this.statusSubscribers) {
      listener(status)
    }
  }

  emitDiagnostics(filePath, diagnostics) {
    const listeners = this.diagnosticSubscribers.get(filePath)
    if (!listeners || listeners.size === 0) return
    for (const listener of listeners) {
      listener(diagnostics)
    }
  }

  emitDocumentSymbols(filePath, symbols) {
    const listeners = this.symbolSubscribers.get(filePath)
    if (!listeners || listeners.size === 0) return
    for (const listener of listeners) {
      listener(symbols)
    }
  }

  async ensureStarted(options = {}) {
    const workspacePath = options.workspacePath || null

    if (this.started && this.child && this.workspacePath === workspacePath) {
      return true
    }

    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.start(workspacePath)
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async start(workspacePath) {
    if (this.child) {
      await this.stop()
    }

    this.activeSessionToken += 1
    const sessionToken = this.activeSessionToken
    this.workspacePath = workspacePath
    this.stdoutBuffer = new Uint8Array(0)
    this.pendingRequests.clear()
    this.documents.clear()
    this.latestDiagnostics.clear()
    this.latestDocumentSymbols.clear()
    this.started = false
    this.lastError = ''
    this.binaryPath = null

    const launchStatus = await resolveTinymistLaunchStatus()
    if (!launchStatus.available || !launchStatus.launchCommand) {
      this.handleFailure('Tinymist is not installed')
      return false
    }

    const command = Command.create(launchStatus.launchCommand, ['lsp'], {
      cwd: workspacePath || undefined,
      encoding: 'raw',
    })

    command.stdout.on('data', (chunk) => {
      if (this.activeSessionToken !== sessionToken) return
      this.handleStdout(chunk)
    })
    command.stderr.on('data', () => {})
    command.on('error', (error) => {
      if (this.activeSessionToken !== sessionToken) return
      this.handleFailure(error)
    })
    command.on('close', (payload) => {
      if (this.activeSessionToken !== sessionToken) return
      if (payload?.code === 0 && this.started) {
        this.handleStopped('')
        return
      }
      this.handleFailure(`Tinymist exited (${payload?.code ?? 'unknown'})`)
    })

    this.command = command

    try {
      this.child = await command.spawn()
      await this.request('initialize', buildInitializeParams(workspacePath))
      await this.notify('initialized', {})
      this.available = true
      this.started = true
      this.lastError = ''
      this.binaryPath = launchStatus.path
      this.emitStatus()
      return true
    } catch (error) {
      this.handleFailure(error)
      return false
    }
  }

  async stop() {
    const child = this.child
    if (child) {
      try {
        await this.request('shutdown', null)
      } catch {}
      try {
        await this.notify('exit', {})
      } catch {}
      try {
        await child.kill()
      } catch {}
    }

    this.handleStopped('')
  }

  async openDocument(filePath, text, options = {}) {
    const ready = await this.ensureStarted(options)
    if (!ready) return false

    const uri = filePathToTinymistUri(filePath)
    const existing = this.documents.get(uri)
    if (existing) {
      return this.updateDocument(filePath, text)
    }

    this.documents.set(uri, {
      filePath,
      version: 1,
    })

    await this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typst',
        version: 1,
        text,
      },
    })

    void this.refreshDocumentSymbols(filePath)

    return true
  }

  async updateDocument(filePath, text) {
    if (!this.started || !this.child) return false

    const uri = filePathToTinymistUri(filePath)
    const existing = this.documents.get(uri)
    if (!existing) return false

    existing.version += 1
    await this.notify('textDocument/didChange', {
      textDocument: {
        uri,
        version: existing.version,
      },
      contentChanges: [{ text }],
    })

    void this.refreshDocumentSymbols(filePath)

    return true
  }

  async closeDocument(filePath) {
    const uri = filePathToTinymistUri(filePath)
    if (!this.started || !this.child || !this.documents.has(uri)) return

    this.documents.delete(uri)
    this.latestDiagnostics.delete(filePath)
    this.latestDocumentSymbols.delete(filePath)
    this.emitDocumentSymbols(filePath, [])
    await this.notify('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  async refreshDocumentSymbols(filePath) {
    if (!this.started || !this.child) return []
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return []

    try {
      const result = await this.request('textDocument/documentSymbol', {
        textDocument: { uri },
      })
      const symbols = Array.isArray(result) ? result : []
      this.latestDocumentSymbols.set(filePath, symbols)
      this.emitDocumentSymbols(filePath, symbols)
      return symbols
    } catch {
      return []
    }
  }

  async requestCompletion(filePath, position, context = {}) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/completion', {
        textDocument: { uri },
        position,
        context,
      })
    } catch {
      return null
    }
  }

  async requestHover(filePath, position) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/hover', {
        textDocument: { uri },
        position,
      })
    } catch {
      return null
    }
  }

  async requestFormatting(filePath, options = {}) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/formatting', {
        textDocument: { uri },
        options: {
          tabSize: Number.isInteger(options.tabSize) ? options.tabSize : 2,
          insertSpaces: options.insertSpaces !== false,
        },
      })
    } catch {
      return null
    }
  }

  async request(method, params) {
    const id = this.nextRequestId
    this.nextRequestId += 1
    const deferred = createDeferred()
    this.pendingRequests.set(id, deferred)

    try {
      await this.send({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })
    } catch (error) {
      this.pendingRequests.delete(id)
      deferred.reject(error)
    }

    return deferred.promise
  }

  async notify(method, params) {
    await this.send({
      jsonrpc: '2.0',
      method,
      params,
    })
  }

  async send(message) {
    if (!this.child) {
      throw new Error('Tinymist session is not running')
    }

    const payload = textEncoder.encode(JSON.stringify(message))
    const header = textEncoder.encode(`Content-Length: ${payload.byteLength}\r\n\r\n`)
    const frame = new Uint8Array(header.byteLength + payload.byteLength)
    frame.set(header, 0)
    frame.set(payload, header.byteLength)
    await this.child.write(frame)
  }

  handleStdout(chunk) {
    this.stdoutBuffer = concatBytes(this.stdoutBuffer, toUint8Array(chunk))

    while (true) {
      const headerEnd = indexOfSequence(this.stdoutBuffer, HEADER_SEPARATOR)
      if (headerEnd === -1) return

      const headerBytes = this.stdoutBuffer.slice(0, headerEnd)
      const headerText = textDecoder.decode(headerBytes)
      const contentLength = parseContentLength(headerText)
      if (!Number.isInteger(contentLength)) {
        this.stdoutBuffer = new Uint8Array(0)
        return
      }

      const messageStart = headerEnd + HEADER_SEPARATOR.length
      const messageEnd = messageStart + contentLength
      if (this.stdoutBuffer.length < messageEnd) return

      const messageBytes = this.stdoutBuffer.slice(messageStart, messageEnd)
      this.stdoutBuffer = this.stdoutBuffer.slice(messageEnd)

      try {
        const message = JSON.parse(textDecoder.decode(messageBytes))
        this.handleMessage(message)
      } catch {
        // Ignore malformed payloads but keep the session alive.
      }
    }
  }

  handleMessage(message) {
    if (message && Object.prototype.hasOwnProperty.call(message, 'id')) {
      const deferred = this.pendingRequests.get(message.id)
      if (!deferred) return
      this.pendingRequests.delete(message.id)

      if (message.error) {
        deferred.reject(new Error(message.error.message || 'Tinymist request failed'))
        return
      }

      deferred.resolve(message.result)
      return
    }

    if (message?.method === 'textDocument/publishDiagnostics') {
      this.handlePublishDiagnostics(message.params || {})
    }
  }

  handlePublishDiagnostics(params) {
    const filePath = tinymistUriToFilePath(params.uri)
    if (!filePath) return

    const diagnostics = Array.isArray(params.diagnostics) ? params.diagnostics : []
    this.latestDiagnostics.set(filePath, diagnostics)
    this.emitDiagnostics(filePath, diagnostics)
  }

  handleStopped(lastError = '') {
    this.started = false
    this.child = null
    this.command = null
    this.available = false
    this.lastError = lastError
    this.binaryPath = null
    this.documents.clear()
    this.latestDiagnostics.clear()
    this.latestDocumentSymbols.clear()
    this.emitStatus()

    for (const [, deferred] of this.pendingRequests) {
      deferred.reject(new Error(lastError || 'Tinymist stopped'))
    }
    this.pendingRequests.clear()
  }

  handleFailure(error) {
    const message = error instanceof Error ? error.message : String(error || 'Tinymist failed')
    this.handleStopped(message)
  }
}

const sharedSession = new TinymistSession()

export function subscribeTinymistStatus(listener) {
  return sharedSession.subscribeStatus(listener)
}

export function subscribeTinymistDiagnostics(filePath, listener) {
  return sharedSession.subscribeDiagnostics(filePath, listener)
}

export function subscribeTinymistDocumentSymbols(filePath, listener) {
  return sharedSession.subscribeDocumentSymbols(filePath, listener)
}

export function ensureTinymistDocument(filePath, text, options = {}) {
  return sharedSession.openDocument(filePath, text, options)
}

export function updateTinymistDocument(filePath, text) {
  return sharedSession.updateDocument(filePath, text)
}

export function closeTinymistDocument(filePath) {
  return sharedSession.closeDocument(filePath)
}

export function getTinymistSessionStatus() {
  return sharedSession.getStatus()
}

export function requestTinymistCompletion(filePath, position, context = {}) {
  return sharedSession.requestCompletion(filePath, position, context)
}

export function requestTinymistHover(filePath, position) {
  return sharedSession.requestHover(filePath, position)
}

export function requestTinymistFormatting(filePath, options = {}) {
  return sharedSession.requestFormatting(filePath, options)
}
