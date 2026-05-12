import { invoke } from '@tauri-apps/api/core'
import { normalizeCitationStyle } from './citationStyleRegistry.js'

const FAST_STYLE_IDS = new Set(['apa', 'chicago', 'harvard', 'ieee', 'vancouver'])

export function isFastCitationStyle(style = 'apa') {
  return FAST_STYLE_IDS.has(String(style || '').trim())
}

function normalizeWorkspacePath(workspacePath = '') {
  return String(workspacePath || '').trim()
}

async function formatFromReference(style = 'apa', mode = 'reference', reference = {}, number, workspacePath = '') {
  const effectiveStyle = await normalizeCitationStyle(style)
  return invoke('references_citation_render', {
    params: {
      style: effectiveStyle,
      mode,
      reference,
      references: mode === 'bibliography' ? [reference] : [],
      cslItems: [],
      number,
      locale: 'en-GB',
      workspacePath: normalizeWorkspacePath(workspacePath),
    },
  })
}

async function formatFromCsl(
  style = 'apa',
  mode = 'reference',
  cslItems = [],
  number,
  locale = 'en-GB',
  workspacePath = ''
) {
  const effectiveStyle = await normalizeCitationStyle(style)
  return invoke('references_citation_render', {
    params: {
      style: effectiveStyle,
      mode,
      reference: null,
      references: [],
      cslItems,
      number,
      locale,
      workspacePath: normalizeWorkspacePath(workspacePath),
    },
  })
}

export async function formatReference(csl = {}, style = 'apa', number, workspacePath = '') {
  return formatFromCsl(style, 'reference', [csl], number, 'en-GB', workspacePath)
}

export async function formatInlineCitation(csl = {}, style = 'apa', number, workspacePath = '') {
  return formatFromCsl(style, 'inline', [csl], number, 'en-GB', workspacePath)
}

export async function formatCslBibliography(cslRecords = [], style = 'apa', workspacePath = '') {
  return formatFromCsl(style, 'bibliography', cslRecords, null, 'en-GB', workspacePath)
}

export async function formatCitation(style = 'apa', mode = 'reference', reference = {}, number, workspacePath = '') {
  return formatFromReference(style, mode, reference, number, workspacePath)
}

export async function formatBibliography(style = 'apa', references = [], workspacePath = '') {
  const effectiveStyle = await normalizeCitationStyle(style)
  return invoke('references_citation_render', {
    params: {
      style: effectiveStyle,
      mode: 'bibliography',
      reference: null,
      references,
      cslItems: [],
      number: null,
      locale: 'en-GB',
      workspacePath: normalizeWorkspacePath(workspacePath),
    },
  })
}
