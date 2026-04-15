import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('context and dropdown surfaces keep floating interaction primitives wired', () => {
  const editorMenu = readSource('src/components/editor/EditorContextMenu.vue')
  const surfaceMenu = readSource('src/components/shared/SurfaceContextMenu.vue')
  const sidebarMenu = readSource('src/components/sidebar/ContextMenu.vue')
  const fileTree = readSource('src/components/sidebar/FileTree.vue')

  assert.match(editorMenu, /<Teleport to="body">/)
  assert.match(editorMenu, /context-menu-backdrop/)
  assert.match(editorMenu, /calculatePosition/)
  assert.match(editorMenu, /useTransientOverlayDismiss/)
  assert.match(surfaceMenu, /<Teleport to="body">/)
  assert.match(surfaceMenu, /surface-context-menu/)
  assert.match(surfaceMenu, /has-submenu/)
  assert.match(surfaceMenu, /calculatePosition/)
  assert.match(sidebarMenu, /<Teleport to="body">/)
  assert.match(sidebarMenu, /context-menu-backdrop/)
  assert.match(sidebarMenu, /calculatePosition/)
  assert.match(fileTree, /resolveFloatingReference/)
  assert.match(fileTree, /workspaceMenuStyle/)
  assert.match(fileTree, /workspaceMenuPosition/)
  assert.match(
    fileTree,
    /<Teleport to="body">[\s\S]*?class="context-menu file-tree-workspace-menu file-tree-workspace-menu-popover"[\s\S]*?right: `\$\{workspaceMenuPosition\.right\}px`\s*,[\s\S]*?bottom: `\$\{workspaceMenuPosition\.bottom\}px`/
  )
})

test('transient overlays coordinate dismissal across app and hosted preview webviews', () => {
  const busSource = readSource('src/services/transientOverlayBus.js')
  const composableSource = readSource('src/composables/useTransientOverlayDismiss.js')
  const editorMenu = readSource('src/components/editor/EditorContextMenu.vue')
  const fileTree = readSource('src/components/sidebar/FileTree.vue')
  const surfaceMenuState = readSource('src/composables/useSurfaceContextMenu.js')

  assert.match(busSource, /app:transient-overlay-dismiss/)
  assert.match(busSource, /emit\(/)
  assert.match(busSource, /listen\(/)
  assert.match(composableSource, /useTransientOverlayDismiss/)
  assert.match(editorMenu, /useTransientOverlayDismiss/)
  assert.match(fileTree, /useTransientOverlayDismiss/)
  assert.match(surfaceMenuState, /useTransientOverlayDismiss/)
})
