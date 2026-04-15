import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wrapperPath = path.join(repoRoot, 'src/components/editor/PdfArtifactPreview.vue')
const iframeSurfacePath = path.join(repoRoot, 'src/components/editor/PdfIframeSurface.vue')
const wrapperSource = readFileSync(wrapperPath, 'utf8')
const iframeSurfaceSource = readFileSync(iframeSurfacePath, 'utf8')

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
  assert.match(iframeSurfaceSource, /function resolvePdfSurfaceBackground\(\)/)
  assert.match(iframeSurfaceSource, /return resolveThemeToken\('--shell-preview-surface'\) \|\| resolveThemeToken\('--shell-editor-surface'\)/)
  assert.match(iframeSurfaceSource, /themeRevision: Number\(props\.themeRevision \|\| 0\)/)
  assert.match(iframeSurfaceSource, /pageBackground: resolvePdfSurfaceBackground\(\)/)
  assert.match(iframeSurfaceSource, /pageForeground: resolveThemeToken\('--workspace-ink'\)/)
  assert.match(iframeSurfaceSource, /watch\(\s*\(\) => viewerThemeReloadKey\.value,/)
  assert.doesNotMatch(
    iframeSurfaceSource,
    /watch\(\s*\(\) => \[props\.resolvedTheme, props\.pdfThemedPages, props\.themeTokens\],/,
  )
})

test('pdf preview wrapper stays on the inline iframe surface and forwards sync events', () => {
  assert.match(wrapperSource, /<PdfIframeSurface/)
  assert.doesNotMatch(wrapperSource, /PdfHostedPreview/)
  assert.match(wrapperSource, /@backward-sync="handleBackwardSync"/)
  assert.match(wrapperSource, /@forward-sync-handled="handleForwardSyncHandled"/)
})

test('pdf preview wrapper snapshots theme tokens on the next animation frame and bumps a revision for iframe reloads', () => {
  assert.match(wrapperSource, /const resolvedTheme = ref\(resolveThemePreference\(\)\)/)
  assert.match(wrapperSource, /function normalizeResolvedThemeValue\(value\)/)
  assert.match(wrapperSource, /const themeRevision = ref\(0\)/)
  assert.match(wrapperSource, /const themeTokens = ref\(capturePdfPreviewThemeTokens\(\)\)/)
  assert.match(wrapperSource, /const PDF_PREVIEW_THEME_TOKEN_NAMES = \[/)
  assert.match(wrapperSource, /function scheduleThemeSnapshot\(options = \{\}\)/)
  assert.match(wrapperSource, /themeSnapshotFrame = window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(wrapperSource, /commitThemeSnapshot\(\{ forceReload: shouldForceReload \}\)/)
  assert.match(wrapperSource, /themeRevision\.value \+= 1/)
  assert.match(wrapperSource, /handleWorkspaceThemeUpdated\(event\) \{\s*resolvedTheme\.value = normalizeResolvedThemeValue\(/)
  assert.doesNotMatch(wrapperSource, /const resolvedTheme = computed\(\(\) => resolveThemePreference\(\)\)/)
  assert.match(wrapperSource, /:themeRevision=\"themeRevision\"/)
})
