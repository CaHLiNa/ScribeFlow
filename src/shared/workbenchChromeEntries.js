import {
  IconBook2,
  IconFileDescription,
  IconFolder,
  IconLayoutList,
  IconListTree,
  IconLink,
  IconMessages,
  IconTag,
} from '@tabler/icons-vue'
import { normalizeWorkbenchSurface } from './workbenchSidebarPanels.js'

const SIDEBAR_ENTRY_DEFINITIONS = {
  workspace: [
    {
      key: 'files',
      labelKey: 'Project files',
      titleKey: 'Project files',
      icon: IconFolder,
    },
    {
      key: 'references',
      labelKey: 'References',
      titleKey: 'References',
      icon: IconBook2,
    },
  ],
  library: [
    {
      key: 'library-views',
      labelKey: 'Library views',
      titleKey: 'Library views',
      icon: IconLayoutList,
    },
    {
      key: 'library-tags',
      labelKey: 'Library tags',
      titleKey: 'Library tags',
      icon: IconTag,
    },
  ],
  ai: [
    {
      key: 'ai-chats',
      labelKey: 'Recent chats',
      titleKey: 'Recent chats',
      icon: IconMessages,
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
      key: 'backlinks',
      labelKey: 'Backlinks',
      titleKey: 'Backlinks',
      icon: IconLink,
    },
  ],
  library: [
    {
      key: 'library-details',
      labelKey: 'Details',
      titleKey: 'Details',
      icon: IconFileDescription,
    },
  ],
  ai: [],
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
