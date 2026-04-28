import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { normalizeCitationStyle } from './citationStyleRegistry.js'

async function resolveCitationWorkspacePath() {
  try {
    const workspace = useWorkspaceStore()
    return String(workspace.projectDir || workspace.path || '').trim()
  } catch {
    return ''
  }
}

export async function renderCitationFromReference(style = 'apa', mode = 'reference', reference = {}, number) {
  const effectiveStyle = normalizeCitationStyle(style)
  return invoke('references_citation_render', {
    params: {
      style: effectiveStyle,
      mode,
      reference,
      references: mode === 'bibliography' ? [reference] : [],
      cslItems: [],
      number,
      locale: 'en-GB',
      workspacePath: await resolveCitationWorkspacePath(),
    },
  })
}

export async function renderCitationFromCsl(
  style = 'apa',
  mode = 'reference',
  cslItems = [],
  number,
  locale = 'en-GB',
) {
  const effectiveStyle = normalizeCitationStyle(style)
  return invoke('references_citation_render', {
    params: {
      style: effectiveStyle,
      mode,
      reference: null,
      references: [],
      cslItems,
      number,
      locale,
      workspacePath: await resolveCitationWorkspacePath(),
    },
  })
}

export async function renderBibliography(style = 'apa', references = []) {
  const effectiveStyle = normalizeCitationStyle(style)
  return invoke('references_citation_render', {
    params: {
      style: effectiveStyle,
      mode: 'bibliography',
      reference: null,
      references,
      cslItems: [],
      number: null,
      locale: 'en-GB',
      workspacePath: await resolveCitationWorkspacePath(),
    },
  })
}
