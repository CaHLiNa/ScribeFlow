import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { computed } from 'vue'
import { createLogger, createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

function assertSync(value, label) {
  assert.equal(typeof value?.then, 'undefined', `${label} leaked a Promise`)
  return value
}

try {
  const fileTypes = await vite.ssrLoadModule('/src/utils/fileTypes.ts')
  const pathUtils = await vite.ssrLoadModule('/src/utils/path.ts')
  const workspaceProtocol = await vite.ssrLoadModule('/src/utils/workspaceProtocol.ts')
  const fileMetadata = await vite.ssrLoadModule('/src/composables/useFileMetadata.ts')
  const { createFileContentRuntime } = await vite.ssrLoadModule('/src/domains/files/fileContentRuntime.ts')
  const { activateOrOpenPaneTab } = await vite.ssrLoadModule('/src/domains/editor/paneTabs.ts')
  const { resolveDocumentWorkspaceTextRoute } = await vite.ssrLoadModule(
    '/src/domains/document/documentWorkspacePreviewRuntime.ts',
  )
  const { resolveExtensionTargetContext } = await vite.ssrLoadModule(
    '/src/domains/extensions/extensionTargetContext.ts',
  )
  const {
    getDocumentWorkflowKind,
    isDocumentWorkflowSource,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
  } = await vite.ssrLoadModule('/src/domains/document/documentWorkflowPolicy.ts')

  assert.equal(assertSync(fileTypes.isNewTab('newtab:home'), 'isNewTab'), true)
  assert.equal(assertSync(fileTypes.isPreviewPath('preview:/tmp/a.md'), 'isPreviewPath'), true)
  assert.equal(
    assertSync(fileTypes.previewSourcePathFromPath('preview:/tmp/a.md'), 'previewSourcePathFromPath'),
    '/tmp/a.md',
  )
  assert.equal(assertSync(fileTypes.isMarkdown('/tmp/a.qmd'), 'isMarkdown'), true)
  assert.equal(assertSync(fileTypes.isLatex('/tmp/main.tex'), 'isLatex'), true)
  assert.equal(assertSync(fileTypes.getViewerType('/tmp/main.md'), 'getViewerType'), 'text')
  assert.equal(assertSync(fileTypes.getViewerType('preview:/tmp/main.md'), 'getViewerType preview'), 'markdown-preview')
  assert.equal(assertSync(fileTypes.getFileIconName('paper.tex'), 'getFileIconName'), 'IconMath')
  assert.equal(assertSync(fileTypes.isBinaryFile('/tmp/paper.pdf'), 'isBinaryFile'), true)
  assert.equal(assertSync(fileTypes.isBinaryFile('/tmp/note.md'), 'isBinaryFile markdown'), false)

  const storeSource = await readFile(new URL('../src/stores/files.ts', import.meta.url), 'utf8')
  assert.match(
    storeSource,
    /isBinaryPath:\s*\(path\)\s*=>\s*isBinaryFile\(path\)/,
    'files store must pass the synchronous binary predicate into file content runtime',
  )
  assert.doesNotMatch(
    storeSource,
    /isBinaryPath:\s*async\b/,
    'async binary predicate makes every file look binary before editor read',
  )

  const runtimeReadCalls = []
  const runtimeCache = {}
  const textRuntime = createFileContentRuntime({
    readTextFile: async (path) => {
      runtimeReadCalls.push(path)
      return '# Rendered editor content'
    },
    isBinaryPath: fileTypes.isBinaryFile,
    setFileContent: (path, content) => {
      runtimeCache[path] = content
    },
  })
  const markdownContent = await textRuntime.readFile('/tmp/project/note.md')
  assert.equal(markdownContent, '# Rendered editor content')
  assert.equal(runtimeCache['/tmp/project/note.md'], '# Rendered editor content')
  assert.deepEqual(runtimeReadCalls, ['/tmp/project/note.md'])
  const pdfContent = await textRuntime.readFile('/tmp/project/paper.pdf')
  assert.equal(pdfContent, null)
  assert.deepEqual(runtimeReadCalls, ['/tmp/project/note.md'])

  assert.equal(assertSync(pathUtils.basenamePath('/tmp/project/paper.md'), 'basenamePath'), 'paper.md')
  assert.equal(assertSync(pathUtils.dirnamePath('/tmp/project/paper.md'), 'dirnamePath'), '/tmp/project')
  assert.equal(
    assertSync(pathUtils.resolveRelativePath('/tmp/project/notes', '../paper.md'), 'resolveRelativePath'),
    '/tmp/project/paper.md',
  )
  assert.equal(assertSync(pathUtils.stripExtension('/tmp/project/paper.md'), 'stripExtension'), 'paper')

  const workspaceUrl = workspaceProtocol.toWorkspaceProtocolUrl('/tmp/project/notes/a.md', {
    path: '/tmp/project',
    workspaceDataDir: '/tmp/data',
    globalConfigDir: '/tmp/global',
  })
  assert.equal(typeof workspaceUrl?.then, 'undefined')
  assert.equal(workspaceUrl, 'scribeflow-workspace://localhost/workspace/notes/a.md')

  const pane = { type: 'leaf', activeTab: 'newtab:home', tabs: ['newtab:home'] }
  const opened = activateOrOpenPaneTab(pane, '/tmp/project/a.md')
  assert.equal(typeof opened?.then, 'undefined')
  assert.equal(opened, true)
  assert.deepEqual(pane.tabs, ['/tmp/project/a.md'])
  assert.equal(pane.activeTab, '/tmp/project/a.md')

  const route = resolveDocumentWorkspaceTextRoute({
    activeTab: '/tmp/project/main.tex',
    viewerType: 'text',
    documentPreviewState: { previewMode: 'pdf-artifact', previewTargetPath: '/tmp/project/main.pdf' },
    workflowUiState: { kind: 'latex' },
  })
  assert.equal(typeof route?.then, 'undefined')
  assert.equal(route.useWorkspaceSurface, true)
  assert.equal(route.previewMode, 'pdf-artifact')

  const target = resolveExtensionTargetContext({
    activeTab: 'preview:/tmp/project/note.md',
  })
  assert.equal(typeof target?.then, 'undefined')
  assert.deepEqual(target, {
    kind: 'workspace',
    referenceId: '',
    path: '/tmp/project/note.md',
  })

  assert.equal(assertSync(getDocumentWorkflowKind('/tmp/project/note.md'), 'getDocumentWorkflowKind'), 'markdown')
  assert.equal(assertSync(getDocumentWorkflowKind('preview:/tmp/project/note.md'), 'getDocumentWorkflowKind preview'), null)
  assert.equal(assertSync(isDocumentWorkflowSource('/tmp/project/main.tex'), 'isDocumentWorkflowSource'), true)
  assert.equal(
    assertSync(getPreferredWorkflowPreviewKind('markdown', { markdown: { preferredPreview: 'html' } }), 'getPreferredWorkflowPreviewKind'),
    'html',
  )
  assert.equal(
    assertSync(createWorkflowPreviewPath('/tmp/project/note.md', 'markdown', 'html'), 'createWorkflowPreviewPath'),
    'preview:/tmp/project/note.md',
  )

  const viewerType = computed(() => fileTypes.getViewerType('preview:/tmp/project/note.md'))
  const fileName = computed(() => pathUtils.basenamePath('/tmp/project/note.md'))
  const workflowKind = computed(() => getDocumentWorkflowKind('/tmp/project/note.md'))
  const filePathRef = computed(() => '/tmp/project/note.md')
  const basenameRef = fileMetadata.useBasename(filePathRef)
  const metadata = fileMetadata.useFileMetadata(filePathRef)
  assert.equal(viewerType.value, 'markdown-preview')
  assert.equal(fileName.value, 'note.md')
  assert.equal(workflowKind.value, 'markdown')
  assert.equal(assertSync(basenameRef.value, 'useBasename value'), 'note.md')
  assert.equal(assertSync(metadata.basename.value, 'useFileMetadata basename'), 'note.md')
  assert.equal(assertSync(metadata.dirname.value, 'useFileMetadata dirname'), '/tmp/project')
  assert.equal(assertSync(metadata.classification.value?.viewerType, 'useFileMetadata classification'), 'text')

  console.log('sync domain contracts probe passed')
} finally {
  await vite.close()
}
