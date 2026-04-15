import { IconBooks, IconCpu, IconEdit, IconPalette, IconRefresh, IconSparkles } from '@tabler/icons-vue'

export const SETTINGS_SECTION_DEFINITIONS = [
  {
    id: 'theme',
    labelKey: 'Appearance',
    descriptionKey: 'Themes, reading surfaces, and PDF viewing.',
    icon: IconPalette,
  },
  {
    id: 'editor',
    labelKey: 'Writing',
    descriptionKey: 'Writing defaults, editor behavior, and drafting tools.',
    icon: IconEdit,
  },
  {
    id: 'ai',
    labelKey: 'AI',
    descriptionKey: 'Grounded AI provider settings, model execution, and workbench behavior.',
    icon: IconSparkles,
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
