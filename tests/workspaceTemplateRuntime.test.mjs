import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getWorkspaceDocumentTemplate,
  listWorkspaceDocumentTemplates,
} from '../src/domains/workspace/workspaceTemplateRuntime.js'

test('workspace template runtime lists academic writing templates with localized labels', () => {
  const templates = listWorkspaceDocumentTemplates((value) => `x:${value}`)
  assert.deepEqual(
    templates.map((template) => template.id),
    ['markdown-note', 'latex-article', 'typst-paper'],
  )
  assert.equal(templates[0].label, 'x:Markdown note')
  assert.equal(templates[1].description, 'x:Article-style manuscript with title block and document shell.')
})

test('workspace template runtime resolves template payloads by id', () => {
  const latexTemplate = getWorkspaceDocumentTemplate('latex-article')
  assert.equal(latexTemplate.ext, '.tex')
  assert.match(latexTemplate.content, /\\documentclass\{article\}/)
  assert.equal(getWorkspaceDocumentTemplate('missing-template'), null)
})
