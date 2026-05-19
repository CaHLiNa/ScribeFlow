import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildWorkbenchRailModeItems,
  buildWorkbenchRailTitleState,
  resolveWorkbenchRailLeftPadding,
  resolveWorkbenchRailStyle,
} from '../src/domains/workbench/workbenchRailPresentation.ts'
import {
  CONTEXT_DOCK_DOCUMENT,
  CONTEXT_DOCK_NONE,
  CONTEXT_DOCK_REFERENCE,
  WORKBENCH_MODE_DOCUMENTS,
  WORKBENCH_MODE_REFERENCES,
  WORKBENCH_MODE_SETTINGS,
  leftSidebarPanelForWorkbenchMode,
  resolveContextDockState,
  resolveWorkbenchMode,
} from '../src/domains/workbench/workbenchShellPresentation.ts'

assert.equal(
  resolveWorkbenchRailLeftPadding({
    isMac: false,
    isTauriDesktop: true,
    isNativeFullscreen: false,
  }),
  12,
)
assert.equal(
  resolveWorkbenchRailLeftPadding({
    isMac: true,
    isTauriDesktop: false,
    isNativeFullscreen: false,
  }),
  12,
)
assert.equal(
  resolveWorkbenchRailLeftPadding({
    isMac: true,
    isTauriDesktop: true,
    isNativeFullscreen: false,
  }),
  68,
)
assert.equal(
  resolveWorkbenchRailLeftPadding({
    isMac: true,
    isTauriDesktop: true,
    isNativeFullscreen: true,
  }),
  12,
)

assert.deepEqual(
  resolveWorkbenchRailStyle({
    isMac: true,
    isTauriDesktop: true,
    isNativeFullscreen: false,
  }),
  {
    '--rail-left-offset': '68px',
    '--rail-right-offset': '12px',
    height: '36px',
    minHeight: '36px',
  },
)

const labels = {
  Documents: 'Documents',
  References: 'References',
  Settings: 'Settings',
}
assert.deepEqual(
  buildWorkbenchRailModeItems({
    activeMode: WORKBENCH_MODE_REFERENCES,
    t: (key) => labels[key] || key,
  }),
  [
    {
      id: WORKBENCH_MODE_DOCUMENTS,
      label: 'Documents',
      active: false,
    },
    {
      id: WORKBENCH_MODE_REFERENCES,
      label: 'References',
      active: true,
    },
    {
      id: WORKBENCH_MODE_SETTINGS,
      label: 'Settings',
      active: false,
    },
  ],
)
assert.equal(
  buildWorkbenchRailModeItems({ activeMode: 'unknown' })
    .find((item) => item.id === WORKBENCH_MODE_DOCUMENTS)?.active,
  true,
)
assert.deepEqual(
  buildWorkbenchRailTitleState({
    currentDocumentLabel: 'paper.md',
    preferExternalDocumentTitle: false,
    showDocumentTitleTarget: true,
    workbenchMode: WORKBENCH_MODE_DOCUMENTS,
  }),
  {
    contextTitleLabel: '',
    documentTitleLabel: 'paper.md',
    showContextTitle: false,
    showDocumentTitleSlot: true,
    showInlineDocumentTitle: true,
  },
)
assert.deepEqual(
  buildWorkbenchRailTitleState({
    currentDocumentLabel: 'All references',
    preferExternalDocumentTitle: false,
    showDocumentTitleTarget: true,
    workbenchMode: WORKBENCH_MODE_REFERENCES,
  }),
  {
    contextTitleLabel: 'All references',
    documentTitleLabel: 'All references',
    showContextTitle: true,
    showDocumentTitleSlot: false,
    showInlineDocumentTitle: false,
  },
)
assert.equal(
  resolveWorkbenchMode({ isSettingsSurface: true, leftSidebarPanel: 'references' }),
  WORKBENCH_MODE_SETTINGS,
)
assert.equal(
  resolveWorkbenchMode({ isSettingsSurface: false, leftSidebarPanel: 'references' }),
  WORKBENCH_MODE_REFERENCES,
)
assert.equal(leftSidebarPanelForWorkbenchMode(WORKBENCH_MODE_REFERENCES), 'references')
assert.equal(leftSidebarPanelForWorkbenchMode(WORKBENCH_MODE_SETTINGS), 'files')
assert.deepEqual(
  resolveContextDockState({
    hasWorkspace: true,
    isWorkspaceSurface: true,
    workbenchMode: WORKBENCH_MODE_DOCUMENTS,
    documentDockOpen: true,
  }),
  {
    available: true,
    kind: CONTEXT_DOCK_DOCUMENT,
    open: true,
    labelKey: 'Document context',
    toggleLabelKey: 'Toggle document context',
  },
)
assert.deepEqual(
  resolveContextDockState({
    hasWorkspace: true,
    isWorkspaceSurface: true,
    workbenchMode: WORKBENCH_MODE_REFERENCES,
    referenceDockOpen: true,
  }),
  {
    available: true,
    kind: CONTEXT_DOCK_REFERENCE,
    open: true,
    labelKey: 'Reference detail',
    toggleLabelKey: 'Toggle reference detail',
  },
)
assert.equal(
  resolveContextDockState({
    hasWorkspace: true,
    isWorkspaceSurface: false,
    workbenchMode: WORKBENCH_MODE_SETTINGS,
  }).kind,
  CONTEXT_DOCK_NONE,
)

const componentSource = await readFile('src/components/layout/WorkbenchRail.vue', 'utf8')
const titleAreaSource = await readFile('src/components/layout/WorkbenchRailTitleArea.vue', 'utf8')
assert.match(
  componentSource,
  /from '..\/..\/domains\/workbench\/workbenchRailPresentation\.ts'/,
  'WorkbenchRail must use the pure rail presentation helper',
)
assert.match(
  componentSource,
  /<WorkbenchRailTitleArea[\s\S]*:rail-title-state="railTitleState"/,
  'WorkbenchRail must pass derived title state into WorkbenchRailTitleArea',
)
assert.match(
  componentSource,
  /v-for="item in workbenchModeItems"/,
  'WorkbenchRail must render the first-class workbench mode switcher from derived mode items',
)
assert.match(
  titleAreaSource,
  /railTitleState\.showContextTitle/,
  'WorkbenchRailTitleArea context title visibility must render from derived title state',
)
assert.doesNotMatch(
  componentSource,
  /const TOPBAR_HEIGHT|const MAC_TRAFFIC_LIGHT_SAFE_PADDING|const FULLSCREEN_LEFT_PADDING/,
  'WorkbenchRail must not own topbar padding constants inline',
)
assert.doesNotMatch(
  componentSource,
  /leftSidebarPanel === 'references'/,
  'WorkbenchRail must not duplicate active mode derivation in the template',
)
assert.doesNotMatch(
  titleAreaSource,
  /workspaceMenuOpen|workbench-mode-menu|Reference Library/,
  'WorkbenchRailTitleArea must not hide primary workbench navigation behind the title menu',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    macPadding: true,
    fullscreenPadding: true,
    railStyleDerived: true,
    modeItemsDerived: true,
    titleStateDerived: true,
    contextDockStateDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
