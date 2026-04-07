import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveTypstProjectGraph } from '../src/services/typst/projectGraph.js'
import { resolveLatexProjectGraph } from '../src/services/latex/projectGraph.js'

test('typst project graph prefers filesStore workspace snapshots for file enumeration', async () => {
  const snapshotCalls = []
  let ensureFlatFilesReadyCalls = 0

  const graph = await resolveTypstProjectGraph('/ws/main.typ', {
    workspacePath: '/ws',
    filesStore: {
      async readWorkspaceSnapshot() {
        snapshotCalls.push('snapshot')
        return {
          flatFiles: [
            { path: '/ws/main.typ' },
            { path: '/ws/sections/intro.typ' },
            { path: '/ws/typst.toml' },
          ],
        }
      },
      async ensureFlatFilesReady() {
        ensureFlatFilesReadyCalls += 1
        return []
      },
      fileContents: {
        '/ws/main.typ': '#include "sections/intro.typ"',
        '/ws/sections/intro.typ': '= Intro',
        '/ws/typst.toml': 'entrypoint = "main.typ"',
      },
    },
  })

  assert.equal(ensureFlatFilesReadyCalls, 0)
  assert.deepEqual(snapshotCalls, ['snapshot'])
  assert.equal(graph.rootPath, '/ws/main.typ')
  assert.deepEqual(graph.projectPaths, ['/ws/main.typ', '/ws/sections/intro.typ'])
})

test('latex project graph prefers filesStore workspace snapshots for file enumeration', async () => {
  const snapshotCalls = []
  let ensureFlatFilesReadyCalls = 0

  const graph = await resolveLatexProjectGraph('/ws/main.tex', {
    workspacePath: '/ws',
    filesStore: {
      async readWorkspaceSnapshot() {
        snapshotCalls.push('snapshot')
        return {
          flatFiles: [
            { path: '/ws/main.tex' },
            { path: '/ws/sections/intro.tex' },
            { path: '/ws/references.bib' },
          ],
        }
      },
      async ensureFlatFilesReady() {
        ensureFlatFilesReadyCalls += 1
        return []
      },
      fileContents: {
        '/ws/main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\bibliography{references}\n\\end{document}',
        '/ws/sections/intro.tex': '\\section{Intro}',
        '/ws/references.bib': '@article{key,title={Title}}',
      },
    },
  })

  assert.equal(ensureFlatFilesReadyCalls, 0)
  assert.deepEqual(snapshotCalls, ['snapshot'])
  assert.equal(graph.rootPath, '/ws/main.tex')
  assert.deepEqual(graph.projectPaths, ['/ws/main.tex', '/ws/sections/intro.tex'])
  assert.deepEqual(graph.bibliographyFiles, ['/ws/references.bib'])
})
