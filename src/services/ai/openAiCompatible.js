import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n/index.js'

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function extractAssistantContent(payload = {}) {
  const firstChoice = Array.isArray(payload?.choices) ? payload.choices[0] : null
  const content = firstChoice?.message?.content

  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text') return item.text || ''
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function postJson(config, apiKey, messages, options = {}, responseFormatJson = true) {
  const response = await invoke('proxy_ai_chat_completion', {
    request: {
      base_url: normalizeBaseUrl(config.baseUrl || ''),
      api_key: apiKey,
      model: String(config.model || '').trim(),
      messages,
      temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : 0.2,
      max_tokens: Number.isFinite(Number(options.maxTokens)) ? Number(options.maxTokens) : 1400,
      response_format_json: responseFormatJson,
    },
  })

  const text = String(response?.body || '')
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  const status = Number(response?.status || 0)
  if (!(status >= 200 && status < 300)) {
    const detail =
      parsed?.error?.message ||
      parsed?.message ||
      text ||
      t('AI request failed with HTTP {status}', { status: status || t('unknown') })
    const error = new Error(detail)
    error.status = status
    throw error
  }

  return parsed
}

export async function requestOpenAiCompatibleCompletion(
  config = {},
  apiKey = '',
  messages = [],
  options = {}
) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || '')
  if (!baseUrl) {
    throw new Error(t('AI base URL is missing.'))
  }
  if (!apiKey) {
    throw new Error(t('AI API key is missing.'))
  }
  if (!String(config.model || '').trim()) {
    throw new Error(t('AI model is missing.'))
  }

  let payload = null
  try {
    payload = await postJson(config, apiKey, messages, options, true)
  } catch (error) {
    if (Number(error?.status) === 400) {
      payload = await postJson(config, apiKey, messages, options, false)
    } else {
      throw error
    }
  }

  const content = extractAssistantContent(payload)
  if (!content) {
    throw new Error(t('AI provider returned an empty response.'))
  }

  return {
    content,
    payload,
  }
}
