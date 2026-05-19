import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const fileTreeSource = await readFile('src/components/sidebar/FileTree.vue', 'utf8')
const actionsSource = await readFile('src/composables/files/useFileTreeActions.ts', 'utf8')

assert.match(
  fileTreeSource,
  /import \{ useFileTreeActions \} from '\.\.\/\.\.\/composables\/files\/useFileTreeActions\.ts'/,
  'FileTree.vue must use the file tree action workflow composable',
)
assert.match(
  fileTreeSource,
  /useFileTreeActions\(\{[\s\S]*selectedPaths,[\s\S]*findEntry,[\s\S]*getActivePath,[\s\S]*getContextEntry: \(\) => contextMenu\.entry,[\s\S]*selectRootRenameInput:/,
  'FileTree.vue must pass selection, lookup, context entry, and root input hooks into the action workflow',
)
assert.match(
  fileTreeSource,
  /beginNewFile[\s\S]*cancelRename[\s\S]*createNewFile[\s\S]*finishRename[\s\S]*handleDeleteSelected[\s\S]*openInDocumentDock[\s\S]*renaming[\s\S]*revealInFinder/,
  'FileTree.vue must receive file action handlers and rename state from the composable',
)
assert.doesNotMatch(
  fileTreeSource,
  /DOCUMENT_DOCK_FILE_PAGE|appendTypedFileExtension|buildFileTreeRenameState|buildTypedFileNameCandidate|deriveTypedFileNameCandidates|resetFileTreeRenameState|listWorkspaceFlatFileEntries|workspacePathExists|askNativeDialog|revealPathInFileManager|basenamePath|dirnamePath|createTypedFile|startInlineCreate|startInlineTypedFileCreate|files\.createFile|files\.createFolder|files\.renamePath|files\.duplicatePath|files\.deletePath|files\.markTransientFile|editor\.openDocumentDockFile/,
  'FileTree.vue must not directly own file tree action side effects',
)
assert.match(
  fileTreeSource,
  /showContextMenu[\s\S]*toggleWorkspaceMenu[\s\S]*calculateNewMenuPosition[\s\S]*updateWorkspaceMenuPosition[\s\S]*handleWorkspaceMenuDocumentPointerDown/,
  'FileTree.vue must keep menu positioning and overlay lifecycle orchestration',
)
assert.match(
  fileTreeSource,
  /useFileTreeRows\(\{[\s\S]*useFileTreeDrag\(\{/,
  'FileTree.vue must keep row virtualization and drag orchestration wired',
)

for (const expected of [
  'useFilesStore',
  'useEditorStore',
  'useWorkspaceStore',
  'askNativeDialog',
  'revealPathInFileManager',
  'workspacePathExists',
  'DOCUMENT_DOCK_FILE_PAGE',
  'buildFileTreeRenameState',
  'deriveTypedFileNameCandidates',
  'listWorkspaceFlatFileEntries',
]) {
  assert.match(
    actionsSource,
    new RegExp(expected),
    `useFileTreeActions must own ${expected}`,
  )
}

for (const expected of [
  'beginNewFile',
  'createNewFile',
  'finishRename',
  'handleContextCreate',
  'handleDeleteSelected',
  'openInDocumentDock',
  'revealInFinder',
]) {
  assert.match(
    actionsSource,
    new RegExp(`${expected}`),
    `useFileTreeActions must expose ${expected}`,
  )
}

assert.doesNotMatch(
  actionsSource,
  /<template>|FileTreeBody|FileTreeOverlays|FileTreeHeader|FileTreeFooter|useFileTreeRows|useFileTreeDrag|useTransientOverlayDismiss|resolveWorkspaceMenuPosition|resolveNewMenuStyle|resolveFloatingReference|getBoundingClientRect|addEventListener|removeEventListener|contextMenu\.show|workspaceMenuOpen|newMenuOpen/,
  'useFileTreeActions must avoid DOM composition, overlay positioning, listener lifecycle, row virtualization, and drag authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    fileTreeUsesActionComposable: true,
    actionSideEffectsMovedOutOfFileTree: true,
    fileTreeKeepsOverlayAndRowOrchestration: true,
    composableAvoidsDomAndDragAuthority: true,
  },
}, null, 2))
