import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const requiredDocs = [
  ['docs/PRODUCT.md', '# Product'],
  ['docs/ARCHITECTURE.md', '# Architecture'],
  ['docs/ACADEMIC_PLATFORM_DIRECTION.md', '# Academic Platform Direction'],
  ['docs/DOMAINS.md', '# Domains'],
  ['docs/OPERATIONS.md', '# Operations'],
  ['docs/DATA_MODEL.md', '# Data Model'],
  ['docs/BUILD_SYSTEM.md', '# Build System'],
  ['docs/DOCUMENT_WORKFLOW.md', '# Document Workflow'],
  ['docs/CONTRIBUTING.md', '# Contributing'],
]

const requiredAgentFiles = [['AGENTS.md', '# Altals Agent Constitution']]

test('required top-level docs exist with the expected root headings', () => {
  for (const [relativePath, heading] of requiredDocs) {
    const absolutePath = path.join(repoRoot, relativePath)
    assert.equal(existsSync(absolutePath), true, `${relativePath} should exist`)
    const content = readFileSync(absolutePath, 'utf8')
    assert.equal(
      content.startsWith(`${heading}\n`),
      true,
      `${relativePath} should start with ${heading}`
    )
  }
})

test('required AGENTS files exist with the expected root headings', () => {
  for (const [relativePath, heading] of requiredAgentFiles) {
    const absolutePath = path.join(repoRoot, relativePath)
    assert.equal(existsSync(absolutePath), true, `${relativePath} should exist`)
    const content = readFileSync(absolutePath, 'utf8')
    assert.equal(
      content.startsWith(`${heading}\n`),
      true,
      `${relativePath} should start with ${heading}`
    )
  }
})
