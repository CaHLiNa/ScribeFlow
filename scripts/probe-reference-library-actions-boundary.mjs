import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workbenchSource = await readFile('src/components/references/ReferenceLibraryWorkbench.vue', 'utf8')
const actionsSource = await readFile('src/composables/references/useReferenceLibraryActions.js', 'utf8')

assert.match(
  workbenchSource,
  /import \{ useReferenceLibraryActions \} from '\.\.\/\.\.\/composables\/references\/useReferenceLibraryActions\.js'/,
  'ReferenceLibraryWorkbench must use the reference action workflow composable',
)
assert.match(
  workbenchSource,
  /useReferenceLibraryActions\(\{ filteredReferences \}\)/,
  'ReferenceLibraryWorkbench must pass filtered references into the action workflow',
)
assert.match(
  workbenchSource,
  /handleImportBibTeX[\s\S]*handleImportPdf[\s\S]*handleManualImport[\s\S]*openReferenceContextMenu/,
  'ReferenceLibraryWorkbench must receive import/export/context-menu handlers from the composable',
)
assert.doesNotMatch(
  workbenchSource,
  /useToastStore|useUxStatusStore|useSurfaceContextMenu|openNativeDialog|saveNativeDialog|navigator\.clipboard|window\.prompt|buildReferenceContextMenuGroups|buildReferenceExportDefaultPath|normalizeReferenceFilenameSegment|renameReferencePdfAsset|refreshReferenceMetadata|writeBibTeXExportFile|writeReferenceJsonExportFile|importReferenceFile|importReferencePdf|toggleReferenceCollection|removeReference/,
  'ReferenceLibraryWorkbench must not directly own reference action workflow side effects',
)
assert.match(
  workbenchSource,
  /activateReferenceDockPage[\s\S]*handleReferenceDetailResize[\s\S]*resetReferenceDockTabs/,
  'ReferenceLibraryWorkbench must keep dock selection and resize orchestration',
)

for (const expected of [
  "useReferencesStore",
  "useWorkspaceStore",
  "useToastStore",
  "useUxStatusStore",
  "useSurfaceContextMenu",
  "openNativeDialog",
  "saveNativeDialog",
  "buildReferenceContextMenuGroups",
  "buildReferenceExportDefaultPath",
  "normalizeReferenceFilenameSegment",
]) {
  assert.match(
    actionsSource,
    new RegExp(expected),
    `useReferenceLibraryActions must own ${expected}`,
  )
}

for (const expected of [
  'handleImportBibTeX',
  'handleImportPdf',
  'handleExportBibTeX',
  'handleManualImport',
  'openReferenceContextMenu',
  'handleSurfaceContextMenuSelect',
]) {
  assert.match(
    actionsSource,
    new RegExp(`${expected}`),
    `useReferenceLibraryActions must expose ${expected}`,
  )
}

assert.doesNotMatch(
  actionsSource,
  /<template>|ReferenceLibraryMain|ReferenceLibraryDetailDock|ReferenceAddDialog|ReferenceLibraryTable|ReferenceLibraryToolbar|referenceDockPageRegistry|InlineDock|handleReferenceDetailResize|setReferenceDockActivePage|openReferenceDock\(\)/,
  'useReferenceLibraryActions must avoid UI DOM composition and dock/resize authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    workbenchUsesReferenceActionComposable: true,
    actionSideEffectsMovedOutOfWorkbench: true,
    workbenchKeepsDockOrchestration: true,
    composableAvoidsDomAndDockAuthority: true,
  },
}, null, 2))
