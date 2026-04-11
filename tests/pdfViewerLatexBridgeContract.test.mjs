import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viewerHtmlPath = path.join(repoRoot, 'public/pdfjs-viewer/web/viewer.html')
const viewerBridgePath = path.join(repoRoot, 'public/pdfjs-viewer/web/altals-latex-sync.mjs')
const viewerCssPath = path.join(repoRoot, 'public/pdfjs-viewer/web/viewer.css')
const viewerHtmlSource = readFileSync(viewerHtmlPath, 'utf8')
const viewerBridgeSource = readFileSync(viewerBridgePath, 'utf8')
const viewerCssSource = readFileSync(viewerCssPath, 'utf8')

test('pdf viewer html includes the latex sync bridge module', () => {
  assert.match(viewerHtmlSource, /<script src="altals-latex-sync\.mjs" type="module"><\/script>/)
})

test('pdf viewer latex bridge registers reverse sync on pages and posts messages to parent', () => {
  assert.match(viewerBridgeSource, /const CHANNEL = 'altals-latex-sync'/)
  assert.match(viewerBridgeSource, /pageDom\.ondblclick = \(event\) =>/)
  assert.match(viewerBridgeSource, /postToParent\('reverse_synctex'/)
  assert.match(viewerBridgeSource, /window\.addEventListener\('message'/)
  assert.match(viewerBridgeSource, /if \(data\.type === 'synctex'\)/)
})

test('pdf viewer latex bridge shows a visible indicator on forward sync', () => {
  assert.match(viewerBridgeSource, /function ensureIndicatorRoot\(\)/)
  assert.match(viewerBridgeSource, /const container = document\.getElementById\('viewerContainer'\)/)
  assert.match(viewerBridgeSource, /container\.appendChild\(indicator\)/)
  assert.match(viewerBridgeSource, /function createIndicator\(type, scrollX, scrollY, widthPx, heightPx\)/)
  assert.match(viewerBridgeSource, /createIndicator\('circ', scrollX, scrollY\)/)
  assert.match(viewerCssSource, /#synctex-indicator/)
  assert.match(viewerCssSource, /\.synctex-indicator-rect/)
})
