import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeExtensionContributions } from '../src/domains/extensions/extensionContributionRegistry.ts'
import { inspectExtensionCapability } from '../src/domains/extensions/extensionCapabilitySchema.ts'

const repoRoot = process.cwd()

async function readManifest(relativePath) {
  const manifestPath = path.join(repoRoot, relativePath)
  return JSON.parse(await readFile(manifestPath, 'utf8'))
}

function capabilityById(manifest, extensionId, capabilityId) {
  const contributions = normalizeExtensionContributions({
    id: extensionId,
    manifest,
  })
  const capability = contributions.capabilities.find((entry) => entry.id === capabilityId)
  assert.ok(capability, `missing capability ${capabilityId}`)
  return capability
}

async function main() {
  const pdfManifest = await readManifest('.scribeflow/extensions/example-pdf-extension/package.json')
  const markdownManifest = await readManifest('.scribeflow/extensions/example-markdown-extension/package.json')

  const pdfCapability = capabilityById(pdfManifest, 'example-pdf-extension', 'pdf.translate')
  const markdownCapability = capabilityById(markdownManifest, 'example-markdown-extension', 'document.summarize')

  assert.deepEqual(Object.keys(pdfCapability.inputs), ['document', 'reference'])
  assert.deepEqual(Object.keys(pdfCapability.outputs), ['summary', 'resultCard', 'translatedPdf'])
  assert.deepEqual(Object.keys(markdownCapability.inputs), ['document'])
  assert.deepEqual(Object.keys(markdownCapability.outputs), ['summary'])

  const pdfReady = inspectExtensionCapability(
    pdfCapability,
    {
      kind: 'referencePdf',
      referenceId: 'ref-123',
      path: '/tmp/paper.pdf',
    },
    { workspaceReady: true },
  )
  const pdfWrongFile = inspectExtensionCapability(
    pdfCapability,
    {
      kind: 'workspace',
      referenceId: '',
      path: '/tmp/notes.md',
    },
    { workspaceReady: true },
  )
  const markdownReady = inspectExtensionCapability(
    markdownCapability,
    {
      kind: 'workspace',
      referenceId: '',
      path: '/tmp/notes.md',
    },
    { workspaceReady: true },
  )
  const markdownMissingWorkspace = inspectExtensionCapability(
    markdownCapability,
    {
      kind: 'workspace',
      referenceId: '',
      path: '/tmp/notes.md',
    },
    { workspaceReady: false },
  )

  assert.equal(pdfReady.ready, true)
  assert.equal(pdfWrongFile.ready, false)
  assert.equal(pdfWrongFile.messageKey, 'Requires one of: {extensions}')
  assert.equal(markdownReady.ready, true)
  assert.equal(markdownMissingWorkspace.ready, false)
  assert.equal(markdownMissingWorkspace.messageKey, 'Requires an open workspace')

  console.log(JSON.stringify({
    ok: true,
    summary: {
      pdfInputs: Object.keys(pdfCapability.inputs),
      pdfOutputs: Object.keys(pdfCapability.outputs),
      markdownInputs: Object.keys(markdownCapability.inputs),
      markdownOutputs: Object.keys(markdownCapability.outputs),
      pdfReady: pdfReady.ready,
      markdownReady: markdownReady.ready,
      markdownMissingWorkspace: markdownMissingWorkspace.messageKey,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
})
