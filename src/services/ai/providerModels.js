import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n/index.js'
import {
  normalizeAnthropicBaseUrl,
  normalizeGoogleBaseUrl,
  normalizeOpenAiBaseUrl,
} from './runtime/urlUtils.js'

function normalizeErrorDetail(status = 0, text = '', parsed = null) {
  return (
    parsed?.error?.message ||
    parsed?.message ||
    String(text || '').trim() ||
    t('AI request failed with HTTP {status}', { status: status || t('unknown') })
  )
}

async function requestJson(request = {}) {
  const response = await invoke('proxy_api_call_full', { request })
  const status = Number(response?.status || 0)
  const text = String(response?.body || '')
  let parsed = null

  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  if (!(status >= 200 && status < 300)) {
    const error = new Error(normalizeErrorDetail(status, text, parsed))
    error.status = status
    throw error
  }

  return parsed
}

function sortModelOptions(options = []) {
  return [...options].sort((left, right) =>
    String(left.label || left.value || '').localeCompare(String(right.label || right.value || ''))
  )
}

function normalizeOpenAiModelOptions(payload = null) {
  const options = (Array.isArray(payload?.data) ? payload.data : [])
    .map((entry) => {
      const value = String(entry?.id || '').trim()
      if (!value) return null
      return {
        value,
        label: value,
      }
    })
    .filter(Boolean)

  return sortModelOptions(options)
}

function normalizeAnthropicModelOptions(payload = null) {
  const options = (Array.isArray(payload?.data) ? payload.data : [])
    .map((entry) => {
      const value = String(entry?.id || '').trim()
      if (!value) return null
      const label = String(entry?.display_name || value).trim()
      return {
        value,
        label,
      }
    })
    .filter(Boolean)

  return sortModelOptions(options)
}

function normalizeGoogleModelOptions(payload = null) {
  const options = (Array.isArray(payload?.models) ? payload.models : [])
    .filter((entry) => {
      const methods = Array.isArray(entry?.supportedGenerationMethods)
        ? entry.supportedGenerationMethods
        : []
      return methods.includes('generateContent') || methods.includes('streamGenerateContent')
    })
    .map((entry) => {
      const rawName = String(entry?.name || '').trim()
      const value = rawName.replace(/^models\//, '')
      if (!value) return null
      return {
        value,
        label: String(entry?.displayName || value).trim(),
      }
    })
    .filter(Boolean)

  return sortModelOptions(options)
}

async function listOpenAiCompatibleModels(config = {}, apiKey = '') {
  const baseUrl = String(config.baseUrl || '').trim()
  if (!baseUrl) throw new Error(t('AI base URL is missing.'))

  const payload = await requestJson({
    url: `${normalizeOpenAiBaseUrl(baseUrl)}/models`,
    method: 'GET',
    headers: apiKey
      ? {
          authorization: `Bearer ${apiKey}`,
        }
      : {},
    body: '',
  })

  return normalizeOpenAiModelOptions(payload)
}

async function listAnthropicModels(config = {}, apiKey = '') {
  const baseUrl = String(config.baseUrl || '').trim()
  if (!baseUrl) throw new Error(t('AI base URL is missing.'))
  if (!apiKey) throw new Error(t('AI API key is missing.'))

  const payload = await requestJson({
    url: `${normalizeAnthropicBaseUrl(baseUrl)}/models`,
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: '',
  })

  return normalizeAnthropicModelOptions(payload)
}

async function listGoogleModels(config = {}, apiKey = '') {
  const baseUrl = String(config.baseUrl || '').trim()
  if (!baseUrl) throw new Error(t('AI base URL is missing.'))
  if (!apiKey) throw new Error(t('AI API key is missing.'))

  const payload = await requestJson({
    url: `${normalizeGoogleBaseUrl(baseUrl)}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    method: 'GET',
    headers: {},
    body: '',
  })

  return normalizeGoogleModelOptions(payload)
}

export async function listAiProviderModels(providerId = 'openai', config = {}, apiKey = '') {
  const normalizedProviderId = String(providerId || '').trim()

  if (normalizedProviderId === 'anthropic') {
    return listAnthropicModels(config, apiKey)
  }

  if (normalizedProviderId === 'google') {
    return listGoogleModels(config, apiKey)
  }

  return listOpenAiCompatibleModels(config, apiKey)
}
