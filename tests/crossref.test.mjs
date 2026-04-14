import test from 'node:test'
import assert from 'node:assert/strict'

import { crossrefToCsl } from '../src/services/references/crossref.js'

test('crossrefToCsl maps CrossRef work records into CSL', () => {
  const csl = crossrefToCsl({
    type: 'journal-article',
    title: ['Control Barrier Functions'],
    DOI: '10.1109/TAC.2014.1234567',
    author: [{ family: 'Ames', given: 'Aaron D.' }],
    issued: { 'date-parts': [[2014]] },
    'container-title': ['IEEE Transactions on Automatic Control'],
    volume: '59',
    issue: '8',
    page: '123-130',
    publisher: 'IEEE',
  })

  assert.equal(csl.type, 'article-journal')
  assert.equal(csl.title, 'Control Barrier Functions')
  assert.equal(csl.author[0].family, 'Ames')
  assert.equal(csl['container-title'], 'IEEE Transactions on Automatic Control')
})
