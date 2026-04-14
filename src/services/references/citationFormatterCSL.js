const cslCache = new Map()
const localeCache = new Map()

async function loadBundledText(path = '') {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load bundled asset: ${path}`)
  }
  return response.text()
}

async function loadWorkspaceStyleXml(styleId = '') {
  const { invoke } = await import('@tauri-apps/api/core')
  const { useWorkspaceStore } = await import('../../stores/workspace.js')
  const workspace = useWorkspaceStore()
  const projectDir = String(workspace.projectDir || '').trim()
  if (!projectDir) return ''

  const path = `${projectDir}/styles/${styleId}.csl`
  const exists = await invoke('path_exists', { path }).catch(() => false)
  if (!exists) return ''
  return invoke('read_file', { path })
}

async function loadStyleXml(styleId = '') {
  if (cslCache.has(styleId)) return cslCache.get(styleId)

  try {
    const bundled = await loadBundledText(`/csl/${styleId}.csl`)
    cslCache.set(styleId, bundled)
    return bundled
  } catch {
    const workspaceStyle = await loadWorkspaceStyleXml(styleId)
    if (workspaceStyle) {
      cslCache.set(styleId, workspaceStyle)
      return workspaceStyle
    }
  }

  throw new Error(`CSL style not found: ${styleId}`)
}

async function loadLocale(locale = 'en-GB') {
  if (localeCache.has(locale)) return localeCache.get(locale)
  const xml = await loadBundledText(`/csl/locales-${locale}.xml`)
  localeCache.set(locale, xml)
  return xml
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&#60;/g, '<')
    .replace(/&#62;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#38;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function buildEngine(styleId = '', cslItems = [], locale = 'en-GB') {
  const styleXml = await loadStyleXml(styleId)
  const localeXml = await loadLocale(locale)
  const citeprocModule = await import('citeproc')
  const CSL = citeprocModule.default || citeprocModule

  const itemLookup = {}
  for (const item of cslItems) {
    const id = String(item._key || item.id || `item-${crypto.randomUUID()}`).trim()
    itemLookup[id] = { ...item, id }
  }

  const sys = {
    retrieveLocale: () => localeXml,
    retrieveItem: (id) => itemLookup[id] || null,
  }

  const engine = new CSL.Engine(sys, styleXml, locale)
  engine.updateItems(Object.keys(itemLookup))
  return { engine, itemLookup }
}

export async function formatWithCSL(styleId = '', mode = 'reference', cslItems = [], number, locale = 'en-GB') {
  if (!Array.isArray(cslItems) || cslItems.length === 0) return ''

  try {
    const { engine, itemLookup } = await buildEngine(styleId, cslItems, locale)
    const ids = Object.keys(itemLookup)

    if (mode === 'bibliography') {
      const bibliography = engine.makeBibliography()
      if (!bibliography?.[1]) return ''
      return bibliography[1].map((entry) => stripHtml(entry)).filter(Boolean).join('\n\n')
    }

    if (mode === 'inline') {
      if (typeof number === 'number' && number > 0 && engine.opt?.mode === 'citation') {
        engine.setCitationId(number)
      }
      return stripHtml(engine.makeCitationCluster(ids.map((id) => ({ id }))))
    }

    const bibliography = engine.makeBibliography()
    if (!bibliography?.[1]?.[0]) return ''
    return stripHtml(bibliography[1][0])
  } catch (error) {
    console.warn(`[references] CSL formatting failed for style "${styleId}"`, error)
    return ''
  }
}

