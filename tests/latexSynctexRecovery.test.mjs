import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLatexSynctexCandidates,
  resolveExistingLatexSynctexPath,
} from '../src/services/latex/synctex.js'

test('latex synctex recovery derives sibling synctex candidates from a pdf artifact', () => {
  assert.deepEqual(
    buildLatexSynctexCandidates('/workspace/build/main.pdf'),
    ['/workspace/build/main.synctex.gz', '/workspace/build/main.synctex'],
  )
})

test('latex synctex recovery prefers the first existing sibling candidate', async () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => cmd === 'path_exists' && args?.path === '/workspace/build/main.synctex.gz',
    },
  }

  try {
    const resolved = await resolveExistingLatexSynctexPath('/workspace/build/main.pdf')
    assert.equal(resolved, '/workspace/build/main.synctex.gz')
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})
