import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('package.json includes Reka UI for headless interaction primitives', () => {
  const source = readSource('package.json')
  assert.match(source, /"reka-ui":/)
})

test('UiModalShell uses Reka Dialog primitives', () => {
  const source = readSource('src/components/shared/ui/UiModalShell.vue')
  assert.match(source, /from 'reka-ui'/)
  assert.match(source, /DialogRoot/)
  assert.match(source, /DialogOverlay/)
  assert.match(source, /DialogContent/)
})

test('UiSelect uses Reka Select primitives', () => {
  const source = readSource('src/components/shared/ui/UiSelect.vue')
  assert.match(source, /from 'reka-ui'/)
  assert.match(source, /SelectRoot/)
  assert.match(source, /SelectTrigger/)
  assert.match(source, /SelectContent/)
  assert.match(source, /SelectItem/)
})

test('workspace quick open uses Reka dialog and combobox primitives', () => {
  const source = readSource('src/components/layout/WorkspaceQuickOpen.vue')
  assert.match(source, /from 'reka-ui'/)
  assert.match(source, /DialogRoot/)
  assert.match(source, /ComboboxRoot/)
  assert.match(source, /ComboboxInput/)
  assert.match(source, /ComboboxItem/)
})

test('context and dropdown surfaces use Reka dropdown menu primitives', () => {
  const editorMenu = readSource('src/components/editor/EditorContextMenu.vue')
  const surfaceMenu = readSource('src/components/shared/SurfaceContextMenu.vue')
  const sidebarMenu = readSource('src/components/sidebar/ContextMenu.vue')
  const fileTree = readSource('src/components/sidebar/FileTree.vue')

  assert.match(editorMenu, /DropdownMenuRoot/)
  assert.match(editorMenu, /createPointReference/)
  assert.match(surfaceMenu, /DropdownMenuRoot/)
  assert.match(surfaceMenu, /createPointReference/)
  assert.match(sidebarMenu, /DropdownMenuRoot/)
  assert.match(sidebarMenu, /createPointReference/)
  assert.match(fileTree, /DropdownMenuRoot/)
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
  const pdfHostSource = readSource('src/pdf-host/PdfHostApp.vue')

  assert.match(busSource, /app:transient-overlay-dismiss/)
  assert.match(busSource, /emit\(/)
  assert.match(busSource, /listen\(/)
  assert.match(composableSource, /useTransientOverlayDismiss/)
  assert.match(editorMenu, /useTransientOverlayDismiss/)
  assert.match(fileTree, /useTransientOverlayDismiss/)
  assert.match(surfaceMenuState, /useTransientOverlayDismiss/)
  assert.match(pdfHostSource, /theme-light/)
  assert.match(pdfHostSource, /theme-dark/)
  assert.match(pdfHostSource, /dataset\.themeResolved/)
})

test('pdf hosted preview path stays disabled until cross-webview overlays are supported', () => {
  const source = readSource('src/services/pdf/pdfPreviewWebview.js')
  assert.match(source, /const ENABLE_PDF_HOSTED_PREVIEW = false/)
  assert.match(
    source,
    /hosted path disabled until there is a dedicated cross-webview overlay bridge/i
  )
})
