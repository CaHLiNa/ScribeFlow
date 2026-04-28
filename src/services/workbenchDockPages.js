import { invoke } from '@tauri-apps/api/core'

const FALLBACK_DOCK_PAGE_CONTRACT = Object.freeze({
  document: {
    defaultPage: 'preview',
    pages: [
      { id: 'preview', permanent: true, dynamic: false, closeable: true, fallbackPage: 'file' },
      { id: 'problems', permanent: true, dynamic: false, closeable: false, fallbackPage: 'preview' },
      { id: 'file', permanent: false, dynamic: true, closeable: true, fallbackPage: 'preview' },
    ],
  },
  reference: {
    defaultPage: 'details',
    pages: [
      { id: 'details', permanent: true, dynamic: false, closeable: false, fallbackPage: 'details' },
      { id: 'cited-in', permanent: true, dynamic: false, closeable: false, fallbackPage: 'details' },
      { id: 'pdf', permanent: false, dynamic: true, closeable: true, fallbackPage: 'details' },
    ],
  },
})

function normalizePageDefinition(page = {}) {
  const id = String(page?.id || '').trim()
  if (!id) return null

  return {
    id,
    permanent: page.permanent === true,
    dynamic: page.dynamic === true,
    closeable: page.closeable === true,
    fallbackPage: String(page.fallbackPage || '').trim(),
  }
}

function normalizeSurfaceContract(value = {}, fallback = {}) {
  const fallbackPages = Array.isArray(fallback.pages) ? fallback.pages : []
  const pages = (Array.isArray(value?.pages) ? value.pages : fallbackPages)
    .map(normalizePageDefinition)
    .filter(Boolean)
  const fallbackDefault = String(fallback.defaultPage || fallbackPages[0]?.id || '').trim()
  const requestedDefault = String(value?.defaultPage || '').trim()
  const defaultPage = pages.some((page) => page.id === requestedDefault)
    ? requestedDefault
    : fallbackDefault
  const pageIds = new Set(pages.map((page) => page.id))

  return {
    defaultPage,
    pages: pages.map((page) => ({
      ...page,
      fallbackPage: pageIds.has(page.fallbackPage) ? page.fallbackPage : defaultPage,
    })),
  }
}

export function createWorkbenchDockPageContract(value = {}) {
  return {
    document: normalizeSurfaceContract(value.document, FALLBACK_DOCK_PAGE_CONTRACT.document),
    reference: normalizeSurfaceContract(value.reference, FALLBACK_DOCK_PAGE_CONTRACT.reference),
  }
}

export async function loadWorkbenchDockPageContract() {
  const contract = await invoke('workbench_dock_page_contract_load')
  return createWorkbenchDockPageContract(contract)
}

export function dockPageIdsForSurface(contract = {}, surface = '') {
  const pages = contract?.[surface]?.pages
  return Array.isArray(pages) ? pages.map((page) => page.id).filter(Boolean) : []
}

export function dockPageDefinitionsForSurface(contract = {}, surface = '') {
  const pages = contract?.[surface]?.pages
  return Array.isArray(pages) ? pages.filter((page) => page?.id) : []
}
