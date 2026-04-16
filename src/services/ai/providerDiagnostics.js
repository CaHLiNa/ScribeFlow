import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n/index.js'
import { requestOpenAiCompatibleCompletion } from './openAiCompatible.js'
import {
  normalizeAnthropicBaseUrl,
  normalizeGoogleBaseUrl,
} from './runtime/urlUtils.js'

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeErrorDetail(status = 0, text = '', parsed = null) {
  return parsed?.error?.message
    || parsed?.message
    || String(text || '').trim()
    || t('AI request failed with HTTP {status}', { status: status || t('unknown') })
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

async function testAnthropicProvider(config = {}, apiKey = '') {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  if (!baseUrl) throw new Error(t('AI base URL is missing.'))
  if (!apiKey) throw new Error(t('AI API key is missing.'))
  if (!String(config.model || '').trim()) throw new Error(t('AI model is missing.'))

  await requestJson({
    url: `${normalizeAnthropicBaseUrl(baseUrl)}/messages`,
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: String(config.model || '').trim(),
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    }),
  })
}

async function testGoogleProvider(config = {}, apiKey = '') {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  if (!baseUrl) throw new Error(t('AI base URL is missing.'))
  if (!apiKey) throw new Error(t('AI API key is missing.'))

  await requestJson({
    url: `${normalizeGoogleBaseUrl(baseUrl)}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    method: 'GET',
    headers: {},
    body: '',
  })
}

export async function testAiProviderConnection(providerId = 'openai', config = {}, apiKey = '') {
  const normalizedProviderId = String(providerId || '').trim()

  if (normalizedProviderId === 'anthropic') {
    await testAnthropicProvider(config, apiKey)
    return
  }

  if (normalizedProviderId === 'google') {
    await testGoogleProvider(config, apiKey)
    return
  }

  await requestOpenAiCompatibleCompletion(
    {
      ...config,
      providerId: normalizedProviderId,
    },
    apiKey,
    [
      { role: 'system', content: 'Return valid JSON only.' },
      { role: 'user', content: 'Return {"answer":"ok"}' },
    ],
    { maxTokens: 40 }
  )
}
