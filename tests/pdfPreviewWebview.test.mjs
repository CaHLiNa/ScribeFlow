import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PDF_PREVIEW_THEME_TOKEN_NAMES,
  buildPdfPreviewHostUrl,
  buildPdfPreviewWebviewLabel,
  createPdfPreviewHostPayload,
} from '../src/services/pdf/pdfPreviewWebview.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webviewServiceSource = readFileSync(path.join(repoRoot, 'src/services/pdf/pdfPreviewWebview.js'), 'utf8')
const hostHtmlSource = readFileSync(path.join(repoRoot, 'pdf-host.html'), 'utf8')

test('buildPdfPreviewWebviewLabel normalizes pane ids into stable child-webview labels', () => {
  assert.equal(buildPdfPreviewWebviewLabel('pane/root 1'), 'pdf-preview-pane/root-1')
  assert.equal(buildPdfPreviewWebviewLabel(''), 'pdf-preview-preview')
})

test('pdf preview token capture includes the semantic preview surface color', () => {
  assert.equal(PDF_PREVIEW_THEME_TOKEN_NAMES.includes('--shell-preview-surface'), true)
})

test('buildPdfPreviewHostUrl targets the dedicated pdf host page and preserves labels', () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    location: {
      origin: 'http://localhost:1420',
    },
  }

  assert.equal(
    buildPdfPreviewHostUrl({
      label: 'pdf-preview-pane-root',
      parentLabel: 'main',
      resolvedTheme: 'light',
      themeRevision: 3,
      bootBackground: 'rgb(250 248 240)',
      bootForeground: 'rgb(20 19 17)',
    }),
    'http://localhost:1420/pdf-host.html?label=pdf-preview-pane-root&parentLabel=main&resolvedTheme=light&themeRevision=3&bootBackground=rgb%28250+248+240%29&bootForeground=rgb%2820+19+17%29',
  )

  if (typeof originalWindow === 'undefined') {
    delete globalThis.window
  } else {
    globalThis.window = originalWindow
  }
})

test('createPdfPreviewHostPayload trims transport data to the fields the child surface needs', () => {
  assert.deepEqual(createPdfPreviewHostPayload({
    label: 'pdf-preview-pane-root',
    sourcePath: ' /workspace/main.tex ',
    artifactPath: ' /workspace/build/main.pdf ',
    kind: 'latex',
    workspacePath: ' /workspace ',
    documentVersion: 12,
    compileState: {
      lastCompiled: 12,
      pdfPath: '/workspace/build/main.pdf',
      synctexPath: '/workspace/build/main.synctex.gz',
      compileTargetPath: '/workspace/main.tex',
      ignoredField: 'ignored',
    },
    forwardSyncRequest: { id: 5, line: 8, column: 3 },
    resolvedTheme: 'LIGHT',
    pdfThemedPages: true,
    themeRevision: 7,
    themeTokens: {
      '--shell-editor-surface': 'rgb(20 19 17)',
    },
  }), {
    label: 'pdf-preview-pane-root',
    sourcePath: '/workspace/main.tex',
    artifactPath: '/workspace/build/main.pdf',
    kind: 'latex',
    workspacePath: '/workspace',
    documentVersion: 12,
    compileState: {
      lastCompiled: 12,
      pdfPath: '/workspace/build/main.pdf',
      synctexPath: '/workspace/build/main.synctex.gz',
      compileTargetPath: '/workspace/main.tex',
    },
    forwardSyncRequest: { id: 5, line: 8, column: 3 },
    resolvedTheme: 'light',
    pdfThemedPages: true,
    themeRevision: 7,
    themeTokens: {
      '--shell-editor-surface': 'rgb(20 19 17)',
    },
  })
})

test('hosted pdf child webview is created as an immediately interactive surface on macOS', () => {
  assert.match(webviewServiceSource, /focus:\s*true/)
  assert.match(webviewServiceSource, /acceptFirstMouse:\s*true/)
})

test('pdf host boot page avoids a white flash before the inner viewer mounts', () => {
  assert.match(hostHtmlSource, /const resolvedTheme = params\.get\('resolvedTheme'\) === 'light' \? 'light' : 'dark'/)
  assert.match(hostHtmlSource, /const bootBackground = params\.get\('bootBackground'\)/)
  assert.match(hostHtmlSource, /--altals-pdf-host-boot-bg/)
  assert.match(hostHtmlSource, /background:\s*var\(--altals-pdf-host-boot-bg, #141311\);/)
  assert.match(hostHtmlSource, /cursor:\s*text;/)
  assert.match(hostHtmlSource, /#app\s*\{\s*background:\s*inherit;/)
})
