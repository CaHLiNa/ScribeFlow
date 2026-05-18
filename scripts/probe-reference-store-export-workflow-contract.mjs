import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveReferenceById,
  resolveReferencesForExport,
} from '../src/domains/references/referenceStoreState.js'

const references = [
  { id: 'ref-1', citationKey: 'ada2024', title: 'Ada' },
  { id: 'ref-2', citationKey: 'hopper2025', title: 'Hopper' },
  { id: 'ref-3', citationKey: 'turing2026', title: 'Turing' },
]

assert.deepEqual(resolveReferencesForExport(references), references)
assert.deepEqual(resolveReferencesForExport(references, []), references)
assert.deepEqual(resolveReferencesForExport(references, ['ref-3', 'missing', 'ref-1']), [
  references[2],
  references[0],
])
assert.deepEqual(resolveReferencesForExport('not-array', ['ref-1']), [])
assert.deepEqual(resolveReferenceById(references, 'ref-2'), references[1])
assert.equal(resolveReferenceById(references, 'hopper2025'), null)

const storeSource = await readFile('src/stores/references.js', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.js', 'utf8')

function extractActionSource(source, actionName) {
  const start = source.indexOf(`async ${actionName}(`)
  assert.notEqual(start, -1, `${actionName} action must exist`)

  const endCandidates = [
    source.indexOf('\n    async ', start + 1),
    source.indexOf('\n    cleanup()', start + 1),
  ].filter((index) => index !== -1)
  assert.ok(endCandidates.length > 0, `${actionName} action end must be found`)

  return source.slice(start, Math.min(...endCandidates))
}

assert.match(
  domainSource,
  /export function resolveReferencesForExport/,
  'reference export selection must live in the pure reference domain',
)
assert.match(
  domainSource,
  /export function resolveReferenceById/,
  'exact-id reference lookup for JSON export must live in the pure reference domain',
)

const exportBibTeXSource = extractActionSource(storeSource, 'exportBibTeXAsync')
assert.match(
  exportBibTeXSource,
  /const references = resolveReferencesForExport\(this\.references, referenceIds\)/,
  'exportBibTeXAsync must reuse the shared export selection helper',
)
assert.match(
  exportBibTeXSource,
  /return exportReferencesToBibTeX\(references\)/,
  'exportBibTeXAsync must keep serialization in the export service',
)

const writeBibTeXSource = extractActionSource(storeSource, 'writeBibTeXExportFile')
assert.match(
  writeBibTeXSource,
  /const references = resolveReferencesForExport\(this\.references, referenceIds\)/,
  'writeBibTeXExportFile must reuse the shared export selection helper',
)
assert.match(
  writeBibTeXSource,
  /await writeReferenceBibTeXExport\(filePath, references\)/,
  'writeBibTeXExportFile must keep file writing in the export service',
)
assert.match(
  writeBibTeXSource,
  /return references\.length/,
  'writeBibTeXExportFile must preserve exported reference count semantics',
)

const writeJsonSource = extractActionSource(storeSource, 'writeReferenceJsonExportFile')
assert.match(
  writeJsonSource,
  /const reference = resolveReferenceById\(this\.references, referenceId\)/,
  'writeReferenceJsonExportFile must use exact-id lookup for JSON export',
)
assert.match(
  writeJsonSource,
  /throw new Error\(t\('Reference not found'\)\)/,
  'writeReferenceJsonExportFile must preserve missing-reference error semantics',
)
assert.match(
  writeJsonSource,
  /await writeReferenceJsonExport\(filePath, reference\)/,
  'writeReferenceJsonExportFile must keep JSON writing in the export service',
)

assert.doesNotMatch(
  `${exportBibTeXSource}\n${writeBibTeXSource}\n${writeJsonSource}`,
  /referenceIds\s*\.map|this\.references\.find\(/,
  'reference export actions must not duplicate selection or lookup rules inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    exportSelectionDerived: true,
    exactJsonExportLookupDerived: true,
    exportServicesRemainIoBoundary: true,
    storeExportActionsAvoidDuplicateSelectionRules: true,
  },
}, null, 2))
