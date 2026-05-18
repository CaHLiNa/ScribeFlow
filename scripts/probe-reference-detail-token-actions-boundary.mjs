import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const panelSource = await readFile('src/components/panel/ReferenceDetailPanel.vue', 'utf8')
const tokenActionsSource = await readFile('src/composables/references/useReferenceDetailTokenActions.js', 'utf8')

assert.match(
  panelSource,
  /import \{ useReferenceDetailTokenActions \} from '\.\.\/\.\.\/composables\/references\/useReferenceDetailTokenActions\.js'/,
  'ReferenceDetailPanel must use the reference detail token action workflow composable',
)
assert.match(
  panelSource,
  /useReferenceDetailTokenActions\(\{\s*availableCollections,\s*clearActiveDraftField,\s*clearDraftDirtyField,\s*draft,\s*markDraftDirty,\s*tagInput,\s*updateSelectedReference,\s*\}\)/,
  'ReferenceDetailPanel must pass collection state, draft refs, and save callback into the token action workflow',
)
assert.match(
  panelSource,
  /addTag[\s\S]*collectionLabel[\s\S]*handleTagInputBlur[\s\S]*handleTagInputKeydown[\s\S]*removeCollection[\s\S]*removeTag[\s\S]*updateTagInput/,
  'ReferenceDetailPanel must receive token action state and handlers from the composable',
)
assert.doesNotMatch(
  panelSource,
  /normalizeReferenceDetailCollectionMemberships|normalizeReferenceDetailTagValues|resolveReferenceDetailCollection|resolveReferenceDetailCollectionLabel|function resolveCollection|function normalizeCollectionMemberships|function collectionLabel|function updateTagInput|async function removeCollection|async function addTag|function handleTagInputKeydown|async function handleTagInputBlur|async function removeTag/,
  'ReferenceDetailPanel must not directly own reference detail tag/collection action workflow',
)
assert.match(
  panelSource,
  /syncDraft[\s\S]*saveDraftChangesForReference[\s\S]*enqueueReferenceUpdate[\s\S]*updateSelectedReference/,
  'ReferenceDetailPanel must keep draft lifecycle and save queue orchestration',
)

for (const expected of [
  'normalizeReferenceDetailCollectionMemberships',
  'normalizeReferenceDetailTagValues',
  'normalizeReferenceDetailText',
  'resolveReferenceDetailCollection',
  'resolveReferenceDetailCollectionLabel',
  'addTag',
  'collectionLabel',
  'handleTagInputBlur',
  'handleTagInputKeydown',
  'removeCollection',
  'removeTag',
  'updateTagInput',
]) {
  assert.match(
    tokenActionsSource,
    new RegExp(expected),
    `useReferenceDetailTokenActions must own ${expected}`,
  )
}

assert.doesNotMatch(
  tokenActionsSource,
  /<template>|ReferenceDetailHero|ReferenceDetailMetadataSection|ReferenceDetailContentSection|useReferencesStore|useWorkspaceStore|useToastStore|@tauri-apps|openNativeDialog|revealPathInFileManager|enqueueReferenceUpdate|saveDraftChangesForReference|syncDraft|buildReferenceDetailDirtyUpdates|buildReferenceDetailDraftSnapshot|commitTitle|commitAuthors|commitCitationKey|commitYear|commitNote/,
  'useReferenceDetailTokenActions must avoid DOM composition, native services, stores, and draft/save queue authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    panelUsesReferenceDetailTokenActionComposable: true,
    tokenSideEffectsMovedOutOfPanel: true,
    panelKeepsDraftSaveOrchestration: true,
    composableAvoidsStoreNativeAndSaveQueueAuthority: true,
  },
}, null, 2))
