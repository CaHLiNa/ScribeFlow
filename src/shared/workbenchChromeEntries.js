import { IconFolder, IconListTree, IconSparkles } from '@tabler/icons-vue'
import { normalizeWorkbenchSurface } from './workbenchSidebarPanels.js'

const SIDEBAR_ENTRY_DEFINITIONS = {
  workspace: [
    {
      key: 'files',
      labelKey: 'Project files',
      titleKey: 'Project files',
      icon: IconFolder,
    },
  ],
  settings: [
    {
      key: 'files',
      labelKey: 'Project files',
      titleKey: 'Project files',
      icon: IconFolder,
    },
  ],
}

const INSPECTOR_ENTRY_DEFINITIONS = {
  workspace: [
    {
      key: 'outline',
      labelKey: 'Outline',
      titleKey: 'Outline',
      icon: IconListTree,
    },
    {
      key: 'ai',
      labelKey: 'AI workflow',
      titleKey: 'AI workflow',
      icon: IconSparkles,
    },
  ],
  settings: [],
}

function localizeEntries(entries, t) {
  return entries.map((entry) => ({
    key: entry.key,
    label: t(entry.labelKey),
    title: t(entry.titleKey),
    icon: entry.icon,
  }))
}

export function getWorkbenchSidebarChromeEntries(t, surface = 'workspace') {
  const normalizedSurface = normalizeWorkbenchSurface(surface)
  return localizeEntries(
    SIDEBAR_ENTRY_DEFINITIONS[normalizedSurface] || SIDEBAR_ENTRY_DEFINITIONS.workspace,
    t
  )
}

export function getWorkbenchInspectorChromeEntries(t, surface = 'workspace') {
  const normalizedSurface = normalizeWorkbenchSurface(surface)
  return localizeEntries(
    INSPECTOR_ENTRY_DEFINITIONS[normalizedSurface] || INSPECTOR_ENTRY_DEFINITIONS.workspace,
    t
  )
}
