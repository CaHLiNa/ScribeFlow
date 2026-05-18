import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const storeSource = await readFile('src/stores/references.js', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.js', 'utf8')
const serviceSource = await readFile('src/services/references/bibtexExport.js', 'utf8')
const rustSource = await readFile('src-tauri/src/references_import.rs', 'utf8')

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

assert.doesNotMatch(
  domainSource,
  /export function resolveReferencesForExport|export function buildReferenceJsonExportTargetState/,
  'referenceStoreState must not retain migrated export target helpers',
)
assert.match(
  rustSource,
  /fn resolve_references_for_export/,
  'Rust import/export runtime must own ordered BibTeX export target resolution',
)
assert.match(
  rustSource,
  /fn resolve_json_reference_export/,
  'Rust import/export runtime must own JSON export target validation',
)
assert.match(
  rustSource,
  /serde\(default, alias = "reference_ids"\)/,
  'Rust export params must accept frontend camelCase and snake_case reference ids',
)
assert.match(
  serviceSource,
  /references_export_bibtex[\s\S]*referenceIds: Array\.isArray\(referenceIds\) \? referenceIds : \[\]/,
  'BibTeX export bridge must pass referenceIds through instead of filtering locally',
)
assert.match(
  serviceSource,
  /references_write_export_file[\s\S]*referenceId/,
  'JSON export bridge must pass referenceId through to Rust',
)

const exportBibTeXSource = extractActionSource(storeSource, 'exportBibTeXAsync')
assert.match(
  exportBibTeXSource,
  /return exportReferencesToBibTeX\(this\.references, referenceIds\)/,
  'exportBibTeXAsync must pass references and reference ids to the Rust export bridge',
)

const writeBibTeXSource = extractActionSource(storeSource, 'writeBibTeXExportFile')
assert.match(
  writeBibTeXSource,
  /return writeReferenceBibTeXExport\(filePath, this\.references, referenceIds\)/,
  'writeBibTeXExportFile must return the Rust-exported reference count',
)

const writeJsonSource = extractActionSource(storeSource, 'writeReferenceJsonExportFile')
assert.match(
  writeJsonSource,
  /await writeReferenceJsonExport\(filePath, this\.references, referenceId\)/,
  'writeReferenceJsonExportFile must pass the target id to the Rust export bridge',
)
assert.match(
  writeJsonSource,
  /String\(error\?\.message \|\| error\) === 'Reference not found'[\s\S]*throw new Error\(t\('Reference not found'\)\)/,
  'writeReferenceJsonExportFile must preserve localized missing-reference error semantics',
)

assert.doesNotMatch(
  `${exportBibTeXSource}\n${writeBibTeXSource}\n${writeJsonSource}`,
  /resolveReferencesForExport|buildReferenceJsonExportTargetState|referenceIds\s*\.map|this\.references\.find\(|resolveReferenceById\(this\.references/,
  'reference export actions must not duplicate selection or lookup rules inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    rustExportTargetResolution: true,
    exportServicesRemainThinBridge: true,
    storeExportActionsAvoidDuplicateSelectionRules: true,
    missingJsonReferenceLocalized: true,
  },
}, null, 2))
