import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const panelSource = await readFile('src/components/panel/ReferenceDetailPanel.vue', 'utf8')
const actionsSource = await readFile('src/composables/references/useReferenceDetailActions.ts', 'utf8')

assert.match(
  panelSource,
  /import \{ useReferenceDetailActions \} from '\.\.\/\.\.\/composables\/references\/useReferenceDetailActions\.ts'/,
  'ReferenceDetailPanel must use the reference detail action workflow composable',
)
assert.match(
  panelSource,
  /useReferenceDetailActions\(\{ selectedReference, emit \}\)/,
  'ReferenceDetailPanel must pass selected reference and emitted preview intent into the action workflow',
)
assert.match(
  panelSource,
  /canOpenPdf[\s\S]*handleAttachPdf[\s\S]*handleOpenPdfInEditor[\s\S]*handlePreviewPdf[\s\S]*handleRevealPdf/,
  'ReferenceDetailPanel must receive PDF action state and handlers from the composable',
)
assert.doesNotMatch(
  panelSource,
  /useEditorStore|openNativeDialog|revealPathInFileManager|resolveReferenceDetailPdfPath|attachReferencePdf|editorStore\.openFile|setLeftSidebarPanel\('files'\)|handleRefreshMetadata|refreshReferenceMetadata|selectedReferencePdfPath/,
  'ReferenceDetailPanel must not directly own reference detail PDF/native action side effects',
)
assert.match(
  panelSource,
  /syncDraft[\s\S]*saveDraftChangesForReference[\s\S]*enqueueReferenceUpdate[\s\S]*updateSelectedReference[\s\S]*commitTitle[\s\S]*commitAuthors/,
  'ReferenceDetailPanel must keep draft lifecycle and save queue orchestration',
)

for (const expected of [
  'useEditorStore',
  'useReferencesStore',
  'useWorkspaceStore',
  'openNativeDialog',
  'revealPathInFileManager',
  'resolveReferenceDetailPdfPath',
  'attachReferencePdf',
]) {
  assert.match(
    actionsSource,
    new RegExp(expected),
    `useReferenceDetailActions must own ${expected}`,
  )
}

for (const expected of [
  'canOpenPdf',
  'handleAttachPdf',
  'handleOpenPdfInEditor',
  'handlePreviewPdf',
  'handleRevealPdf',
]) {
  assert.match(
    actionsSource,
    new RegExp(expected),
    `useReferenceDetailActions must expose ${expected}`,
  )
}

assert.doesNotMatch(
  actionsSource,
  /<template>|ReferenceDetailHero|ReferenceDetailMetadataSection|ReferenceDetailContentSection|reactive\(|dirtyDraftFields|buildReferenceDetailDirtyUpdates|buildReferenceDetailDraftSnapshot|saveDraftChangesForReference|commitTitle|commitAuthors|commitCitationKey|commitYear|commitNote|addTag|removeTag/,
  'useReferenceDetailActions must avoid DOM composition and draft/save authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    panelUsesReferenceDetailActionComposable: true,
    pdfSideEffectsMovedOutOfPanel: true,
    panelKeepsDraftSaveOrchestration: true,
    composableAvoidsDraftAndDomAuthority: true,
  },
}, null, 2))
