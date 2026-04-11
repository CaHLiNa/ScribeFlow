import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SCROLL_DEBOUNCE_MS,
  buildPreviewDocumentCacheKey,
  patchTypstPreviewDocumentHtml,
} from '../src/services/typst/previewDocument.js'

test('patchTypstPreviewDocumentHtml rewrites Tinymist websocket bootstrap to the preview base URL', () => {
  const html = `
    <script>
      let urlObject = new URL("/", window.location.href);
    </script>
  `

  const result = patchTypstPreviewDocumentHtml(html, {
    previewBaseUrl: 'http://127.0.0.1:23625',
  })

  assert.match(
    result.html,
    /let urlObject = new URL\("http:\/\/127\.0\.0\.1:23625\/", window\.location\.href\);/,
  )
  assert.equal(result.patched, true)
})

test('patchTypstPreviewDocumentHtml lowers the preview scroll debounce for viewport updates', () => {
  const html = `
    <script>
      fromEvent(resizeTarget, "scroll").pipe(debounceTime(500)).subscribe(() => svgDoc.addViewportChange())
    </script>
  `

  const result = patchTypstPreviewDocumentHtml(html)

  assert.match(result.html, new RegExp(`debounceTime\\(${DEFAULT_SCROLL_DEBOUNCE_MS}\\)`))
  assert.doesNotMatch(result.html, /fromEvent\(resizeTarget, "wheel"\)/)
  assert.equal(result.patched, true)
})

test('patchTypstPreviewDocumentHtml removes pseudo-link hover listeners from embedded preview documents', () => {
  const html = `
    <script>
      elem.addEventListener("mousemove", mouseMoveToLink);
      elem.addEventListener("mouseleave", mouseLeaveFromLink);
    </script>
  `

  const result = patchTypstPreviewDocumentHtml(html)

  assert.doesNotMatch(result.html, /mouseMoveToLink/)
  assert.doesNotMatch(result.html, /mouseLeaveFromLink/)
  assert.equal(result.patched, true)
})

test('patchTypstPreviewDocumentHtml forces a paper-colored app background to avoid dark page gaps', () => {
  const html = `
    <div id="typst-app" style="background-color: var(--typst-preview-background-color) !important;"></div>
  `

  const result = patchTypstPreviewDocumentHtml(html)

  assert.match(result.html, /background-color: #fff !important;/)
  assert.doesNotMatch(result.html, /var\(--typst-preview-background-color\)/)
  assert.equal(result.patched, true)
})

test('patchTypstPreviewDocumentHtml leaves unrelated html unchanged when preview markers are absent', () => {
  const html = '<html><body>plain preview shell</body></html>'

  const result = patchTypstPreviewDocumentHtml(html, {
    previewBaseUrl: 'http://127.0.0.1:23625',
  })

  assert.equal(result.html, html)
  assert.equal(result.patched, false)
})

test('buildPreviewDocumentCacheKey normalizes preview URLs and debounce settings', () => {
  assert.equal(
    buildPreviewDocumentCacheKey('http://127.0.0.1:23625', {}),
    `http://127.0.0.1:23625/::v3::${DEFAULT_SCROLL_DEBOUNCE_MS}`,
  )
  assert.equal(
    buildPreviewDocumentCacheKey('http://127.0.0.1:23625/', { scrollDebounceMs: 120 }),
    'http://127.0.0.1:23625/::v3::120',
  )
})
