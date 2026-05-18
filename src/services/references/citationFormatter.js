import { invoke } from '@tauri-apps/api/core'

async function formatFromReference(style = 'apa', mode = 'reference', reference = {}, number, workspacePath = '') {
  return invoke('references_citation_render', {
    params: {
      style,
      mode,
      reference,
      references: mode === 'bibliography' ? [reference] : [],
      cslItems: [],
      number,
      locale: 'en-GB',
      workspacePath,
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
  return invoke('references_citation_render', {
    params: {
      style,
      mode,
      reference: null,
      references: [],
      cslItems,
      number,
      locale,
      workspacePath,
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

export async function formatReferenceCitationById(
  style = 'apa',
  mode = 'reference',
  references = [],
  referenceId = '',
  number,
  workspacePath = ''
) {
  return invoke('references_citation_render', {
    params: {
      style,
      mode,
      reference: null,
      referenceId,
      references: Array.isArray(references) ? references : [],
      cslItems: [],
      number,
      locale: 'en-GB',
      workspacePath,
    },
  })
}

export async function formatBibliography(style = 'apa', references = [], workspacePath = '') {
  return invoke('references_citation_render', {
    params: {
      style,
      mode: 'bibliography',
      reference: null,
      references,
      cslItems: [],
      number: null,
      locale: 'en-GB',
      workspacePath,
    },
  })
}
