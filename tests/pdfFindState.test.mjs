import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mapPdfFindControlState,
  normalizePdfFindMatchesCount,
} from '../src/services/pdfFindState.js'

const FIND_STATES = {
  FOUND: 0,
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3,
}

const STATE_MAP = {
  pendingState: FIND_STATES.PENDING,
  foundState: FIND_STATES.FOUND,
  notFoundState: FIND_STATES.NOT_FOUND,
  wrappedState: FIND_STATES.WRAPPED,
}

test('normalizes invalid or overflowing matches counts', () => {
  assert.deepEqual(
    normalizePdfFindMatchesCount({ current: 9, total: 3 }),
    { current: 3, total: 3 },
  )

  assert.deepEqual(
    normalizePdfFindMatchesCount({ current: -1, total: 0 }),
    { current: 0, total: 0 },
  )
})

test('maps pending find state', () => {
  assert.deepEqual(
    mapPdfFindControlState({
      state: FIND_STATES.PENDING,
      rawQuery: 'diffusion',
      matchesCount: { current: 0, total: 0 },
    }, STATE_MAP),
    {
      mode: 'pending',
      pending: true,
      notFound: false,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: { current: 0, total: 0 },
      query: 'diffusion',
    },
  )
})

test('maps not found state', () => {
  assert.deepEqual(
    mapPdfFindControlState({
      state: FIND_STATES.NOT_FOUND,
      rawQuery: 'missing phrase',
      matchesCount: { current: 0, total: 0 },
    }, STATE_MAP),
    {
      mode: 'not_found',
      pending: false,
      notFound: true,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: { current: 0, total: 0 },
      query: 'missing phrase',
    },
  )
})

test('maps wrapped state and preserves direction', () => {
  assert.deepEqual(
    mapPdfFindControlState({
      state: FIND_STATES.WRAPPED,
      previous: true,
      rawQuery: 'kernel',
      matchesCount: { current: 1, total: 4 },
    }, STATE_MAP),
    {
      mode: 'wrapped',
      pending: false,
      notFound: false,
      wrapped: true,
      wrappedPrevious: true,
      matchesCount: { current: 1, total: 4 },
      query: 'kernel',
    },
  )
})

test('returns idle when query is empty even if counts exist', () => {
  assert.deepEqual(
    mapPdfFindControlState({
      state: FIND_STATES.FOUND,
      rawQuery: '   ',
      matchesCount: { current: 2, total: 5 },
    }, STATE_MAP),
    {
      mode: 'idle',
      pending: false,
      notFound: false,
      wrapped: false,
      wrappedPrevious: false,
      matchesCount: { current: 2, total: 5 },
      query: '',
    },
  )
})
