import {
  IconAdjustmentsHorizontal,
  IconBooks,
  IconCpu,
  IconEdit,
  IconRefresh,
} from '@tabler/icons-vue'

export const SETTINGS_SECTION_DEFINITIONS = [
  {
    id: 'general',
    labelKey: 'General',
    descriptionKey: 'Everyday app preferences, fonts, theme, and editor sizing.',
    icon: IconAdjustmentsHorizontal,
  },
  {
    id: 'editor',
    labelKey: 'Writing',
    descriptionKey: 'Writing defaults, editor behavior, and drafting tools.',
    icon: IconEdit,
  },
  {
    id: 'zotero',
    labelKey: 'References',
    descriptionKey: 'Reference sync, citations, and Zotero connection.',
    icon: IconBooks,
  },
  {
    id: 'system',
    labelKey: 'Environment',
    descriptionKey: 'LaTeX compilers, engines, downloads, and diagnostics.',
    icon: IconCpu,
  },
  {
    id: 'updates',
    labelKey: 'About',
    descriptionKey: 'Application version, release notes, and downloads.',
    icon: IconRefresh,
  },
]

export function normalizeSettingsSectionId(sectionId = '') {
  const normalized = String(sectionId || '').trim()
  return normalized || 'general'
}
