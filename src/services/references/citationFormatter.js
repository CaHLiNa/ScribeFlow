import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { normalizeCitationStyle } from './citationStyleRegistry.js'

const FAST_STYLE_IDS = new Set(['apa', 'chicago', 'harvard', 'ieee', 'vancouver'])

export function isFastCitationStyle(style = 'apa') {
  return FAST_STYLE_IDS.has(String(style || '').trim())
}

async function resolveWorkspacePath() {
  try {
    const workspace = useWorkspaceStore()
    return String(workspace.projectDir || workspace.path || '').trim()
  } catch {
    return ''
  }
}

async function formatFromReference(style = 'apa', mode = 'reference', reference = {}, number) {
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
      workspacePath: await resolveWorkspacePath(),
    },
  })
}

async function formatFromCsl(style = 'apa', mode = 'reference', cslItems = [], number, locale = 'en-GB') {
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
      workspacePath: await resolveWorkspacePath(),
    },
  })
}

export async function formatReference(csl = {}, style = 'apa', number) {
  return formatFromCsl(style, 'reference', [csl], number)
}

export async function formatInlineCitation(csl = {}, style = 'apa', number) {
  return formatFromCsl(style, 'inline', [csl], number)
}

export async function formatCslBibliography(cslRecords = [], style = 'apa') {
  return formatFromCsl(style, 'bibliography', cslRecords)
}

export async function formatCitation(style = 'apa', mode = 'reference', reference = {}, number) {
  return formatFromReference(style, mode, reference, number)
}

export async function formatBibliography(style = 'apa', references = []) {
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
      workspacePath: await resolveWorkspacePath(),
    },
  })
}
