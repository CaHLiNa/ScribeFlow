import test from 'node:test'
import assert from 'node:assert/strict'

import { ansiToHtml, escapeHtml } from '../src/domains/editor/cellOutputAnsiRuntime.js'

test('escapeHtml escapes angle brackets and ampersands', () => {
  assert.equal(escapeHtml('<a & b>'), '&lt;a &amp; b&gt;')
})

test('ansiToHtml keeps plain text escaped without inline style attributes', () => {
  const html = ansiToHtml('2 < 3')
  assert.equal(html, '2 &lt; 3')
  assert.equal(html.includes('style='), false)
})

test('ansiToHtml maps ansi codes to css classes instead of inline styles', () => {
  const html = ansiToHtml('plain \x1b[31;1malert\x1b[0m done')
  assert.equal(html.includes('style='), false)
  assert.match(html, /<span class="output-ansi-fg-31 output-ansi-bold">alert<\/span>/)
})

test('ansiToHtml closes open spans on reset and at end of string', () => {
  assert.equal(
    ansiToHtml('\x1b[32mok\x1b[0m tail'),
    '<span class="output-ansi-fg-32">ok</span> tail'
  )
  assert.equal(ansiToHtml('\x1b[4mnote'), '<span class="output-ansi-underline">note</span>')
})
