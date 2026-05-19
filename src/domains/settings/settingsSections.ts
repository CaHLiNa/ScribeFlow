export const SETTINGS_SECTION_GENERAL = 'general'
export const SETTINGS_SECTION_ALIASES = {
  environment: 'system',
}

export const SETTINGS_SECTION_DEFINITIONS = [
  {
    id: SETTINGS_SECTION_GENERAL,
    labelKey: 'General',
    descriptionKey: 'Everyday app preferences, fonts, theme, and editor sizing.',
    iconKey: 'adjustments',
    componentKey: 'general',
  },
  {
    id: 'editor',
    labelKey: 'Writing',
    descriptionKey: 'Writing defaults, editor behavior, and drafting tools.',
    iconKey: 'edit',
    componentKey: 'editor',
  },
  {
    id: 'zotero',
    labelKey: 'References',
    descriptionKey: 'Reference sync, citations, and Zotero connection.',
    iconKey: 'books',
    componentKey: 'zotero',
  },
  {
    id: 'system',
    labelKey: 'Environment',
    descriptionKey: 'LaTeX compilers, engines, downloads, and diagnostics.',
    iconKey: 'cpu',
    componentKey: 'system',
  },
  {
    id: 'updates',
    labelKey: 'About',
    descriptionKey: 'Application version, release notes, and downloads.',
    iconKey: 'refresh',
    componentKey: 'updates',
  },
]

export function normalizeSettingsSectionId(sectionId = '') {
  const normalized = String(sectionId || '').trim()
  if (!normalized) return SETTINGS_SECTION_GENERAL
  return SETTINGS_SECTION_ALIASES[normalized] || normalized
}

export function resolveSettingsSectionId(sectionId = '', definitions = SETTINGS_SECTION_DEFINITIONS) {
  const normalized = normalizeSettingsSectionId(sectionId)
  return definitions.some((item) => item?.id === normalized)
    ? normalized
    : SETTINGS_SECTION_GENERAL
}

export function buildSettingsSectionItems({
  definitions = SETTINGS_SECTION_DEFINITIONS,
  translate = (key) => key,
  iconRegistry = {},
} = {}) {
  return definitions.map((item) => ({
    ...item,
    icon: iconRegistry[item.iconKey] || null,
    label: translate(item.labelKey),
    description: translate(item.descriptionKey),
  }))
}

export function resolveSettingsSectionMeta({
  sectionId = '',
  definitions = SETTINGS_SECTION_DEFINITIONS,
  translate = (key) => key,
  iconRegistry = {},
} = {}) {
  const items = buildSettingsSectionItems({
    definitions,
    translate,
    iconRegistry,
  })
  const activeSection = resolveSettingsSectionId(sectionId, definitions)
  return {
    activeSection,
    activeSectionMeta: items.find((item) => item.id === activeSection) || items[0] || null,
    sections: items,
  }
}
