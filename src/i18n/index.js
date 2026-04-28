import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const DEFAULT_LOCALE = 'en-US'
const DEFAULT_LOCALE_PREFERENCE = 'system'

const locale = ref(DEFAULT_LOCALE)
const translationMessages = ref({})
const messageKeyAliases = ref({})

export { locale }

export const isZh = computed(() => locale.value === 'zh-CN')

function normalizeLocale(value = '') {
  return String(value).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function normalizeLocalePreference(value = '') {
  switch (String(value || '').trim().toLowerCase()) {
    case 'zh':
    case 'zh-cn':
      return 'zh-CN'
    case 'en':
    case 'en-us':
      return 'en-US'
    default:
      return DEFAULT_LOCALE_PREFERENCE
  }
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
  try {
    const preferredLocale = await loadSavedLocalePreference()
    const payload = await invoke('i18n_runtime_load', {
      params: {
        preferredLocale,
      },
    })
    return {
      locale: normalizeLocale(payload?.locale || DEFAULT_LOCALE),
      systemLocale: normalizeLocale(payload?.systemLocale || payload?.locale || DEFAULT_LOCALE),
      messages:
        payload?.locale === 'zh-CN' && payload?.messages && typeof payload.messages === 'object'
          ? payload.messages
          : {},
      aliases: payload?.aliases && typeof payload.aliases === 'object' ? payload.aliases : {},
    }
  } catch {
    return {
      locale: DEFAULT_LOCALE,
      systemLocale: DEFAULT_LOCALE,
      messages: {},
      aliases: {},
    }
  }
}

async function loadSavedLocalePreference() {
  try {
    const globalConfigDir = await invoke('get_global_config_dir')
    const preferences = await invoke('workspace_preferences_load', {
      params: {
        globalConfigDir: String(globalConfigDir || ''),
        legacyPreferences: {},
      },
    })
    return normalizeLocalePreference(preferences?.preferredLocale || DEFAULT_LOCALE_PREFERENCE)
  } catch {
    return DEFAULT_LOCALE_PREFERENCE
  }
}

function applyLocaleState(nextLocale, messages = {}, aliases = {}) {
  locale.value = normalizeLocale(nextLocale || DEFAULT_LOCALE)
  translationMessages.value = messages
  messageKeyAliases.value = aliases

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale.value
  }
}

export async function initLocale() {
  const payload = await loadRuntimeBundle()
  applyLocaleState(payload.locale, payload.messages, payload.aliases)
}

export async function applyLocalePreference(preferredLocale = DEFAULT_LOCALE_PREFERENCE) {
  const normalizedPreference = normalizeLocalePreference(preferredLocale)

  const payload = await invoke('i18n_runtime_load', {
    params: {
      preferredLocale: normalizedPreference,
    },
  })
  applyLocaleState(payload?.locale, payload?.messages, payload?.aliases)
  return locale.value
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
