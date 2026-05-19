import assert from 'node:assert/strict'
import { loadExtensionTextPreviewContent } from '../src/services/extensions/extensionTextPreview.ts'

async function main() {
  const calls = []

  const inline = await loadExtensionTextPreviewContent({
    inlineText: 'inline preview',
    previewPath: '/tmp/ignored.txt',
    readWorkspaceText: async () => {
      throw new Error('workspace reader should not be called for inline text')
    },
    readArtifactText: async () => {
      throw new Error('artifact reader should not be called for inline text')
    },
  })
  assert.equal(inline, 'inline preview')

  const workspaceContent = await loadExtensionTextPreviewContent({
    previewPath: '/tmp/workspace-preview.txt',
    readWorkspaceText: async (path, maxBytes) => {
      calls.push(['workspace', path, maxBytes])
      return 'workspace preview'
    },
    readArtifactText: async () => {
      throw new Error('artifact reader should not be called when workspace read succeeds')
    },
  })
  assert.equal(workspaceContent, 'workspace preview')

  const artifactFallback = await loadExtensionTextPreviewContent({
    previewPath: '/tmp/artifact-preview.txt',
    readWorkspaceText: async (path, maxBytes) => {
      calls.push(['workspace-fail', path, maxBytes])
      throw new Error('outside workspace roots')
    },
    readArtifactText: async (artifact, maxBytes) => {
      calls.push(['artifact', artifact.path, maxBytes])
      return 'artifact preview'
    },
  })
  assert.equal(artifactFallback, 'artifact preview')

  const terminalError = await loadExtensionTextPreviewContent({
    previewPath: '/tmp/missing-preview.txt',
    readWorkspaceText: async () => {
      throw new Error('workspace denied')
    },
    readArtifactText: async () => {
      throw new Error('Artifact path does not exist: /tmp/missing-preview.txt')
    },
  })
  assert.equal(terminalError, 'Artifact path does not exist: /tmp/missing-preview.txt')

  assert.deepEqual(calls, [
    ['workspace', '/tmp/workspace-preview.txt', 4000],
    ['workspace-fail', '/tmp/artifact-preview.txt', 4000],
    ['artifact', '/tmp/artifact-preview.txt', 4000],
  ])

  console.log(JSON.stringify({
    ok: true,
    workspacePreview: workspaceContent,
    artifactFallback,
    terminalError,
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
})
