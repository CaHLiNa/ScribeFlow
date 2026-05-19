import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildWorkbenchRailModeItems,
  buildWorkbenchRailTitleState,
  resolveWorkbenchRailLeftPadding,
  resolveWorkbenchRailStyle,
} from '../src/domains/workbench/workbenchRailPresentation.ts'

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
  'Document Area': 'Documents',
  'Reference Library': 'References',
}
assert.deepEqual(
  buildWorkbenchRailModeItems({
    activePanel: 'references',
    t: (key) => labels[key] || key,
  }),
  [
    {
      id: 'files',
      label: 'Documents',
      active: false,
    },
    {
      id: 'references',
      label: 'References',
      active: true,
    },
  ],
)
assert.equal(
  buildWorkbenchRailModeItems({ activePanel: 'unknown' })
    .some((item) => item.active),
  false,
)
assert.deepEqual(
  buildWorkbenchRailTitleState({
    currentDocumentLabel: 'paper.md',
    leftSidebarAvailable: true,
    leftSidebarPanel: 'files',
    preferExternalDocumentTitle: false,
    showDocumentTitleTarget: true,
  }),
  {
    documentTitleLabel: 'paper.md',
    showDocumentTitleSlot: true,
    showInlineDocumentTitle: true,
    showReferenceTitle: false,
  },
)
assert.deepEqual(
  buildWorkbenchRailTitleState({
    currentDocumentLabel: 'paper.md',
    leftSidebarAvailable: true,
    leftSidebarPanel: 'references',
    preferExternalDocumentTitle: false,
    showDocumentTitleTarget: true,
  }),
  {
    documentTitleLabel: 'paper.md',
    showDocumentTitleSlot: false,
    showInlineDocumentTitle: false,
    showReferenceTitle: true,
  },
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
  /<WorkbenchRailTitleArea[\s\S]*:rail-title-state="railTitleState"[\s\S]*:workspace-mode-items="workspaceModeItems"/,
  'WorkbenchRail must pass derived title state and mode items into WorkbenchRailTitleArea',
)
assert.match(
  titleAreaSource,
  /v-for="item in workspaceModeItems"/,
  'WorkbenchRailTitleArea mode menu must render from derived mode items',
)
assert.match(
  titleAreaSource,
  /railTitleState\.showReferenceTitle/,
  'WorkbenchRailTitleArea title visibility must render from derived title state',
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

console.log(JSON.stringify({
  ok: true,
  summary: {
    macPadding: true,
    fullscreenPadding: true,
    railStyleDerived: true,
    modeItemsDerived: true,
    titleStateDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
