import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const settingsThemeSource = readFileSync(
  path.join(repoRoot, 'src/components/settings/SettingsTheme.vue'),
  'utf8'
)

test('settings theme keeps only theme-matching and custom pdf page background controls', () => {
  assert.match(settingsThemeSource, /workspace\.pdfPageBackgroundFollowsTheme/)
  assert.match(settingsThemeSource, /<UiSwitch/)
  assert.match(settingsThemeSource, /workspace\.setPdfPageBackgroundFollowsTheme\(\$event\)/)
  assert.match(settingsThemeSource, /resolvedPdfPagePreviewBackground = computed\(\(\) =>/)
  assert.match(settingsThemeSource, /resolvedPdfPagePreviewForeground = computed\(\(\) =>/)
  assert.match(settingsThemeSource, /workspace\.pdfPageBackgroundFollowsTheme \? 'var\(--shell-preview-surface\)' : workspace\.pdfCustomPageBackground/)
  assert.match(settingsThemeSource, /const pdfCustomPageBackgroundDraft = ref\(workspace\.pdfCustomPageBackground\)/)
  assert.match(settingsThemeSource, /function handlePdfCustomPageBackgroundDraftInput\(value\)/)
  assert.match(settingsThemeSource, /function commitPdfCustomPageBackgroundDraft\(\)/)
  assert.match(settingsThemeSource, /function handlePdfColorDraftKeydown\(event, commitDraft\)/)
  assert.match(settingsThemeSource, /:disabled="workspace\.pdfPageBackgroundFollowsTheme"/)
  assert.match(settingsThemeSource, /<UiInput[\s\S]*placeholder="#1E1E1E"/)
  assert.match(settingsThemeSource, /resolvePdfCustomPageForeground\(workspace\.pdfCustomPageBackground\)/)
  assert.doesNotMatch(settingsThemeSource, /Quick presets/)
  assert.doesNotMatch(settingsThemeSource, /Soft Green/)
  assert.doesNotMatch(settingsThemeSource, /Warm Paper/)
  assert.doesNotMatch(settingsThemeSource, /Sepia/)
  assert.doesNotMatch(settingsThemeSource, /pdf-page-color-preset/)
  assert.doesNotMatch(settingsThemeSource, /Text color source/)
  assert.doesNotMatch(settingsThemeSource, /Custom text color/)
  assert.doesNotMatch(settingsThemeSource, /Auto contrast/)
})
