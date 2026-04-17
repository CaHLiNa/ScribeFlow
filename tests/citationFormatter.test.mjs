import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatBibliography,
  formatBibliographyAsync,
  formatCitation,
  formatCitationAsync,
  formatInlineCitation,
  formatReference,
} from '../src/services/references/citationFormatter.js'
import {
  getAvailableCitationStyles,
  getCitationFormatter,
  getCitationStyleName,
  setUserCitationStyles,
} from '../src/services/references/citationStyleRegistry.js'
import { referenceRecordToCsl } from '../src/domains/references/referenceInterop.js'

const REFERENCE = {
  id: 'ref-1',
  citationKey: 'ames2014',
  typeKey: 'journal-article',
  title: 'Control Barrier Functions',
  authors: ['Aaron D. Ames', 'Jessy W. Grizzle'],
  year: 2014,
  source: 'IEEE Transactions on Automatic Control',
  identifier: '10.1109/TAC.2014.1234567',
  volume: '59',
  issue: '8',
  pages: '123-130',
}

function mockFormatReference(style = 'apa', mode = 'reference', reference = {}, number) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  const year = reference.year || 'n.d.'
  if (style === 'apa' && mode === 'inline') {
    if (authors.length >= 2) {
      const left = String(authors[0]).trim().split(/\s+/).at(-1)
      const right = String(authors[1]).trim().split(/\s+/).at(-1)
      return `(${left} & ${right}, ${year})`
    }
  }
  if (style === 'ieee' && mode === 'bibliography') {
    return `[${number || 1}] ${reference.title}`
  }
  if (style === 'ieee' && mode === 'reference') {
    return `[${number || 1}] ${reference.title}`
  }
  if (mode === 'bibliography') {
    return `${reference.title} (${year})`
  }
  return `${reference.title}`
}

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command === 'references_citation_render') {
      const items = args.params?.cslItems || []
      if (args.params?.style === 'ieee' && args.params?.mode === 'reference') {
        return `[${args.params?.number || 1}] ${args.params?.reference?.title || ''}`.trim()
      }
      if (args.params?.style === 'ieee' && args.params?.mode === 'bibliography') {
        return (args.params?.references || [])
          .map((reference, index) => `[${index + 1}] ${reference.title || ''}`.trim())
          .join('\n\n')
      }
      if (args.params?.style === 'apa' && args.params?.mode === 'inline') {
        return '(Ames & Grizzle, 2014)'
      }
      if (args.params?.mode === 'inline') return '(Ames & Grizzle, 2014)'
      if (args.params?.mode === 'bibliography') {
        return items
          .map((item, index) => `[${index + 1}] ${item.title || ''}`.trim())
          .join('\n\n')
      }
      return `[${args.params?.number || 1}] ${items[0]?.title || ''}`.trim()
    }
    throw new Error(`Unexpected invoke command: ${command}`)
  },
}

test('formatCitation formats APA inline citations from current reference records', async () => {
  assert.equal(await formatCitation('apa', 'inline', REFERENCE), '(Ames & Grizzle, 2014)')
})

test('formatCitation formats IEEE bibliography entries from current reference records', async () => {
  const value = await formatCitation('ieee', 'bibliography', REFERENCE, 1)
  assert.match(value, /^\[1\]/)
  assert.match(value, /Control Barrier Functions/)
})

test('formatBibliography joins multiple formatted references', async () => {
  const bibliography = await formatBibliography('apa', [REFERENCE, { ...REFERENCE, id: 'ref-2', citationKey: 'ames2015', year: 2015 }])
  assert.match(bibliography, /2014/)
  assert.match(bibliography, /2015/)
  assert.match(bibliography, /\n\n/)
})

test('fast formatter exports upstream-compatible helpers', async () => {
  const csl = referenceRecordToCsl(REFERENCE)
  assert.match(await formatReference(csl, 'ieee', 3), /^\[3\]/)
  assert.equal(await formatInlineCitation(csl, 'apa'), '(Ames & Grizzle, 2014)')
})

test('citation style registry exposes built-in styles and fast-path info', () => {
  assert.equal(getCitationStyleName('nature'), 'Nature')
  assert.ok(getAvailableCitationStyles().some((style) => style.id === 'bmj'))
})

test('citation style registry can register user styles', () => {
  setUserCitationStyles([{ id: 'my-style', name: 'My Style', category: 'Custom' }])
  assert.ok(getAvailableCitationStyles().some((style) => style.id === 'my-style'))
  setUserCitationStyles([])
})

test('registry returns async formatter for fast-path styles', async () => {
  const formatter = await getCitationFormatter('ieee')
  const csl = referenceRecordToCsl(REFERENCE)
  assert.equal(formatter.isAsync, true)
  assert.match(await formatter.formatReference(csl, 2), /^\[2\]/)
})

test('async fast-path formatting preserves current behavior', async () => {
  assert.equal(await formatCitationAsync('apa', 'inline', REFERENCE), '(Ames & Grizzle, 2014)')
  const bibliography = await formatBibliographyAsync('ieee', [REFERENCE])
  assert.match(bibliography, /^\[1\]/)
})
