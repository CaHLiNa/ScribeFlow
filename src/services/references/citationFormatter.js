import { invoke } from '@tauri-apps/api/core'
import { cslToReferenceRecord, referenceRecordToCsl } from '../../domains/references/referenceInterop.js'

const FAST_STYLE_IDS = new Set(['apa', 'chicago', 'harvard', 'ieee', 'vancouver'])

export function isFastCitationStyle(style = 'apa') {
  return FAST_STYLE_IDS.has(String(style || '').trim())
}

function requireTauriInvoke() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for citation formatting.')
  }
}

async function formatFromReference(style = 'apa', mode = 'reference', reference = {}, number) {
  requireTauriInvoke()
  return invoke('references_citation_format', {
    params: {
      style,
      mode,
      reference,
      number,
    },
  })
}

async function formatFromCsl(style = 'apa', mode = 'reference', cslItems = [], number, locale = 'en-GB') {
  requireTauriInvoke()
  const { useWorkspaceStore } = await import('../../stores/workspace.js')
  const workspace = useWorkspaceStore()
  return invoke('references_citation_format_csl', {
    params: {
      styleId: style,
      mode,
      cslItems,
      number,
      locale,
      workspacePath: String(workspace.projectDir || workspace.path || '').trim(),
    },
  })
}

export async function formatReference(csl = {}, style = 'apa', number) {
  if (isFastCitationStyle(style)) {
    return formatFromReference(style, 'reference', cslToReferenceRecord(csl), number)
  }
  return formatFromCsl(style, 'reference', [csl], number)
}

export async function formatInlineCitation(csl = {}, style = 'apa', number) {
  if (isFastCitationStyle(style)) {
    return formatFromReference(style, 'inline', cslToReferenceRecord(csl), number)
  }
  return formatFromCsl(style, 'inline', [csl], number)
}

export async function formatCslBibliography(cslRecords = [], style = 'apa') {
  if (isFastCitationStyle(style)) {
    return invoke('references_citation_bibliography', {
      params: {
        style,
        references: cslRecords.map((record) => cslToReferenceRecord(record)),
      },
    })
  }
  return formatFromCsl(style, 'bibliography', cslRecords)
}

export async function formatCitation(style = 'apa', mode = 'reference', reference = {}, number) {
  if (isFastCitationStyle(style)) {
    return formatFromReference(style, mode, reference, number)
  }
  return formatFromCsl(style, mode, [referenceRecordToCsl(reference)], number)
}

export async function formatBibliography(style = 'apa', references = []) {
  if (isFastCitationStyle(style)) {
    return invoke('references_citation_bibliography', {
      params: {
        style,
        references,
      },
    })
  }
  return formatFromCsl(style, 'bibliography', references.map((reference) => referenceRecordToCsl(reference)))
}

export async function formatCitationAsync(style = 'apa', mode = 'reference', reference = {}, number) {
  return formatCitation(style, mode, reference, number)
}

export async function formatBibliographyAsync(style = 'apa', references = []) {
  return formatBibliography(style, references)
}
