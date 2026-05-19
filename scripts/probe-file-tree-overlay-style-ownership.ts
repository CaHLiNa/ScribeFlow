import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const fileTreeSource = await readFile('src/components/sidebar/FileTree.vue', 'utf8')
const overlaysSource = await readFile('src/components/sidebar/FileTreeOverlays.vue', 'utf8')

assert.match(
  fileTreeSource,
  /import FileTreeOverlays from '\.\/FileTreeOverlays\.vue'/,
  'FileTree.vue must render overlay presentation through FileTreeOverlays',
)
assert.match(
  fileTreeSource,
  /<FileTreeOverlays[\s\S]*:context-menu-visible="contextMenu\.show"[\s\S]*:workspace-menu-open="workspaceMenuOpen"[\s\S]*:new-menu-open="newMenuOpen"[\s\S]*:drag-ghost-visible="dragGhostVisible"/,
  'FileTree.vue must pass context, workspace, new-menu, and drag ghost state into FileTreeOverlays',
)
assert.match(
  fileTreeSource,
  /@context-create="handleContextCreate"[\s\S]*@context-rename="handleRename"[\s\S]*@context-delete-selected="handleDeleteSelected"[\s\S]*@workspace-open-folder="handleWorkspaceMenuOpenFolder"[\s\S]*@new-menu-create="handleNewMenuCreate"/,
  'FileTree.vue must keep overlay user-intent orchestration wired',
)
assert.match(
  fileTreeSource,
  /fileTreeOverlays\.value\?\.getNewMenuElement\?\.\(\)/,
  'FileTree.vue must read the new-menu DOM element through FileTreeOverlays for positioning',
)
assert.match(
  fileTreeSource,
  /fileTreeOverlays\.value\?\.getWorkspaceMenuElement\?\.\(\)/,
  'FileTree.vue must read the workspace-menu DOM element through FileTreeOverlays for outside-click guards',
)
assert.doesNotMatch(
  fileTreeSource,
  /import ContextMenu from '\.\/ContextMenu\.vue'|import FileTreeNewMenu from '\.\/FileTreeNewMenu\.vue'|import FileTreeWorkspaceMenu from '\.\/FileTreeWorkspaceMenu\.vue'/,
  'FileTree.vue must not import overlay presentation children directly',
)
assert.doesNotMatch(
  fileTreeSource,
  /<ContextMenu|<FileTreeNewMenu|<FileTreeWorkspaceMenu|<Teleport to="body">[\s\S]*tab-ghost/,
  'FileTree.vue must not render overlay menu or drag ghost presentation directly',
)

assert.match(
  overlaysSource,
  /import ContextMenu from '\.\/ContextMenu\.vue'/,
  'FileTreeOverlays.vue must own file context menu presentation composition',
)
assert.match(
  overlaysSource,
  /import FileTreeNewMenu from '\.\/FileTreeNewMenu\.vue'/,
  'FileTreeOverlays.vue must own new-menu presentation composition',
)
assert.match(
  overlaysSource,
  /import FileTreeWorkspaceMenu from '\.\/FileTreeWorkspaceMenu\.vue'/,
  'FileTreeOverlays.vue must own workspace-menu presentation composition',
)
assert.match(
  overlaysSource,
  /<Teleport to="body">[\s\S]*class="tab-ghost"/,
  'FileTreeOverlays.vue must own drag ghost presentation',
)
assert.match(
  overlaysSource,
  /getWorkspaceMenuElement\(\)[\s\S]*workspaceMenuComponent\.value\?\.menuEl/,
  'FileTreeOverlays.vue must expose the workspace menu DOM element through a narrow method',
)
assert.match(
  overlaysSource,
  /getNewMenuElement\(\)[\s\S]*newMenuComponent\.value\?\.menuEl/,
  'FileTreeOverlays.vue must expose the new-menu DOM element through a narrow method',
)
assert.doesNotMatch(
  overlaysSource,
  /useFilesStore|useEditorStore|useWorkspaceStore|workspacePathExists|askNativeDialog|revealPathInFileManager|useFileTreeRows|useFileTreeDrag|useTransientOverlayDismiss|resolveWorkspaceMenuPosition|resolveNewMenuStyle/,
  'FileTreeOverlays.vue must stay presentation-only and avoid store/service/listener authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    fileTreeUsesOverlayComponent: true,
    parentKeepsOverlayOrchestration: true,
    overlaysOwnMenuComposition: true,
    overlaysAvoidStoreAndServiceAuthority: true,
  },
}, null, 2))
