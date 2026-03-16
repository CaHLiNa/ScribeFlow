import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReferenceKey } from '../src/utils/referenceKeys.js'

test('uses a safe fallback for non-Latin author names', () => {
  const key = buildReferenceKey({
    author: [{ family: '王' }],
    issued: { 'date-parts': [[2024]] },
    title: 'A practical survey of retrieval-augmented generation',
  })

  assert.match(key, /^[a-z][a-z0-9]*2024$/)
  assert.notEqual(key, '2024')
  assert.notEqual(key, '')
})

test('normalizes accented Latin names to ASCII', () => {
  const key = buildReferenceKey({
    author: [{ family: 'García' }],
    issued: { 'date-parts': [[2021]] },
  })

  assert.equal(key, 'garcia2021')
})

test('falls back to ref prefix when no ASCII author or title token exists', () => {
  const key = buildReferenceKey({
    author: [{ family: '张伟' }],
    title: '机器学习综述',
  })

  assert.equal(key, 'ref')
})

test('adds deterministic suffixes for duplicate bases', () => {
  const key = buildReferenceKey({
    author: [{ family: 'Smith' }],
    issued: { 'date-parts': [[2024]] },
  }, new Set(['smith2024']))

  assert.equal(key, 'smith2024a')
})
