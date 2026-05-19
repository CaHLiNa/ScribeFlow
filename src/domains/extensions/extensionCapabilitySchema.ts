function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizePath(value = '') {
  return normalizeText(value).replace(/\\/g, '/')
}

function basename(path = '') {
  const normalized = normalizePath(path)
  return normalized.split('/').filter(Boolean).pop() || normalized
}

function extname(path = '') {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

function humanizeToken(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function normalizeExtensions(extensions = []) {
  return Array.isArray(extensions)
    ? extensions
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean)
      .map((value) => value.startsWith('.') ? value : `.${value.replace(/^\.+/, '')}`)
    : []
}

function capabilityValueTypeLabelKey(value = '') {
  switch (normalizeText(value).toLowerCase()) {
    case 'workspacefile':
      return 'Workspace file'
    case 'reference':
      return 'Reference'
    case 'artifact':
      return 'Artifact'
    case 'inlinetext':
      return 'Inline text'
    default:
      return humanizeToken(value)
  }
}

export function humanizeCapabilitySchemaKey(key = '') {
  return humanizeToken((normalizeText(key).split('.').pop()) || '')
}

function evaluateInputCondition(inputType = '', target = {}, extensions = []) {
  const normalizedType = normalizeText(inputType).toLowerCase()
  const targetPath = normalizePath(target?.path)
  const targetReferenceId = normalizeText(target?.referenceId)
  const targetExtension = extname(targetPath)

  if (normalizedType === 'workspacefile') {
    if (!targetPath) {
      return {
        satisfied: false,
        messageKey: 'Requires an active file target',
        messageVars: {},
        detailKey: extensions.length ? 'Requires one of: {extensions}' : '',
        detailVars: extensions.length ? { extensions: extensions.join(', ') } : {},
      }
    }
    if (extensions.length > 0 && !extensions.includes(targetExtension)) {
      return {
        satisfied: false,
        messageKey: 'Requires one of: {extensions}',
        messageVars: { extensions: extensions.join(', ') },
        detailKey: 'Requires one of: {extensions}',
        detailVars: { extensions: extensions.join(', ') },
      }
    }
    return {
      satisfied: true,
      messageKey: '',
      messageVars: {},
      detailKey: extensions.length ? 'Requires one of: {extensions}' : '',
      detailVars: extensions.length ? { extensions: extensions.join(', ') } : {},
    }
  }

  if (normalizedType === 'reference') {
    return {
      satisfied: Boolean(targetReferenceId),
      messageKey: 'Requires a selected reference',
      messageVars: {},
      detailKey: '',
      detailVars: {},
    }
  }

  if (normalizedType === 'artifact') {
    return {
      satisfied: Boolean(targetPath),
      messageKey: 'Requires an active file target',
      messageVars: {},
      detailKey: '',
      detailVars: {},
    }
  }

  return {
    satisfied: Boolean(targetPath || targetReferenceId),
    messageKey: `Requires ${capabilityValueTypeLabelKey(inputType) || humanizeToken(inputType) || 'input'} input`,
    messageVars: {},
    detailKey: '',
    detailVars: {},
  }
}

function inspectInputDefinition(key = '', definition = {}, target = {}) {
  const inputType = normalizeText(definition?.type || definition?.inputType)
  const required = definition?.required === true
  const extensions = normalizeExtensions(definition?.extensions)
  const evaluation = evaluateInputCondition(inputType, target, extensions)

  return {
    key: normalizeText(key),
    label: humanizeCapabilitySchemaKey(key),
    type: inputType,
    typeLabelKey: capabilityValueTypeLabelKey(inputType),
    required,
    ready: evaluation.satisfied,
    blocking: required && !evaluation.satisfied,
    messageKey: evaluation.messageKey,
    messageVars: evaluation.messageVars,
    detailKey: evaluation.detailKey,
    detailVars: evaluation.detailVars,
    extensions,
  }
}

function inspectOutputDefinition(key = '', definition = {}) {
  const outputType = normalizeText(definition?.type || definition?.outputType)
  return {
    key: normalizeText(key),
    label: humanizeCapabilitySchemaKey(key),
    type: outputType,
    typeLabelKey: capabilityValueTypeLabelKey(outputType),
    required: definition?.required === true,
    mediaType: normalizeText(definition?.mediaType || definition?.media_type),
  }
}

export function inspectExtensionCapability(capability = {}, target = {}, options = {}) {
  const workspaceReady = options.workspaceReady ?? true
  const inputs = Object.entries(capability?.inputs || {})
    .map(([key, definition]) => inspectInputDefinition(key, definition, target))
    .filter((entry) => entry.key)
  const outputs = Object.entries(capability?.outputs || {})
    .map(([key, definition]) => inspectOutputDefinition(key, definition))
    .filter((entry) => entry.key)
  const blockingInput = inputs.find((entry) => entry.blocking)

  if (!workspaceReady) {
    return {
      id: normalizeText(capability?.id),
      inputs,
      outputs,
      ready: false,
      messageKey: 'Requires an open workspace',
      messageVars: {},
    }
  }

  if (blockingInput) {
    return {
      id: normalizeText(capability?.id),
      inputs,
      outputs,
      ready: false,
      messageKey: blockingInput.messageKey,
      messageVars: blockingInput.messageVars,
    }
  }

  return {
    id: normalizeText(capability?.id),
    inputs,
    outputs,
    ready: true,
    messageKey: 'Ready for current context',
    messageVars: {},
  }
}
