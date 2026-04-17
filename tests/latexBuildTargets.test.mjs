import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveLatexCompileTargetsForChange } from '../src/services/latex/projectGraph.js'

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command !== 'latex_compile_targets_resolve') {
      throw new Error(`Unexpected invoke command: ${command}`)
    }
    return [
      {
        sourcePath: args.params?.changedPath === '/workspace/refs.bib'
          ? '/workspace/main.tex'
          : args.params?.changedPath,
        rootPath: '/workspace/main.tex',
        previewPath: '/workspace/main.pdf',
      },
      {
        sourcePath: '/workspace/main.tex',
        rootPath: '/workspace/main.tex',
        previewPath: '/workspace/main.pdf',
      },
    ]
  },
}

test('latex compile targets bridge normalizes and deduplicates Rust results', async () => {
  const result = await resolveLatexCompileTargetsForChange('/workspace/refs.bib', {
    flatFiles: ['/workspace/main.tex', '/workspace/refs.bib'],
  })

  assert.deepEqual(result, [
    {
      sourcePath: '/workspace/main.tex',
      rootPath: '/workspace/main.tex',
      previewPath: '/workspace/main.pdf',
    },
  ])
})
