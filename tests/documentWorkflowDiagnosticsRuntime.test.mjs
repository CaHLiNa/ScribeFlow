import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorkflowPhaseLabel,
  buildWorkflowProblemSummary,
  buildWorkflowStatusText,
  summarizeWorkflowProblems,
} from '../src/domains/document/documentWorkflowDiagnosticsRuntime.js'

const t = (value, params = {}) =>
  String(value || '').replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))

test('workflow diagnostics runtime summarizes error and warning counts', () => {
  const summary = summarizeWorkflowProblems([
    { severity: 'error', message: 'Missing file' },
    { severity: 'warning', message: 'Unknown citation key' },
    { severity: 'warning', message: 'Heading jump' },
  ])

  assert.deepEqual(summary, {
    totalCount: 3,
    errorCount: 1,
    warningCount: 2,
    hasProblems: true,
  })
})

test('workflow diagnostics runtime builds human-readable problem summaries', () => {
  assert.equal(buildWorkflowProblemSummary([], t), 'No current issues')
  assert.equal(
    buildWorkflowProblemSummary(
      [
        { severity: 'error', message: 'Missing file' },
        { severity: 'warning', message: 'Unknown citation key' },
      ],
      t,
    ),
    '1 errors · 1 warnings',
  )
})

test('workflow diagnostics runtime exposes normalized phase labels', () => {
  assert.equal(buildWorkflowPhaseLabel({ phase: 'compiling' }, t), 'Compiling')
  assert.equal(buildWorkflowPhaseLabel({ phase: 'queued' }, t), 'Queued')
  assert.equal(buildWorkflowPhaseLabel({ phase: 'error' }, t), 'Needs attention')
  assert.equal(buildWorkflowPhaseLabel({ phase: 'idle' }, t), 'Idle')
})

test('workflow diagnostics runtime prefers workflow status text and falls back when absent', () => {
  assert.equal(
    buildWorkflowStatusText({
      filePath: '/workspace/paper.tex',
      workflowStore: {
        getStatusTextForFile() {
          return 'Compiling...'
        },
      },
      context: {},
      t,
    }),
    'Compiling...',
  )

  assert.equal(
    buildWorkflowStatusText({
      filePath: '/workspace/paper.tex',
      workflowStore: {
        getStatusTextForFile() {
          return ''
        },
      },
      context: {},
      fallback: 'Idle',
      t,
    }),
    'Idle',
  )
})
