import { createUIMessageStream } from 'ai'
import { t } from '../../i18n'
import {
  ensureOpencodeEndpoint,
  markOpencodeWorkspaceBusy,
  markOpencodeWorkspaceIdle,
} from './opencodeSidecar'

function normalizeEndpoint(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function createDirectoryHeaders(directory = '') {
  return directory
    ? { 'x-opencode-directory': encodeURIComponent(directory) }
    : {}
}

function getRuntimeSessionId(config = {}) {
  return String(config?.runtimeSessionId || '').trim()
}

function getRuntimeRole(config = {}) {
  return String(config?.toolRole || 'general').trim() || 'general'
}

function mapRoleToAgent(role = 'general') {
  if (role === 'code_assistant' || role === 'tex_typ_fixer') return 'build'
  return 'general'
}

function resolvePromptModel(config = {}) {
  const providerID = config?.provider || config?.access?.providerHint || config?.access?.provider
  const modelID = config?.access?.model
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

function findPromptMessage(messages = [], trigger = 'submit-message', messageId = undefined) {
  if (trigger === 'regenerate-message' && messageId) {
    const anchorIndex = messages.findIndex((message) => message.id === messageId)
    if (anchorIndex >= 0) {
      for (let index = anchorIndex; index >= 0; index -= 1) {
        if (messages[index]?.role === 'user') return messages[index]
      }
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messages[index]
  }
  return null
}

function uiMessageToPromptParts(message = null) {
  const parts = []
  for (const part of message?.parts || []) {
    if (part.type === 'text' && part.text) {
      parts.push({
        type: 'text',
        text: part.text,
      })
      continue
    }

    if (part.type === 'file' && part.url) {
      parts.push({
        type: 'file',
        mime: part.mediaType || 'application/octet-stream',
        filename: part.filename || undefined,
        url: part.url,
      })
    }
  }
  return parts
}

function toUsage(info = {}) {
  const tokens = info?.tokens || {}
  const cache = tokens.cache || {}
  const inputCacheMiss = Number(tokens.input) || 0
  const inputCacheHit = Number(cache.read) || 0
  const inputCacheWrite = Number(cache.write) || 0
  const output = Number(tokens.output) || 0
  const thinking = Number(tokens.reasoning) || 0
  return {
    input_cache_miss: inputCacheMiss,
    input_cache_hit: inputCacheHit,
    input_cache_write: inputCacheWrite,
    input_total: inputCacheMiss + inputCacheHit + inputCacheWrite,
    output,
    thinking,
    total: inputCacheMiss + inputCacheHit + inputCacheWrite + output,
    cost: 0,
  }
}

function writeTextChunk(writer, id, text = '') {
  writer.write({ type: 'text-start', id })
  if (text) writer.write({ type: 'text-delta', id, delta: text })
  writer.write({ type: 'text-end', id })
}

function summarizePatchPart(part = null) {
  const files = Array.isArray(part?.files) ? part.files.filter(Boolean) : []
  if (files.length === 0) return ''
  return `Updated files: ${files.join(', ')}`
}

function writeOpencodeParts(writer, parts = []) {
  let textIndex = 0
  const patchSummaries = []

  for (const part of parts) {
    if (!part?.type) continue

    if (part.type === 'reasoning' && part.text) {
      const id = `reasoning-${++textIndex}`
      writer.write({ type: 'reasoning-start', id })
      writer.write({ type: 'reasoning-delta', id, delta: part.text })
      writer.write({ type: 'reasoning-end', id })
      continue
    }

    if (part.type === 'text') {
      writeTextChunk(writer, `text-${++textIndex}`, part.text || '')
      continue
    }

    if (part.type === 'tool') {
      const toolCallId = part.callID || part.id
      const toolName = part.tool || 'tool'
      writer.write({
        type: 'tool-input-available',
        toolCallId,
        toolName,
        input: part.state?.input || {},
        title: part.state?.title || undefined,
      })

      if (part.state?.status === 'completed') {
        writer.write({
          type: 'tool-output-available',
          toolCallId,
          output: part.state?.output ?? '',
        })
      } else if (part.state?.status === 'error') {
        writer.write({
          type: 'tool-output-error',
          toolCallId,
          errorText: part.state?.error || t('Tool execution failed.'),
        })
      }
      continue
    }

    if (part.type === 'patch') {
      const summary = summarizePatchPart(part)
      if (summary) patchSummaries.push(summary)
    }
  }

  if (textIndex === 0 && patchSummaries.length > 0) {
    writeTextChunk(writer, 'text-1', patchSummaries.join('\n'))
  }
}

function extractJson(responseText = '') {
  const trimmed = String(responseText || '').trim()
  if (!trimmed) return null
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) return null
  return JSON.parse(trimmed.slice(start, end + 1))
}

async function opencodeFetch(endpoint, path, { method = 'GET', body, directory, signal } = {}) {
  const response = await fetch(`${normalizeEndpoint(endpoint)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...createDirectoryHeaders(directory),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const error = new Error(errorText || t('opencode request failed ({status})', { status: response.status }))
    error.status = response.status
    throw error
  }

  const text = await response.text()
  return text ? extractJson(text) : null
}

async function ensureRuntimeSession(config, endpoint, directory, abortSignal) {
  const existing = getRuntimeSessionId(config)
  if (existing) return existing

  const created = await opencodeFetch(endpoint, '/session', {
    method: 'POST',
    body: {
      title: config?.sessionLabel || undefined,
    },
    directory,
    signal: abortSignal,
  })

  const sessionID = created?.id
  if (!sessionID) throw new Error(t('Failed to create an opencode session.'))

  config?.onRuntimeMeta?.({
    runtimeSessionId: sessionID,
  })
  return sessionID
}

async function sendPrompt(config, options = {}) {
  const directory = config?.workspace?.path || ''
  const endpoint = await ensureOpencodeEndpoint(config?.workspace, {
    abortSignal: options.abortSignal,
    endpoint: config?.opencodeEndpoint,
  })

  markOpencodeWorkspaceBusy(config?.workspace, { endpoint })

  let sessionID = ''
  const abortHandler = async () => {
    if (!sessionID) return
    try {
      await opencodeFetch(endpoint, `/session/${sessionID}/abort`, {
        method: 'POST',
        directory,
      })
    } catch {}
  }

  if (options.abortSignal) {
    options.abortSignal.addEventListener('abort', abortHandler, { once: true })
  }

  try {
    sessionID = await ensureRuntimeSession(config, endpoint, directory, options.abortSignal)
    const promptResponse = await opencodeFetch(endpoint, `/session/${sessionID}/message`, {
      method: 'POST',
      body: {
        agent: mapRoleToAgent(getRuntimeRole(config)),
        model: resolvePromptModel(config),
        system: config?.systemPrompt || undefined,
        parts: options.parts,
      },
      directory,
      signal: options.abortSignal,
    })

    if (promptResponse?.info?.error) {
      const message = promptResponse.info.error?.data?.message || promptResponse.info.error?.name || 'opencode failed.'
      throw new Error(message)
    }

    return {
      endpoint,
      sessionID,
      response: promptResponse,
    }
  } finally {
    if (options.abortSignal) {
      options.abortSignal.removeEventListener('abort', abortHandler)
    }
    markOpencodeWorkspaceIdle(config?.workspace, {
      endpoint,
      idleDisposeMs: config?.opencodeIdleDisposeMs,
    })
  }
}

export function resolveOpencodeRuntimeState(config = {}) {
  const endpoint = normalizeEndpoint(
    config?.opencodeEndpoint ||
    config?.runtimeEndpoint ||
    '',
  )

  return {
    endpoint,
    available: true,
  }
}

export async function sendWithOpencodeRuntime({ config, messages, abortSignal, trigger, messageId } = {}) {
  const promptMessage = findPromptMessage(messages, trigger, messageId)
  if (!promptMessage) {
    return createUIMessageStream({
      execute({ writer }) {
        writer.write({ type: 'start' })
        writer.write({ type: 'start-step' })
        writeTextChunk(writer, 'text-1', '')
        writer.write({ type: 'finish-step' })
        writer.write({ type: 'finish' })
      },
    })
  }

  const parts = uiMessageToPromptParts(promptMessage)
  if (parts.length === 0) parts.push({ type: 'text', text: '' })

  return createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' })
      writer.write({ type: 'start-step' })

      try {
        const { response } = await sendPrompt(config, {
          parts,
          abortSignal,
        })

        if (config?.onUsage && response?.info) {
          config.onUsage(toUsage(response.info), response.info.modelID || config?.access?.model)
        }

        writeOpencodeParts(writer, response?.parts || [])
        writer.write({ type: 'finish-step' })
        writer.write({ type: 'finish' })
      } catch (error) {
        if (abortSignal?.aborted || error?.name === 'AbortError') {
          writer.write({ type: 'abort', reason: 'aborted' })
          return
        }
        throw error
      }
    },
  })
}
