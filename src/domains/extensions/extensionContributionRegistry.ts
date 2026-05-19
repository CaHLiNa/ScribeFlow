import { buildExtensionContext } from './extensionContext.ts'

// Transitional layer:
// static manifest contributions are still normalized here for bootstrap UI wiring,
// but the platform direction is runtime-registration-first rather than contribution-first.

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeExtensionId(value = '') {
  return normalizeId(value).toLowerCase()
}

function normalizeSettingDefinition(key = '', definition = {}) {
  const settingKey = normalizeId(key)
  const label = normalizeId(definition?.title) || settingKey.split('.').pop() || settingKey
  return {
    key: settingKey,
    type: normalizeId(definition?.type),
    default: Object.prototype.hasOwnProperty.call(definition || {}, 'default')
      ? definition.default
      : '',
    label,
    description: normalizeId(definition?.description),
    secureStorage: definition?.secureStorage === true,
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

function normalizeViewContainers(extensionId = '', manifest = {}) {
  const containers = Array.isArray(manifest?.contributes?.viewsContainers?.activitybar)
    ? manifest.contributes.viewsContainers.activitybar
    : []
  return containers
    .map((container) => {
      const id = normalizeId(container?.id)
      return {
        id,
        extensionId,
        panelId: id ? `extension:${id}` : '',
        title: normalizeId(container?.title || id),
        icon: normalizeId(container?.icon),
      }
    })
    .filter((container) => container.id && container.panelId)
}

function normalizeViews(extensionId = '', manifest = {}, viewContainerById = new Map()) {
  const views = manifest?.contributes?.views && typeof manifest.contributes.views === 'object'
    ? manifest.contributes.views
    : {}
  return Object.entries(views)
    .flatMap(([containerId, entries]) =>
      (Array.isArray(entries) ? entries : []).map((entry) => {
        const normalizedContainerId = normalizeId(containerId)
        const container = viewContainerById.get(normalizedContainerId)
        const id = normalizeId(entry?.id)
        return {
          id,
          extensionId,
          containerId: normalizedContainerId,
          panelId: container?.panelId || '',
          title: normalizeId(entry?.name || entry?.contextualTitle || id),
          contextualTitle: normalizeId(entry?.contextualTitle),
          presentation: normalizeId(entry?.presentation),
          when: normalizeId(entry?.when),
        }
      })
    )
    .filter((view) => view.id && view.containerId && view.panelId && viewContainerById.has(view.containerId))
}

function normalizeViewTitleMenus(extensionId = '', manifest = {}, commandById = new Map()) {
  const entries = Array.isArray(manifest?.contributes?.menus?.['view/title'])
    ? manifest.contributes.menus['view/title']
    : []
  return entries
    .map((entry) => {
      const commandId = normalizeId(entry?.command)
      const command = commandById.get(commandId)
      return {
        id: `${extensionId}:view/title:${commandId}`,
        extensionId,
        surface: 'view/title',
        commandId,
        title: command?.title || commandId,
        category: command?.category || '',
        when: normalizeId(entry?.when),
      }
    })
    .filter((entry) => entry.commandId && commandById.has(entry.commandId))
}

function normalizeViewItemMenus(extensionId = '', manifest = {}, commandById = new Map()) {
  const entries = Array.isArray(manifest?.contributes?.menus?.['view/item/context'])
    ? manifest.contributes.menus['view/item/context']
    : []
  return entries
    .map((entry) => {
      const commandId = normalizeId(entry?.command)
      const command = commandById.get(commandId)
      return {
        id: `${extensionId}:view/item/context:${commandId}`,
        extensionId,
        surface: 'view/item/context',
        commandId,
        title: command?.title || commandId,
        category: command?.category || '',
        when: normalizeId(entry?.when),
      }
    })
    .filter((entry) => entry.commandId && commandById.has(entry.commandId))
}

function normalizeConfiguration(manifest = {}) {
  const actions = Array.isArray(manifest?.contributes?.configuration?.actions)
    ? manifest.contributes.configuration.actions
      .map((action) => ({
        id: normalizeId(action?.id),
        title: normalizeId(action?.title),
        description: normalizeId(action?.description),
        commandId: normalizeId(action?.command),
        group: normalizeId(action?.group),
        groupTitle: normalizeId(action?.groupTitle),
      }))
      .filter((action) => action.id && action.commandId)
    : []
  const properties = manifest?.contributes?.configuration?.properties &&
    typeof manifest.contributes.configuration.properties === 'object'
    ? manifest.contributes.configuration.properties
    : {}
  return {
    title: normalizeId(manifest?.contributes?.configuration?.title),
    properties: Object.fromEntries(
      Object.entries(properties)
        .map(([key, definition]) => [normalizeId(key), normalizeSettingDefinition(key, definition)])
        .filter(([key]) => key)
    ),
    actions,
  }
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
  const viewContainers = normalizeViewContainers(extensionId, manifest)
  const viewContainerById = new Map(viewContainers.map((container) => [container.id, container]))
  const views = normalizeViews(extensionId, manifest, viewContainerById)
  const viewTitleMenus = normalizeViewTitleMenus(extensionId, manifest, commandById)
  const viewItemMenus = normalizeViewItemMenus(extensionId, manifest, commandById)
  return {
    commands,
    commandById,
    menus,
    keybindings,
    viewContainers,
    views,
    viewTitleMenus,
    viewItemMenus,
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
    .split('||')
    .map((group) => group.trim())
    .some((group) =>
      group
        .split('&&')
        .map((clause) => clause.trim())
        .every((clause) => evaluateClause(clause, context))
    )
}

export function buildSurfaceContext(target = {}, extra = {}) {
  return buildExtensionContext(target, extra)
}
