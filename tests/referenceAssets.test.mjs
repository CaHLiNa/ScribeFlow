import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveGlobalReferenceFulltextDir,
  resolveGlobalReferencePdfsDir,
  resolveGlobalReferencesDir,
} from '../src/services/references/referenceAssets.js'

test('reference asset directories resolve inside the app global config directory', () => {
  assert.equal(resolveGlobalReferencesDir('/tmp/.altals'), '/tmp/.altals/references')
  assert.equal(resolveGlobalReferencePdfsDir('/tmp/.altals'), '/tmp/.altals/references/pdfs')
  assert.equal(
    resolveGlobalReferenceFulltextDir('/tmp/.altals'),
    '/tmp/.altals/references/fulltext'
  )
})
