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

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command === 'references_import_detect_format') {
      const content = String(args.params?.content || '').trim()
      if (!content) return 'unknown'
      if (/^@\w+\s*\{/m.test(content)) return 'bibtex'
      if (/^TY\s{2}-/m.test(content)) return 'ris'
      if (content.startsWith('{') || content.startsWith('[')) return 'csl-json'
      return 'unknown'
    }

    if (command === 'references_import_parse_text') {
      const format = args.params?.format
      const content = String(args.params?.content || '')
      if (format === 'bibtex') {
        return [
          {
            id: 'an2026cbf',
            citationKey: 'an2026cbf',
            typeKey: 'journal-article',
            title: 'CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems',
            authors: ['Liwei An', 'Can Zhao', 'Guang-Hong Yang'],
            authorLine: 'Liwei An; Can Zhao; Guang-Hong Yang',
            year: 2026,
            source: 'Automatica',
            identifier: '10.1016/j.automatica.2025.112782',
            volume: '185',
            issue: '',
            pages: '112782',
          },
        ]
      }
      if (format === 'ris' || (format === 'auto' && /^TY\s{2}-/m.test(content))) {
        if (/TY\s{2}- JOUR/m.test(content)) {
          return [
            {
              id: 'safe-control-2014',
              citationKey: 'ames2014safecontrol',
              typeKey: 'journal-article',
              title: 'Safe Control',
              authors: ['Aaron D. Ames'],
              authorLine: 'Aaron D. Ames',
              year: 2014,
              source: 'TAC',
              identifier: '10.1109/TAC.2014.1234567',
              volume: '',
              issue: '',
              pages: '',
            },
          ]
        }
        return [
          {
            id: 'safe-platoon-2022',
            citationKey: 'liu2022safeplatoon',
            typeKey: 'conference-paper',
            title: 'Safe Platoon Control',
            authors: ['Yang Liu'],
            authorLine: 'Yang Liu',
            year: 2022,
            source: 'CDC',
            identifier: '',
            volume: '',
            issue: '',
            pages: '',
          },
        ]
      }
      if (format === 'csl-json') {
        return [
          {
            id: 'ames2014',
            citationKey: 'ames2014',
            typeKey: 'journal-article',
            title: 'Control Barrier Functions',
            authors: ['Aaron D. Ames'],
            authorLine: 'Aaron D. Ames',
            year: 2014,
            source: 'IEEE Transactions on Automatic Control',
            identifier: '10.1109/TAC.2014.1234567',
            volume: '',
            issue: '',
            pages: '',
          },
        ]
      }
      return []
    }

    if (command === 'references_export_bibtex') {
      return `@article{ames2014,\n  title = {Control Barrier Functions},\n  journal = {IEEE Transactions on Automatic Control},\n  doi = {10.1109/TAC.2014.1234567}\n}`
    }

    throw new Error(`Unexpected invoke command: ${command}`)
  },
}

test('parseBibTeXText parses a minimal BibTeX article entry', async () => {
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

  const parsed = await parseBibTeXText(content)
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

test('detectReferenceImportFormat detects RIS and CSL JSON payloads', async () => {
  assert.equal(await detectReferenceImportFormat('TY  - JOUR\nTI  - Safe Control\nER  -'), 'ris')
  assert.equal(
    await detectReferenceImportFormat('[{"type":"article-journal","title":"Safe Control"}]'),
    'csl-json'
  )
})

test('parseReferenceImportText auto-detects and parses RIS records', async () => {
  const content = `
TY  - JOUR
TI  - Control Barrier Functions
AU  - Ames, Aaron D.
JO  - IEEE Transactions on Automatic Control
PY  - 2014
DO  - 10.1109/TAC.2014.1234567
ER  -
`

  const parsed = await parseReferenceImportText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].typeKey, 'journal-article')
  assert.equal(parsed[0].authors[0], 'Aaron D. Ames')
  assert.equal(parsed[0].identifier, '10.1109/TAC.2014.1234567')
})

test('parseCSLJSONText converts CSL JSON into reference records', async () => {
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

  const parsed = await parseCSLJSONText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].citationKey, 'ames2014')
  assert.equal(parsed[0].source, 'IEEE Transactions on Automatic Control')
})

test('exportReferencesToBibTeX writes current reference records back to BibTeX', async () => {
  const content = await exportReferencesToBibTeX([
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

test('parseRisText parses RIS directly for compatibility entry points', async () => {
  const content = `
TY  - CONF
TI  - Safe Platoon Control
AU  - Liu, Yang
T2  - CDC
PY  - 2022
ER  -
`

  const parsed = await parseRisText(content)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].typeKey, 'conference-paper')
  assert.equal(parsed[0].source, 'CDC')
})
