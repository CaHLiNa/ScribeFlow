import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workbenchSource = await readFile('src/components/references/ReferenceLibraryWorkbench.vue', 'utf8')
const mainSource = await readFile('src/components/references/ReferenceLibraryMain.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const workbenchStyle = scopedStyleBlock(workbenchSource)
const mainStyle = scopedStyleBlock(mainSource)

assert.match(
  workbenchSource,
  /import ReferenceLibraryMain from '\.\/ReferenceLibraryMain\.vue'/,
  'ReferenceLibraryWorkbench must render the reference list surface through ReferenceLibraryMain',
)
assert.match(
  workbenchSource,
  /<ReferenceLibraryMain[\s\S]*:references="filteredReferences"[\s\S]*:selected-reference-id="selectedReference\?\.id"[\s\S]*:zotero-mutation-error="referencesStore\.zoteroMutationError"/,
  'ReferenceLibraryWorkbench must pass derived list state into ReferenceLibraryMain',
)
assert.match(
  workbenchSource,
  /@import-bibtex="handleImportBibTeX"[\s\S]*@import-pdf="handleImportPdf"[\s\S]*@open-context-menu="openReferenceContextMenu"[\s\S]*@select-reference="handleReferenceRowClick"/,
  'ReferenceLibraryWorkbench must keep import and row orchestration wired',
)
assert.doesNotMatch(
  workbenchSource,
  /import ReferenceLibraryTable from '\.\/ReferenceLibraryTable\.vue'|import ReferenceLibraryToolbar from '\.\/ReferenceLibraryToolbar\.vue'/,
  'ReferenceLibraryWorkbench must not import list presentation children directly',
)
assert.doesNotMatch(
  workbenchSource,
  /<ReferenceLibraryToolbar|<ReferenceLibraryTable/,
  'ReferenceLibraryWorkbench must not render toolbar/table presentation DOM directly',
)

for (const className of [
  'reference-workbench__main',
  'reference-workbench__empty',
  'reference-workbench__status',
]) {
  assert.doesNotMatch(
    workbenchStyle,
    new RegExp(`\\.${className}\\b`),
    `ReferenceLibraryWorkbench must not own main list scoped style .${className}`,
  )
  assert.match(
    mainStyle,
    new RegExp(`\\.${className}\\b`),
    `ReferenceLibraryMain must own main list scoped style .${className}`,
  )
}

assert.match(
  mainSource,
  /import ReferenceLibraryTable from '\.\/ReferenceLibraryTable\.vue'/,
  'ReferenceLibraryMain must own table presentation composition',
)
assert.match(
  mainSource,
  /import ReferenceLibraryToolbar from '\.\/ReferenceLibraryToolbar\.vue'/,
  'ReferenceLibraryMain must own toolbar presentation composition',
)
assert.match(
  mainSource,
  /@open-context-menu="forwardReferenceContextMenu"/,
  'ReferenceLibraryMain must forward table context menu events without handling actions',
)
assert.doesNotMatch(
  mainSource,
  /useReferencesStore|useWorkspaceStore|useToastStore|useUxStatusStore|openNativeDialog|saveNativeDialog|referencesStore|workspace\.|handleImportBibTeX|handleImportPdf|handleExportBibTeX|openSurfaceContextMenu/,
  'ReferenceLibraryMain must stay presentation-only and avoid store/service authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    workbenchUsesMainComponent: true,
    parentKeepsReferenceListOrchestration: true,
    mainOwnsToolbarStatusEmptyAndTable: true,
    mainAvoidsStoreAndServiceAuthority: true,
  },
}, null, 2))
