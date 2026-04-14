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
  citationStyleUsesFastPath,
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

test('formatCitation formats APA inline citations from current reference records', () => {
  assert.equal(formatCitation('apa', 'inline', REFERENCE), '(Ames & Grizzle, 2014)')
})

test('formatCitation formats IEEE bibliography entries from current reference records', () => {
  const value = formatCitation('ieee', 'bibliography', REFERENCE, 1)
  assert.match(value, /^\[1\]/)
  assert.match(value, /Control Barrier Functions/)
})

test('formatBibliography joins multiple formatted references', () => {
  const bibliography = formatBibliography('apa', [REFERENCE, { ...REFERENCE, id: 'ref-2', citationKey: 'ames2015', year: 2015 }])
  assert.match(bibliography, /2014/)
  assert.match(bibliography, /2015/)
  assert.match(bibliography, /\n\n/)
})

test('fast formatter exports upstream-compatible helpers', () => {
  const csl = referenceRecordToCsl(REFERENCE)
  assert.match(formatReference(csl, 'ieee', 3), /^\[3\]/)
  assert.equal(formatInlineCitation(csl, 'apa'), '(Ames & Grizzle, 2014)')
})

test('citation style registry exposes built-in styles and fast-path info', () => {
  assert.equal(citationStyleUsesFastPath('apa'), true)
  assert.equal(citationStyleUsesFastPath('nature'), false)
  assert.equal(getCitationStyleName('nature'), 'Nature')
  assert.ok(getAvailableCitationStyles().some((style) => style.id === 'bmj'))
})

test('citation style registry can register user styles', () => {
  setUserCitationStyles([{ id: 'my-style', name: 'My Style', category: 'Custom' }])
  assert.ok(getAvailableCitationStyles().some((style) => style.id === 'my-style'))
  assert.equal(citationStyleUsesFastPath('my-style'), false)
  setUserCitationStyles([])
})

test('registry returns sync formatter for fast-path styles', () => {
  const formatter = getCitationFormatter('ieee')
  const csl = referenceRecordToCsl(REFERENCE)
  assert.equal(formatter.isAsync, false)
  assert.match(formatter.formatReference(csl, 2), /^\[2\]/)
})

test('async fast-path formatting preserves current behavior', async () => {
  assert.equal(await formatCitationAsync('apa', 'inline', REFERENCE), '(Ames & Grizzle, 2014)')
  const bibliography = await formatBibliographyAsync('ieee', [REFERENCE])
  assert.match(bibliography, /^\[1\]/)
})
