import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const DEFAULT_LOCALE = 'en-US'

const locale = ref(DEFAULT_LOCALE)
const translationMessages = ref({})
const messageKeyAliases = ref({})

export { locale }

export const isZh = computed(() => locale.value === 'zh-CN')

function normalizeLocale(value = '') {
  return String(value).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function detectBrowserLocale() {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const preferred =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages.find(Boolean)
      : navigator.language
  return normalizeLocale(preferred || DEFAULT_LOCALE)
}

function interpolate(message, vars = {}) {
  return String(message).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? '' : String(vars[key])
  )
}

export function resolveMessageKey(key) {
  const normalizedKey = String(key)
  return messageKeyAliases.value[normalizedKey] || normalizedKey
}

export function t(key, vars) {
  const resolvedKey = resolveMessageKey(key)
  const message =
    locale.value === 'zh-CN' ? (translationMessages.value[resolvedKey] ?? resolvedKey) : resolvedKey
  return interpolate(message, vars)
}

export function useI18n() {
  return { locale, isZh, t }
}

async function loadRuntimeBundle() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    return {
      locale: detectBrowserLocale(),
      messages: {},
      aliases: {},
    }
  }

  try {
    const payload = await invoke('i18n_runtime_load')
    return {
      locale: normalizeLocale(payload?.locale || DEFAULT_LOCALE),
      messages:
        payload?.locale === 'zh-CN' && payload?.messages && typeof payload.messages === 'object'
          ? payload.messages
          : {},
      aliases: payload?.aliases && typeof payload.aliases === 'object' ? payload.aliases : {},
    }
  } catch {
    return {
      locale: detectBrowserLocale(),
      messages: {},
      aliases: {},
    }
  }
}

export async function initLocale() {
  const payload = await loadRuntimeBundle()
  locale.value = payload.locale
  translationMessages.value = payload.messages
  messageKeyAliases.value = payload.aliases

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale.value
  }
}

export function formatDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(locale.value, options).format(date)
}

export function formatMonthYear(year, month) {
  return formatDate(new Date(year, month - 1, 1), { month: 'long', year: 'numeric' })
}

export function formatRelativeFromNow(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return t('just now')
  if (seconds < 3600) return t('{count}m ago', { count: Math.floor(seconds / 60) })
  if (seconds < 86400) return t('{count}h ago', { count: Math.floor(seconds / 3600) })
  if (seconds < 604800) return t('{count}d ago', { count: Math.floor(seconds / 86400) })
  if (seconds < 2592000) return t('{count}w ago', { count: Math.floor(seconds / 604800) })
  return t('{count}mo ago', { count: Math.floor(seconds / 2592000) })
}
