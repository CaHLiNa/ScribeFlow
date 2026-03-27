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

const CODE_ACTION_KIND_VALUE_SET = [
  '',
  'quickfix',
  'refactor',
  'refactor.extract',
  'refactor.inline',
  'refactor.rewrite',
  'refactor.move',
  'source',
  'source.organizeImports',
]

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
    initializationOptions: {
      customizedShowDocument: true,
      supportHtmlInMarkdown: true,
      supportClientCodelens: true,
      supportExtendedCodeAction: true,
      triggerSuggest: true,
      triggerSuggestAndParameterHints: true,
      triggerParameterHints: true,
      delegateFsRequests: false,
    },
    capabilities: {
      workspace: {
        workspaceFolders: true,
        workspaceEdit: {
          documentChanges: true,
          changeAnnotationSupport: {
            groupsOnLabel: false,
          },
        },
        symbol: {
          dynamicRegistration: false,
        },
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
        hover: {
          contentFormat: ['markdown', 'plaintext'],
        },
        documentLink: {
          tooltipSupport: true,
        },
        signatureHelp: {
          dynamicRegistration: false,
          contextSupport: true,
          signatureInformation: {
            documentationFormat: ['markdown', 'plaintext'],
          },
        },
        foldingRange: {
          lineFoldingOnly: false,
        },
        inlayHint: {
          dynamicRegistration: false,
        },
        codeAction: {
          dynamicRegistration: false,
          isPreferredSupport: true,
          disabledSupport: true,
          dataSupport: true,
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: CODE_ACTION_KIND_VALUE_SET,
            },
          },
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
    this.latestSemanticTokens = new Map()
    this.diagnosticSubscribers = new Map()
    this.symbolSubscribers = new Map()
    this.semanticTokenSubscribers = new Map()
    this.notificationSubscribers = new Map()
    this.statusSubscribers = new Set()
    this.available = null
    this.lastError = ''
    this.binaryPath = null
    this.activeSessionToken = 0
    this.semanticTokenLegend = null
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

  subscribeSemanticTokens(filePath, listener) {
    const key = String(filePath || '')
    if (!this.semanticTokenSubscribers.has(key)) {
      this.semanticTokenSubscribers.set(key, new Set())
    }
    const listeners = this.semanticTokenSubscribers.get(key)
    listeners.add(listener)

    if (this.latestSemanticTokens.has(key)) {
      listener({
        tokens: this.latestSemanticTokens.get(key),
        legend: this.semanticTokenLegend,
      })
    }

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.semanticTokenSubscribers.delete(key)
      }
    }
  }

  subscribeNotification(method, listener) {
    const key = String(method || '')
    if (!key || typeof listener !== 'function') {
      return () => {}
    }

    if (!this.notificationSubscribers.has(key)) {
      this.notificationSubscribers.set(key, new Set())
    }

    const listeners = this.notificationSubscribers.get(key)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.notificationSubscribers.delete(key)
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

  emitSemanticTokens(filePath, tokens) {
    const listeners = this.semanticTokenSubscribers.get(filePath)
    if (!listeners || listeners.size === 0) return
    for (const listener of listeners) {
      listener({
        tokens,
        legend: this.semanticTokenLegend,
      })
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
    this.latestSemanticTokens.clear()
    this.started = false
    this.lastError = ''
    this.binaryPath = null
    this.semanticTokenLegend = null

    const launchStatus = await resolveTinymistLaunchStatus()
    if (!launchStatus.available || !launchStatus.launchCommand) {
      this.handleFailure('Tinymist is not installed')
      return false
    }

    const { Command } = await import('@tauri-apps/plugin-shell')
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
      const initializeResult = await this.request('initialize', buildInitializeParams(workspacePath))
      this.semanticTokenLegend = initializeResult?.capabilities?.semanticTokensProvider?.legend || null
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
      } catch {
        // Ignore shutdown request failures while tearing down the session.
      }
      try {
        await this.notify('exit', {})
      } catch {
        // Ignore exit notification failures while tearing down the session.
      }
      try {
        await child.kill()
      } catch {
        // Ignore kill failures once the child process is already stopping.
      }
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
    void this.refreshSemanticTokens(filePath)

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
    void this.refreshSemanticTokens(filePath)

    return true
  }

  async closeDocument(filePath) {
    const uri = filePathToTinymistUri(filePath)
    if (!this.started || !this.child || !this.documents.has(uri)) return

    this.documents.delete(uri)
    this.latestDiagnostics.delete(filePath)
    this.latestDocumentSymbols.delete(filePath)
    this.latestSemanticTokens.delete(filePath)
    this.emitDocumentSymbols(filePath, [])
    this.emitSemanticTokens(filePath, null)
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

  async refreshSemanticTokens(filePath) {
    if (!this.started || !this.child || !this.semanticTokenLegend) return null
    const uri = filePathToTinymistUri(filePath)
    const existing = this.documents.get(uri)
    if (!existing) return null
    const currentVersion = existing.version

    try {
      const result = await this.request('textDocument/semanticTokens/full', {
        textDocument: { uri },
      })
      const latest = this.documents.get(uri)
      if (!latest || latest.version !== currentVersion) {
        return null
      }
      const semanticTokens = result?.data ? result : null
      this.latestSemanticTokens.set(filePath, semanticTokens)
      this.emitSemanticTokens(filePath, semanticTokens)
      return semanticTokens
    } catch {
      return null
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

  async requestDefinition(filePath, position) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/definition', {
        textDocument: { uri },
        position,
      })
    } catch {
      return null
    }
  }

  async requestReferences(filePath, position, context = {}) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/references', {
        textDocument: { uri },
        position,
        context: {
          includeDeclaration: context.includeDeclaration === true,
        },
      })
    } catch {
      return null
    }
  }

  async requestRename(filePath, position, newName) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/rename', {
        textDocument: { uri },
        position,
        newName,
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

  async requestDocumentLinks(filePath) {
    if (!this.started || !this.child) return []
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return []

    try {
      const result = await this.request('textDocument/documentLink', {
        textDocument: { uri },
      })
      return Array.isArray(result) ? result : []
    } catch {
      return []
    }
  }

  async requestSignatureHelp(filePath, position, context = null) {
    if (!this.started || !this.child) return null
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return null

    try {
      return await this.request('textDocument/signatureHelp', {
        textDocument: { uri },
        position,
        context: context || undefined,
      })
    } catch {
      return null
    }
  }

  async requestFoldingRanges(filePath) {
    if (!this.started || !this.child) return []
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return []

    try {
      const result = await this.request('textDocument/foldingRange', {
        textDocument: { uri },
      })
      return Array.isArray(result) ? result : []
    } catch {
      return []
    }
  }

  async requestCodeActions(filePath, range, context = {}) {
    if (!this.started || !this.child) return []
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return []

    try {
      const result = await this.request('textDocument/codeAction', {
        textDocument: { uri },
        range,
        context: {
          diagnostics: Array.isArray(context?.diagnostics) ? context.diagnostics : [],
          only: Array.isArray(context?.only) && context.only.length > 0 ? context.only : undefined,
          triggerKind: context?.triggerKind ?? undefined,
        },
      })
      return Array.isArray(result) ? result : []
    } catch {
      return []
    }
  }

  async requestInlayHints(filePath, range) {
    if (!this.started || !this.child) return []
    const uri = filePathToTinymistUri(filePath)
    if (!this.documents.has(uri)) return []

    try {
      const result = await this.request('textDocument/inlayHint', {
        textDocument: { uri },
        range,
      })
      return Array.isArray(result) ? result : []
    } catch {
      return []
    }
  }

  async requestWorkspaceSymbols(query, options = {}) {
    const ready = await this.ensureStarted({
      workspacePath: options.workspacePath || null,
    })
    if (!ready || !this.started || !this.child) return []

    try {
      const result = await this.request('workspace/symbol', {
        query: String(query || ''),
      })
      return Array.isArray(result) ? result : []
    } catch {
      return []
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

  async executeCommand(command, args = [], options = {}) {
    const ready = await this.ensureStarted({
      workspacePath: options.workspacePath || null,
    })
    if (!ready || !this.started || !this.child) return null

    return this.request('workspace/executeCommand', {
      command,
      arguments: Array.isArray(args) ? args : [],
    })
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
      return
    }

    const listeners = this.notificationSubscribers.get(String(message?.method || ''))
    if (!listeners || listeners.size === 0) return

    for (const listener of listeners) {
      try {
        listener(message.params, message)
      } catch {
        // Keep the session alive if a subscriber fails.
      }
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
    this.semanticTokenLegend = null
    this.documents.clear()
    this.latestDiagnostics.clear()
    this.latestDocumentSymbols.clear()
    this.latestSemanticTokens.clear()
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

export function subscribeTinymistSemanticTokens(filePath, listener) {
  return sharedSession.subscribeSemanticTokens(filePath, listener)
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

export function requestTinymistDefinition(filePath, position) {
  return sharedSession.requestDefinition(filePath, position)
}

export function requestTinymistReferences(filePath, position, context = {}) {
  return sharedSession.requestReferences(filePath, position, context)
}

export function requestTinymistRename(filePath, position, newName) {
  return sharedSession.requestRename(filePath, position, newName)
}

export function requestTinymistHover(filePath, position) {
  return sharedSession.requestHover(filePath, position)
}

export function requestTinymistDocumentLinks(filePath) {
  return sharedSession.requestDocumentLinks(filePath)
}

export function requestTinymistSignatureHelp(filePath, position, context = null) {
  return sharedSession.requestSignatureHelp(filePath, position, context)
}

export function requestTinymistFoldingRanges(filePath) {
  return sharedSession.requestFoldingRanges(filePath)
}

export function requestTinymistCodeActions(filePath, range, context = {}) {
  return sharedSession.requestCodeActions(filePath, range, context)
}

export function requestTinymistInlayHints(filePath, range) {
  return sharedSession.requestInlayHints(filePath, range)
}

export function requestTinymistWorkspaceSymbols(query, options = {}) {
  return sharedSession.requestWorkspaceSymbols(query, options)
}

export function requestTinymistFormatting(filePath, options = {}) {
  return sharedSession.requestFormatting(filePath, options)
}

export function requestTinymistExecuteCommand(command, args = [], options = {}) {
  return sharedSession.executeCommand(command, args, options)
}

export function subscribeTinymistNotification(method, listener) {
  return sharedSession.subscribeNotification(method, listener)
}
