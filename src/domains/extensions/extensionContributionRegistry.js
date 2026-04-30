function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeExtensionId(value = '') {
  return normalizeId(value).toLowerCase()
}

function normalizeSettingDefinition(key = '', definition = {}) {
  const settingKey = normalizeId(key)
  const label = settingKey.split('.').pop() || settingKey
  return {
    key: settingKey,
    type: normalizeId(definition?.type),
    default: Object.prototype.hasOwnProperty.call(definition || {}, 'default')
      ? definition.default
      : '',
    label,
    description: normalizeId(definition?.description),
    options: Array.isArray(definition?.enum)
      ? definition.enum.map((value, index) => ({
          value,
          label: Array.isArray(definition?.enumItemLabels)
            ? normalizeId(definition.enumItemLabels[index] || value)
            : normalizeId(value),
        }))
      : [],
  }
}

function normalizeCommands(extensionId = '', manifest = {}) {
  const commands = Array.isArray(manifest?.contributes?.commands)
    ? manifest.contributes.commands
    : []
  return commands
    .map((command) => {
      const commandId = normalizeId(command?.command)
      return {
        id: commandId,
        commandId,
        extensionId,
        title: normalizeId(command?.title || commandId),
        category: normalizeId(command?.category),
      }
    })
    .filter((command) => command.commandId)
}

function normalizeMenus(extensionId = '', manifest = {}, commandById = new Map()) {
  const menus = manifest?.contributes?.menus && typeof manifest.contributes.menus === 'object'
    ? manifest.contributes.menus
    : {}
  return Object.entries(menus)
    .flatMap(([surface, entries]) =>
      (Array.isArray(entries) ? entries : []).map((entry) => {
        const commandId = normalizeId(entry?.command)
        const command = commandById.get(commandId)
        return {
          id: `${extensionId}:${surface}:${commandId}`,
          extensionId,
          surface: normalizeId(surface),
          commandId,
          title: command?.title || commandId,
          category: command?.category || '',
          when: normalizeId(entry?.when),
        }
      })
    )
    .filter((entry) => entry.surface && entry.commandId && commandById.has(entry.commandId))
}

function normalizeKeybindings(extensionId = '', manifest = {}, commandById = new Map()) {
  const keybindings = Array.isArray(manifest?.contributes?.keybindings)
    ? manifest.contributes.keybindings
    : []
  return keybindings
    .map((entry) => {
      const commandId = normalizeId(entry?.command)
      const command = commandById.get(commandId)
      return {
        id: `${extensionId}:keybinding:${commandId}:${normalizeId(entry?.key || entry?.mac || entry?.win || entry?.linux)}`,
        extensionId,
        commandId,
        title: command?.title || commandId,
        category: command?.category || '',
        key: normalizeId(entry?.key),
        mac: normalizeId(entry?.mac),
        win: normalizeId(entry?.win),
        linux: normalizeId(entry?.linux),
        when: normalizeId(entry?.when),
      }
    })
    .filter((entry) =>
      entry.commandId &&
      commandById.has(entry.commandId) &&
      (entry.key || entry.mac || entry.win || entry.linux)
    )
}

function normalizeConfiguration(manifest = {}) {
  const properties = manifest?.contributes?.configuration?.properties &&
    typeof manifest.contributes.configuration.properties === 'object'
    ? manifest.contributes.configuration.properties
    : {}
  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, definition]) => [normalizeId(key), normalizeSettingDefinition(key, definition)])
      .filter(([key]) => key)
  )
}

function normalizeCapabilities(manifest = {}) {
  const capabilities = Array.isArray(manifest?.contributes?.capabilities)
    ? manifest.contributes.capabilities
    : []
  return capabilities
    .map((capability) => ({
      id: normalizeId(capability?.id),
      inputs: capability?.inputs && typeof capability.inputs === 'object' ? capability.inputs : {},
      outputs: capability?.outputs && typeof capability.outputs === 'object' ? capability.outputs : {},
    }))
    .filter((capability) => capability.id)
}

export function normalizeExtensionContributions(extension = {}) {
  const extensionId = normalizeExtensionId(extension.id)
  const manifest = extension?.manifest && typeof extension.manifest === 'object' ? extension.manifest : {}
  const commands = normalizeCommands(extensionId, manifest)
  const commandById = new Map(commands.map((command) => [command.commandId, command]))
  const menus = normalizeMenus(extensionId, manifest, commandById)
  const keybindings = normalizeKeybindings(extensionId, manifest, commandById)
  return {
    commands,
    commandById,
    menus,
    keybindings,
    configuration: normalizeConfiguration(manifest),
    capabilities: normalizeCapabilities(manifest),
  }
}

function valueForPath(source = {}, path = '') {
  return normalizeId(path)
    .split('.')
    .filter(Boolean)
    .reduce((value, segment) => {
      if (!value || typeof value !== 'object') return undefined
      return value[segment]
    }, source)
}

function stripQuotes(value = '') {
  const raw = normalizeId(value)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

function evaluateClause(clause = '', context = {}) {
  const normalized = normalizeId(clause)
  if (!normalized) return true
  if (normalized.includes('!=')) {
    const [left, right] = normalized.split('!=')
    return String(valueForPath(context, left) ?? '') !== stripQuotes(right)
  }
  if (normalized.includes('==')) {
    const [left, right] = normalized.split('==')
    return String(valueForPath(context, left) ?? '') === stripQuotes(right)
  }
  if (normalized.startsWith('!')) {
    return !Boolean(valueForPath(context, normalized.slice(1)))
  }
  return Boolean(valueForPath(context, normalized))
}

export function matchesWhenClause(when = '', context = {}) {
  const normalized = normalizeId(when)
  if (!normalized) return true
  return normalized
    .split('&&')
    .map((clause) => clause.trim())
    .every((clause) => evaluateClause(clause, context))
}

export function buildSurfaceContext(target = {}, extra = {}) {
  const kind = normalizeId(target?.kind)
  const path = normalizeId(target?.path)
  const resourceKind = kind.toLowerCase().includes('pdf') || path.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : kind
  return {
    ...extra,
    resource: {
      kind: resourceKind,
      path,
      targetKind: kind,
      referenceId: normalizeId(target?.referenceId),
      ...(extra?.resource && typeof extra.resource === 'object' ? extra.resource : {}),
    },
  }
}
