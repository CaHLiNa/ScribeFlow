import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveLatexEditorSelectionFromContext,
  resolveLatexSyncTargetPath,
} from '../src/services/latex/previewSync.js'

test('latex backward sync resolves relative targets against the compile root first', () => {
  const resolved = resolveLatexSyncTargetPath('sections/chapter1.tex', {
    sourcePath: '/workspace/notes/chapter1.tex',
    compileTargetPath: '/workspace/thesis/main.tex',
    workspacePath: '/workspace',
  })

  assert.equal(resolved, '/workspace/thesis/sections/chapter1.tex')
})

test('latex backward sync preserves absolute targets', () => {
  const resolved = resolveLatexSyncTargetPath('/workspace/thesis/main.tex', {
    sourcePath: '/workspace/thesis/intro.tex',
    compileTargetPath: '/workspace/thesis/main.tex',
    workspacePath: '/workspace',
  })

  assert.equal(resolved, '/workspace/thesis/main.tex')
})

test('latex backward sync collapses dot segments in reported absolute paths', () => {
  const resolved = resolveLatexSyncTargetPath('/workspace/thesis/./chapters/../main.tex', {
    sourcePath: '/workspace/thesis/intro.tex',
    compileTargetPath: '/workspace/thesis/main.tex',
    workspacePath: '/workspace',
  })

  assert.equal(resolved, '/workspace/thesis/main.tex')
})

test('latex backward sync falls back to source directory when no compile target exists', () => {
  const resolved = resolveLatexSyncTargetPath('appendix.tex', {
    sourcePath: '/workspace/thesis/chapters/chapter1.tex',
    workspacePath: '/workspace',
  })

  assert.equal(resolved, '/workspace/thesis/chapters/appendix.tex')
})

function createMockView(lines) {
  const normalizedLines = [...lines]
  const offsets = []
  let cursor = 0
  for (const line of normalizedLines) {
    offsets.push(cursor)
    cursor += line.length + 1
  }
  return {
    state: {
      doc: {
        lines: normalizedLines.length,
        line(number) {
          const index = number - 1
          return {
            number,
            text: normalizedLines[index],
            from: offsets[index],
            to: offsets[index] + normalizedLines[index].length,
          }
        },
      },
    },
  }
}

test('latex backward sync resolves a better column from surrounding selection text', () => {
  const view = createMockView([
    '\\section{Intro}',
    'The quick brown fox jumps over the lazy dog.',
    '\\end{document}',
  ])

  const resolved = resolveLatexEditorSelectionFromContext(view, {
    line: 2,
    column: 0,
    textBeforeSelection: 'quick brown fox',
    textAfterSelection: ' jumps over',
  })

  assert.equal(resolved.lineNumber, 2)
  assert.equal(resolved.from, view.state.doc.line(2).from + 19)
})

test('latex backward sync checks adjacent lines when the reported line is slightly off', () => {
  const view = createMockView([
    '\\begin{itemize}',
    '\\item alpha beta gamma delta',
    '\\end{itemize}',
  ])

  const resolved = resolveLatexEditorSelectionFromContext(view, {
    line: 1,
    column: 0,
    textBeforeSelection: 'alpha beta',
    textAfterSelection: ' gamma delta',
  })

  assert.equal(resolved.lineNumber, 2)
  assert.equal(resolved.from, view.state.doc.line(2).from + 16)
})

test('latex backward sync prefers surrounding text over an explicit but stale column', () => {
  const view = createMockView([
    '\\begin{itemize}',
    '\\item first bullet content here',
    '\\item second bullet content here',
    '\\end{itemize}',
  ])

  const resolved = resolveLatexEditorSelectionFromContext(view, {
    line: 3,
    column: 8,
    textBeforeSelection: 'first bullet',
    textAfterSelection: ' content here',
  })

  assert.equal(resolved.lineNumber, 2)
  assert.equal(resolved.from, view.state.doc.line(2).from + 18)
})
