import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

function cssRuleBlock(source = '', selector = '') {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || ''
}

try {
  const {
    isWorkspaceDocumentPath,
    resolvePaneDockContextPath,
    resolvePaneDocumentDockOpen,
    resolvePaneDocumentTab,
  } = await vite.ssrLoadModule('/src/domains/editor/paneDocumentDockRuntime.ts')

  assert.equal(isWorkspaceDocumentPath('/tmp/workspace/paper.md', '/tmp/workspace'), true)
  assert.equal(isWorkspaceDocumentPath('/tmp/workspace-other/paper.md', '/tmp/workspace'), false)
  assert.equal(isWorkspaceDocumentPath('preview:/tmp/workspace/paper.md', '/tmp/workspace'), false)
  assert.equal(isWorkspaceDocumentPath('newtab:abc', '/tmp/workspace'), false)
  assert.equal(isWorkspaceDocumentPath('/tmp/workspace/paper.md', ''), false)

  assert.equal(
    resolvePaneDocumentTab({
      activeTab: 'newtab:abc',
      lastDocumentTab: '/tmp/workspace/paper.md',
      workspacePath: '/tmp/workspace',
    }),
    '/tmp/workspace/paper.md',
  )
  assert.equal(
    resolvePaneDocumentTab({
      activeTab: null,
      lastDocumentTab: '/tmp/closed-workspace/paper.md',
      workspacePath: '',
    }),
    null,
  )

  assert.equal(
    resolvePaneDockContextPath({
      documentTab: null,
      activeDocumentDockTab: '/tmp/workspace/active.md',
      documentDockTabs: ['/tmp/workspace/fallback.md'],
      workspacePath: '/tmp/workspace',
    }),
    '/tmp/workspace/active.md',
  )
  assert.equal(
    resolvePaneDockContextPath({
      documentTab: null,
      activeDocumentDockTab: '/tmp/closed-workspace/active.md',
      documentDockTabs: ['/tmp/closed-workspace/fallback.md'],
      workspacePath: '',
    }),
    '',
  )
  assert.equal(
    resolvePaneDocumentDockOpen({
      hasWorkspace: false,
      isWorkspaceSurface: true,
      isReferencePanel: false,
      documentDockOpen: true,
      activeDocumentPreviewOpen: true,
    }),
    false,
  )
  assert.equal(
    resolvePaneDocumentDockOpen({
      hasWorkspace: true,
      isWorkspaceSurface: true,
      isReferencePanel: false,
      documentDockOpen: true,
      activeDocumentPreviewOpen: false,
    }),
    true,
  )
  assert.equal(
    resolvePaneDocumentDockOpen({
      hasWorkspace: true,
      isWorkspaceSurface: true,
      isReferencePanel: true,
      documentDockOpen: true,
      activeDocumentPreviewOpen: true,
    }),
    false,
  )
  assert.equal(
    resolvePaneDockContextPath({
      documentTab: null,
      activeDocumentDockTab: '/tmp/workspace-other/active.md',
      documentDockTabs: ['/tmp/workspace/fallback.md'],
      workspacePath: '/tmp/workspace',
    }),
    '/tmp/workspace/fallback.md',
  )

  const editorCss = await readFile('src/css/editor.css', 'utf8')
  const layoutSource = await readFile('src/composables/useAppShellLayout.ts', 'utf8')
  const paneContainerSource = await readFile('src/components/editor/PaneContainer.vue', 'utf8')
  for (const selector of [
    '.workbench-inline-dock-region',
    '.workbench-inline-dock-region > .inline-dock',
  ]) {
    const block = cssRuleBlock(editorCss, selector)
    assert.doesNotMatch(
      block,
      /transform\s*:\s*translateX\(0\)|will-change\s*:\s*[^;]*\btransform\b/,
      `${selector} must not keep an idle compositor layer during native window resize`,
    )
  }

  const dockRegionBlock = cssRuleBlock(editorCss, '.workbench-inline-dock-region')
  assert.match(
    dockRegionBlock,
    /flex:\s*0 0 var\(--inline-dock-frame-width/,
    'inline dock region must use the frame width as its fixed flex basis',
  )
  assert.match(
    dockRegionBlock,
    /box-sizing:\s*border-box/,
    'inline dock region width must include its divider border',
  )

  const dockContentBlock = cssRuleBlock(editorCss, '.workbench-inline-dock-region > .inline-dock')
  assert.match(
    dockContentBlock,
    /width:\s*100%/,
    'inline dock content must stay pinned to the frame width instead of owning a second width',
  )
  assert.doesNotMatch(
    dockContentBlock,
    /min-width:\s*var\(--inline-dock-current-width/,
    'inline dock content must not keep a second min-width that can drift from the frame',
  )

  assert.match(
    layoutSource,
    /function setDocumentDockWidth\([^)]*\) \{\s*commitDocumentDockWidth\(value, containerWidth, options\)\s*documentDockPreSnapWidth\.value = null\s*\}/,
    'document dock drag resize must commit width synchronously',
  )
  assert.match(
    layoutSource,
    /function setReferenceDockWidth\([^)]*\) \{\s*commitReferenceDockWidth\(value, containerWidth, options\)\s*referenceDockPreSnapWidth\.value = null\s*\}/,
    'reference dock drag resize must commit width synchronously',
  )
  assert.doesNotMatch(
    layoutSource,
    /scheduleDocumentDockWidth|scheduleReferenceDockWidth|DOCUMENT_DOCK_WIDTH_MOTION_KEY|REFERENCE_DOCK_WIDTH_MOTION_KEY/,
    'right inline dock widths must not be delayed through the shell motion scheduler',
  )

  assert.match(
    paneContainerSource,
    /\.pane-container__editor\s*\{[\s\S]*flex:\s*1 1 0;/,
    'editor column must use a zero flex basis so dock resizing is not driven by editor intrinsic width',
  )

  console.log('pane document dock workspace contract probe passed')
} finally {
  await vite.close()
}
