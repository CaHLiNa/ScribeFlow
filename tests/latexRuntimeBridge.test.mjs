import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveLatexCompileFail,
  resolveLatexCompileFinish,
  resolveLatexCompileStart,
} from '../src/services/latex/runtime.js'

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => ({ command, params: args.params || null }),
}

test('latex runtime bridge forwards compile start to Tauri', async () => {
  const result = await resolveLatexCompileStart({ texPath: '/workspace/main.tex' })
  assert.deepEqual(result, {
    command: 'latex_runtime_compile_start',
    params: { texPath: '/workspace/main.tex' },
  })
})

test('latex runtime bridge forwards compile finish to Tauri', async () => {
  const result = await resolveLatexCompileFinish({ targetPath: '/workspace/main.tex' })
  assert.deepEqual(result, {
    command: 'latex_runtime_compile_finish',
    params: { targetPath: '/workspace/main.tex' },
  })
})

test('latex runtime bridge forwards compile fail to Tauri', async () => {
  const result = await resolveLatexCompileFail({ targetPath: '/workspace/main.tex' })
  assert.deepEqual(result, {
    command: 'latex_runtime_compile_fail',
    params: { targetPath: '/workspace/main.tex' },
  })
})
