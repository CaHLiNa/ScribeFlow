import test from 'node:test'
import assert from 'node:assert/strict'

import {
  detectReferenceImportFormat,
  mergeImportedReferences,
  parseBibTeXText,
  parseCSLJSONText,
  parseReferenceImportText,
  parseRisText,
} from '../src/services/references/bibtexImport.js'
import { exportReferencesToBibTeX } from '../src/services/references/bibtexExport.js'

test('parseBibTeXText parses a minimal BibTeX article entry', () => {
  const content = `
@article{an2026cbf,
  title = {CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems},
  author = {An, Liwei and Zhao, Can and Yang, Guang-Hong},
  journal = {Automatica},
  year = {2026},
  volume = {185},
  pages = {112782},
  doi = {10.1016/j.automatica.2025.112782}
}
`

  const parsed = parseBibTeXText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].citationKey, 'an2026cbf')
  assert.equal(parsed[0].typeKey, 'journal-article')
  assert.equal(parsed[0].source, 'Automatica')
  assert.equal(parsed[0].year, 2026)
  assert.equal(parsed[0].authors[0], 'Liwei An')
})

test('mergeImportedReferences skips duplicates by citation key', () => {
  const existing = [
    {
      id: 'existing-1',
      title: 'A',
      year: 2024,
      citationKey: 'smith2024a',
      identifier: '',
    },
  ]
  const imported = [
    {
      id: 'imported-1',
      title: 'A duplicate',
      year: 2024,
      citationKey: 'smith2024a',
      identifier: '',
    },
    {
      id: 'imported-2',
      title: 'B new',
      year: 2025,
      citationKey: 'lee2025b',
      identifier: '',
    },
  ]

  const merged = mergeImportedReferences(existing, imported)
  assert.equal(merged.length, 2)
  assert.equal(merged[1].citationKey, 'lee2025b')
})

test('detectReferenceImportFormat detects RIS and CSL JSON payloads', () => {
  assert.equal(detectReferenceImportFormat('TY  - JOUR\nTI  - Safe Control\nER  -'), 'ris')
  assert.equal(
    detectReferenceImportFormat('[{"type":"article-journal","title":"Safe Control"}]'),
    'csl-json'
  )
})

test('parseReferenceImportText auto-detects and parses RIS records', () => {
  const content = `
TY  - JOUR
TI  - Control Barrier Functions
AU  - Ames, Aaron D.
JO  - IEEE Transactions on Automatic Control
PY  - 2014
DO  - 10.1109/TAC.2014.1234567
ER  -
`

  const parsed = parseReferenceImportText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].typeKey, 'journal-article')
  assert.equal(parsed[0].authors[0], 'Aaron D. Ames')
  assert.equal(parsed[0].identifier, '10.1109/TAC.2014.1234567')
})

test('parseCSLJSONText converts CSL JSON into reference records', () => {
  const content = JSON.stringify([
    {
      _key: 'ames2014',
      type: 'article-journal',
      title: 'Control Barrier Functions',
      author: [{ family: 'Ames', given: 'Aaron D.' }],
      issued: { 'date-parts': [[2014]] },
      'container-title': 'IEEE Transactions on Automatic Control',
      DOI: '10.1109/TAC.2014.1234567',
    },
  ])

  const parsed = parseCSLJSONText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].citationKey, 'ames2014')
  assert.equal(parsed[0].source, 'IEEE Transactions on Automatic Control')
})

test('exportReferencesToBibTeX writes current reference records back to BibTeX', () => {
  const content = exportReferencesToBibTeX([
    {
      id: 'ref-1',
      citationKey: 'ames2014',
      typeKey: 'journal-article',
      title: 'Control Barrier Functions',
      authors: ['Aaron D. Ames'],
      year: 2014,
      source: 'IEEE Transactions on Automatic Control',
      identifier: '10.1109/TAC.2014.1234567',
      volume: '59',
      issue: '8',
      pages: '123-130',
    },
  ])

  assert.match(content, /@article\{ames2014,/)
  assert.match(content, /journal = \{IEEE Transactions on Automatic Control\}/)
  assert.match(content, /doi = \{10\.1109\/TAC\.2014\.1234567\}/)
})

test('parseRisText parses RIS directly for compatibility entry points', () => {
  const content = `
TY  - CONF
TI  - Safe Platoon Control
AU  - Liu, Yang
T2  - CDC
PY  - 2022
ER  -
`

  const parsed = parseRisText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].typeKey, 'conference-paper')
  assert.equal(parsed[0].source, 'CDC')
})
