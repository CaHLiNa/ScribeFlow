import { IconBooks, IconCpu, IconEdit, IconPalette, IconRefresh } from '@tabler/icons-vue'

export const SETTINGS_SECTION_DEFINITIONS = [
  {
    id: 'theme',
    labelKey: 'Theme',
    descriptionKey: 'Appearance, reading surfaces, and PDF rendering.',
    icon: IconPalette,
  },
  {
    id: 'editor',
    labelKey: 'Editor',
    descriptionKey: 'Writing defaults, wrapping, and language tooling.',
    icon: IconEdit,
  },
  {
    id: 'system',
    labelKey: 'System',
    descriptionKey: 'LaTeX compilers, downloads, and system checks.',
    icon: IconCpu,
  },
  {
    id: 'updates',
    labelKey: 'Updates',
    descriptionKey: 'Application version and release channel information.',
    icon: IconRefresh,
  },
  {
    id: 'zotero',
    labelKey: 'Zotero',
    descriptionKey: 'Reference sync, remote libraries, and citation import.',
    icon: IconBooks,
  },
]
