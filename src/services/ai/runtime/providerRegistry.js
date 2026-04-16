import { AnthropicAdapter } from './anthropicAdapter.js'
import { GoogleAdapter } from './googleAdapter.js'
import { OpenAIAdapter } from './openAiAdapter.js'

const ADAPTERS = Object.freeze({
  anthropic: new AnthropicAdapter(),
  openai: new OpenAIAdapter('openai'),
  deepseek: new OpenAIAdapter('deepseek'),
  glm: new OpenAIAdapter('glm'),
  kimi: new OpenAIAdapter('kimi'),
  minimax: new OpenAIAdapter('minimax'),
  custom: new OpenAIAdapter('custom'),
  google: new GoogleAdapter(),
})

export function getAiProviderAdapter(providerId = 'openai') {
  return ADAPTERS[String(providerId || '').trim()] || ADAPTERS.custom
}
