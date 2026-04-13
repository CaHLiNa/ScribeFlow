import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeImportedReferences, parseBibTeXText } from '../src/services/references/bibtexImport.js'

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
