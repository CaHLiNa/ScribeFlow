import { shortExtensionSettingKey } from './extensionSettingPresentation'

const EXTENSION_SETTING_GROUP_DEFINITIONS = [
  {
    id: 'basic',
    titleKey: 'Basic',
    hintKey: 'Host-managed plugin defaults.',
    keys: ['engine', 'service', 'sourceLang', 'targetLang'],
    match: (key) => ['engine', 'service', 'sourceLang', 'targetLang', 'targetLanguage'].includes(shortExtensionSettingKey(key)),
  },
  {
    id: 'model',
    titleKey: 'Model Access',
    hintKey: 'Host-managed model, endpoint, and secure credential values.',
    keys: [
      'modelBaseUrl',
      'apiUrl',
      'baseUrl',
      'endpoint',
      'modelApiKey',
      'apiKey',
      'model',
      'modelName',
      'mineruToken',
      'mineru',
      'paddleToken',
      'paddleOcrToken',
      'paddleocrToken',
      'paddleOcr',
      'paddleocr',
    ],
    match: (key) => {
      const normalized = shortExtensionSettingKey(key).toLowerCase()
      return normalized.includes('api') ||
        normalized.includes('model') ||
        normalized.includes('extension') ||
        normalized.includes('token') ||
        normalized.includes('secret')
    },
  },
  {
    id: 'output',
    titleKey: 'Output',
    hintKey: 'Generated PDF type and layout behavior.',
    keys: ['outputMode', 'translationMode', 'dualMode', 'noWatermark', 'ocr', 'autoOcr'],
    match: (key) => ['outputMode', 'translationMode', 'dualMode', 'noWatermark', 'ocr', 'autoOcr'].includes(shortExtensionSettingKey(key)),
  },
  {
    id: 'runtime',
    titleKey: 'Runtime',
    hintKey: 'Plugin runtime environment and local execution options.',
    keys: ['serverPort', 'pythonPath', 'enableVenv', 'envTool', 'enableMirror', 'skipInstall'],
    match: (key) => {
      const normalized = shortExtensionSettingKey(key).toLowerCase()
      return normalized.includes('server') ||
        normalized.includes('python') ||
        normalized.includes('venv') ||
        normalized.includes('env') ||
        normalized.includes('mirror') ||
        normalized.includes('install') ||
        normalized.includes('port')
    },
  },
  {
    id: 'performance',
    titleKey: 'Performance',
    hintKey: 'Plugin execution throughput controls.',
    keys: ['qps', 'poolSize', 'threadNum'],
    match: (key) => ['qps', 'poolSize', 'threadNum', 'chunkSize'].includes(shortExtensionSettingKey(key)),
  },
]

export function extensionSettingEntries(extension = {}) {
  return Object.entries(extension.settingsSchema || {})
}

export function extensionSettingsActions(extension = {}) {
  return Array.isArray(extension.settingsActions) ? extension.settingsActions : []
}

function settingSortAliases(key = '') {
  const shortKey = shortExtensionSettingKey(key)
  const normalized = shortKey.toLowerCase()
  const aliases = [String(key || ''), shortKey]
  if (normalized.includes('baseurl') || normalized.includes('apiurl') || normalized.includes('endpoint')) {
    aliases.push('modelBaseUrl')
  }
  if ((normalized.includes('apikey') || normalized.includes('api_key')) &&
    !normalized.includes('mineru') &&
    !normalized.includes('paddle')) {
    aliases.push('apiKey')
  }
  if (normalized === 'model' || normalized.includes('modelname')) aliases.push('model')
  if (normalized.includes('mineru')) aliases.push('mineru')
  if (normalized.includes('paddleocr') || normalized.includes('paddle')) aliases.push('paddleocr')
  return aliases
}

export function sortExtensionSettingEntries(entries = [], orderedKeys = []) {
  const order = new Map(orderedKeys.map((key, index) => [key, index]))
  const sourceOrder = new Map(entries.map(([key], index) => [key, index]))
  const orderFor = (key = '') => {
    for (const alias of settingSortAliases(key)) {
      if (order.has(alias)) return order.get(alias)
    }
    return Number.MAX_SAFE_INTEGER
  }
  return [...entries].sort(([left], [right]) => {
    const normalizedLeftOrder = orderFor(left)
    const normalizedRightOrder = orderFor(right)
    if (normalizedLeftOrder !== normalizedRightOrder) return normalizedLeftOrder - normalizedRightOrder
    return (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0)
  })
}

export function buildExtensionSettingGroups(extension = {}) {
  const remaining = new Map(extensionSettingEntries(extension))
  const groups = []
  for (const definition of EXTENSION_SETTING_GROUP_DEFINITIONS) {
    const entries = []
    for (const [key, setting] of [...remaining.entries()]) {
      if (definition.match(key, setting)) {
        entries.push([key, setting])
        remaining.delete(key)
      }
    }
    if (entries.length) {
      groups.push({
        ...definition,
        entries: sortExtensionSettingEntries(entries, definition.keys),
      })
    }
  }
  if (remaining.size) {
    groups.push({
      id: 'advanced',
      titleKey: 'Advanced',
      hintKey: 'Less common plugin-specific options.',
      entries: sortExtensionSettingEntries([...remaining.entries()]),
    })
  }
  return groups
}

export function buildExtensionSettingsActionGroups(extension = {}) {
  const groups = new Map()
  for (const action of extensionSettingsActions(extension)) {
    const groupId = String(action.group || 'actions').trim() || 'actions'
    const groupTitle = String(action.groupTitle || action.group || 'Actions').trim() || 'Actions'
    if (!groups.has(groupId)) {
      groups.set(groupId, { id: groupId, title: groupTitle, actions: [] })
    }
    groups.get(groupId).actions.push(action)
  }
  return [...groups.values()]
}

export function humanizeExtensionSettingKey(key = '') {
  return (String(key || '')
    .split('.')
    .pop() || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}
