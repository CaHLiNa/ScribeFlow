import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wrapperPath = path.join(repoRoot, 'src/components/editor/PdfArtifactPreview.vue')
const iframeSurfacePath = path.join(repoRoot, 'src/components/editor/PdfIframeSurface.vue')
const hostedPreviewPath = path.join(repoRoot, 'src/components/editor/PdfHostedPreview.vue')
const wrapperSource = readFileSync(wrapperPath, 'utf8')
const iframeSurfaceSource = readFileSync(iframeSurfacePath, 'utf8')
const hostedPreviewSource = readFileSync(hostedPreviewPath, 'utf8')

test('latex pdf preview wrapper self-heals missing synctex state from existing artifacts', () => {
  assert.match(wrapperSource, /async function ensureLatexSynctexState\(\)/)
  assert.match(wrapperSource, /!pdfPath \|\| String\(compileState\.value\?\.synctexPath \|\| ''\)\.trim\(\)/)
  assert.match(wrapperSource, /latexStore\.registerExistingArtifact\?\.\(props\.sourcePath, pdfPath/)
})

test('latex pdf iframe surface resolves reported files before emitting backward sync', () => {
  assert.match(iframeSurfaceSource, /resolveLatexSyncTargetPath/)
  assert.match(iframeSurfaceSource, /compileTargetPath: props\.compileState\?\.compileTargetPath \|\| ''/)
  assert.match(iframeSurfaceSource, /workspacePath: props\.workspacePath \|\| ''/)
  assert.match(iframeSurfaceSource, /emit\('backward-sync', \{/)
  assert.match(iframeSurfaceSource, /file: resolvedFile \|\| result\.file/)
})

test('latex pdf iframe surface bridges sync through iframe messages', () => {
  assert.match(iframeSurfaceSource, /channel: 'altals-latex-sync'/)
  assert.match(iframeSurfaceSource, /window\.addEventListener\('message', handleIframeViewerMessage\)/)
  assert.match(iframeSurfaceSource, /if \(data\.type === 'reverse_synctex'\)/)
  assert.match(iframeSurfaceSource, /postLatexViewerMessage\('synctex', \{ data: point \}\)/)
  assert.match(iframeSurfaceSource, /emit\('forward-sync-handled', \{ id: request\.id, sourcePath: props\.sourcePath \}\)/)
})

test('latex pdf iframe surface only reloads the viewer when actual theme inputs change', () => {
  assert.match(iframeSurfaceSource, /const viewerThemeReloadKey = computed\(\(\)\s*=>\s*JSON\.stringify\(\{/)
  assert.match(iframeSurfaceSource, /themeRevision: Number\(props\.themeRevision \|\| 0\)/)
  assert.match(iframeSurfaceSource, /pageBackground: resolveThemeToken\('--shell-editor-surface'\)/)
  assert.match(iframeSurfaceSource, /pageForeground: resolveThemeToken\('--workspace-ink'\)/)
  assert.match(iframeSurfaceSource, /watch\(\s*\(\) => viewerThemeReloadKey\.value,/)
  assert.doesNotMatch(
    iframeSurfaceSource,
    /watch\(\s*\(\) => \[props\.resolvedTheme, props\.pdfThemedPages, props\.themeTokens\],/,
  )
})

test('hosted pdf preview keeps the heavy viewer in a child webview and forwards sync events back to the workbench', () => {
  assert.match(hostedPreviewSource, /buildPdfPreviewWebviewLabel/)
  assert.match(hostedPreviewSource, /sessionId: \{ type: Number, default: 0 \}/)
  assert.match(hostedPreviewSource, /buildPdfPreviewWebviewLabel\(`\$\{props\.paneId\}:\$\{props\.sessionId\}`\)/)
  assert.match(hostedPreviewSource, /ensurePdfPreviewWebview/)
  assert.match(hostedPreviewSource, /PDF_PREVIEW_HOST_READY_EVENT/)
  assert.match(hostedPreviewSource, /PDF_PREVIEW_HOST_BACKWARD_SYNC_EVENT/)
  assert.match(hostedPreviewSource, /PDF_PREVIEW_HOST_FORWARD_SYNC_HANDLED_EVENT/)
  assert.match(hostedPreviewSource, /themeRevision: props\.themeRevision/)
  assert.match(hostedPreviewSource, /emit\('backward-sync', event\.payload\?\.detail \|\| null\)/)
})

test('pdf preview wrapper falls back to the inline surface when hosted child-webview permission is unavailable', () => {
  assert.match(wrapperSource, /const hostedPreviewRejected = ref\(false\)/)
  assert.match(wrapperSource, /isPdfHostedPreviewSupported\(\) && hostedPreviewRejected\.value !== true/)
  assert.match(wrapperSource, /@unavailable="handleHostedPreviewUnavailable"/)
  assert.match(wrapperSource, /function handleHostedPreviewUnavailable\(\)/)
  assert.match(wrapperSource, /hostedPreviewRejected\.value = true/)
  assert.match(hostedPreviewSource, /function isHostedPreviewPermissionError\(error\)/)
  assert.match(hostedPreviewSource, /emit\('unavailable', \{/)
  assert.match(hostedPreviewSource, /reason: 'permission-denied'/)
})

test('pdf preview wrapper snapshots theme tokens on the next animation frame and bumps a revision for hosted previews', () => {
  assert.match(wrapperSource, /const resolvedTheme = ref\(resolveThemePreference\(\)\)/)
  assert.match(wrapperSource, /function normalizeResolvedThemeValue\(value\)/)
  assert.match(wrapperSource, /const themeRevision = ref\(0\)/)
  assert.match(wrapperSource, /const hostedPreviewSession = ref\(nextHostedPreviewSessionId\+\+\)/)
  assert.match(wrapperSource, /const hostedPreviewKey = computed\(\(\) => `\$\{props\.paneId\}:\$\{hostedPreviewSession\.value\}`\)/)
  assert.match(wrapperSource, /function scheduleThemeSnapshot\(options = \{\}\)/)
  assert.match(wrapperSource, /themeSnapshotFrame = window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(wrapperSource, /commitThemeSnapshot\(\{ forceReload: shouldForceReload \}\)/)
  assert.match(wrapperSource, /hostedPreviewSession\.value = nextHostedPreviewSessionId\+\+/)
  assert.match(wrapperSource, /handleWorkspaceThemeUpdated\(event\) \{\s*resolvedTheme\.value = normalizeResolvedThemeValue\(/)
  assert.doesNotMatch(wrapperSource, /const resolvedTheme = computed\(\(\) => resolveThemePreference\(\)\)/)
  assert.match(wrapperSource, /:key="hostedPreviewKey"/)
  assert.match(wrapperSource, /:sessionId="hostedPreviewSession"/)
  assert.match(wrapperSource, /:themeRevision=\"themeRevision\"/)
})
