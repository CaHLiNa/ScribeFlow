import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeLatexWorkshopBackwardSync,
  computeLatexWorkshopForwardSync,
} from '../src/services/latex/latexWorkshopSynctex.js'

const SAMPLE_SYNCTEX = `SyncTeX Version:1
Input:1:/tmp/main.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
!782
{1
[1,7:4736286,49328947:30785865,44592661,0
(1,5:4736286,5391646:30785865,455111,0
h1,4:4736286,5391646:983040,0,0
x1,4:7193889,5391646
g1,4:7412342,5391646
x1,4:7885658,5391646
x1,4:9179997,5391646
)
(1,7:4736286,6178078:30785865,455111,0
h1,6:4736286,6178078:983040,0,0
x1,6:7721819,6178078
)
}1
`

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.05, `expected ${expected}, got ${actual}`)
}

test('latex-workshop forward sync resolves an exact line from synctex content', () => {
  const result = computeLatexWorkshopForwardSync(SAMPLE_SYNCTEX, '/tmp/main.tex', 4)
  assert.equal(result.page, 1)
  assertClose(result.x, 71.96221)
  assertClose(result.y, 81.96262)
})

test('latex-workshop forward sync interpolates between nearby lines', () => {
  const result = computeLatexWorkshopForwardSync(SAMPLE_SYNCTEX, '/tmp/main.tex', 5)
  assert.equal(result.page, 1)
  assertClose(result.x, 71.99999)
  assertClose(result.y, 87.94021)
})

test('latex-workshop backward sync resolves the nearest source line', () => {
  const result = computeLatexWorkshopBackwardSync(SAMPLE_SYNCTEX, 1, 71.96221, 81.96262)
  assert.equal(result.file, '/tmp/main.tex')
  assert.equal(result.line, 4)
})
