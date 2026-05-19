import { invokeCommand as invoke } from './tauriBridge.ts'
import { isNativeDesktopRuntime } from './runtimeGuard.ts'

const EMPTY_DOCK_PAGE_CONTRACT = Object.freeze({
  document: { defaultPage: '', pages: [] },
  reference: { defaultPage: '', pages: [] },
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

function normalizeSurfaceContract(value = {}) {
  const pages = (Array.isArray(value?.pages) ? value.pages : [])
    .map(normalizePageDefinition)
    .filter(Boolean)

  return {
    defaultPage: String(value?.defaultPage || '').trim(),
    pages,
  }
}

export function createWorkbenchDockPageContract(value = {}) {
  return {
    document: normalizeSurfaceContract(value.document || EMPTY_DOCK_PAGE_CONTRACT.document),
    reference: normalizeSurfaceContract(value.reference || EMPTY_DOCK_PAGE_CONTRACT.reference),
  }
}

export async function loadWorkbenchDockPageContract() {
  if (!isNativeDesktopRuntime()) return createWorkbenchDockPageContract()
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

export function dockDefaultPageForSurface(contract = {}, surface = '') {
  const definition = contract?.[surface]
  return String(definition?.defaultPage || '').trim()
}
