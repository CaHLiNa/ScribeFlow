import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildExtensionSidebarHeaderActionsState,
  extensionSidebarViewKey,
  isExtensionSidebarActiveResultEntry,
  isExtensionSidebarTreeItemExpandable,
  isExtensionSidebarTreeItemExpanded,
  resolveExtensionSidebarActiveResultEntry,
  resolveExtensionSidebarItemExpansionKey,
  resolveExtensionSidebarPanelExtensionName,
  resolveExtensionSidebarPanelTitle,
  resolveExtensionSidebarResultActionKey,
  resolveExtensionSidebarResultActionMessageKey,
  resolveExtensionSidebarViewPresentation,
} from '../src/domains/extensions/extensionSidebarPresentation.js'

assert.equal(
  extensionSidebarViewKey({ extensionId: ' example-extension ', id: ' tools ' }),
  'example-extension:tools',
)
assert.equal(
  resolveExtensionSidebarPanelTitle({
    container: { title: ' PDF Tools ' },
    translate: (key) => `t:${key}`,
  }),
  't:PDF Tools',
)
assert.equal(
  resolveExtensionSidebarPanelTitle({
    container: { id: 'container-id' },
    translate: (key) => `t:${key}`,
  }),
  't:container-id',
)
assert.equal(resolveExtensionSidebarPanelExtensionName({
  extensionName: ' RetainPDF ',
  extensionId: 'retain-pdf',
}), 'RetainPDF')

const blockedHeaderAction = buildExtensionSidebarHeaderActionsState({
  actions: [{ extensionId: 'example-extension', commandId: 'example.command', title: 'Run' }],
  hostDiagnostics: {
    ownsPendingPrompt: false,
    blockedByForeignPrompt: true,
    pendingPromptOwner: {
      extensionId: 'another-extension',
      workspaceRoot: '/tmp/workspace-b',
    },
    blockingPromptWorkspaceRoot: '/tmp/workspace-b',
  },
  translate: (key, params = {}) => `${key}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`,
})[0]

assert.equal(blockedHeaderAction.blocked, true)
assert.equal(blockedHeaderAction.blockedLabel, 'Blocked')
assert.match(blockedHeaderAction.blockedMessage, /another-extension/)

assert.deepEqual(
  resolveExtensionSidebarViewPresentation({
    view: {
      id: 'fallback-view',
      title: 'Manifest Title',
      contextualTitle: 'Contextual Title',
    },
    resolvedView: {
      title: 'Resolved Title',
    },
    viewState: {
      title: 'State Title',
      description: ' State Description ',
      message: ' State Message ',
      statusLabel: 'Streaming',
      statusTone: 'warning',
      actionLabel: 'Refresh',
      badgeValue: 2,
      badgeTooltip: 'Two actions',
      sections: [{ id: 'summary' }],
      resultEntries: [{ id: 'first' }],
    },
  }),
  {
    title: 'State Title',
    description: 'State Description',
    message: 'State Message',
    statusLabel: 'Streaming',
    statusTone: 'warning',
    actionLabel: 'Refresh',
    badgeValue: 2,
    badgeTooltip: 'Two actions',
    sections: [{ id: 'summary' }],
    resultEntries: [{ id: 'first' }],
  },
)
assert.equal(
  resolveExtensionSidebarViewPresentation({
    view: { id: 'fallback-view', contextualTitle: 'Contextual Title' },
    resolvedView: { title: 'Resolved Title' },
  }).title,
  'Resolved Title',
)
assert.equal(
  resolveExtensionSidebarViewPresentation({
    view: { id: 'fallback-view', contextualTitle: 'Contextual Title' },
  }).title,
  'Contextual Title',
)

const entries = [{ id: 'first' }, { id: 'second' }]
assert.deepEqual(
  resolveExtensionSidebarActiveResultEntry({
    resultEntries: entries,
    selectedEntryId: 'second',
  }),
  { id: 'second' },
)
assert.deepEqual(
  resolveExtensionSidebarActiveResultEntry({
    resultEntries: entries,
    selectedEntryId: 'missing',
  }),
  { id: 'first' },
)
assert.equal(
  isExtensionSidebarActiveResultEntry({
    activeEntry: { id: 'second' },
    entry: { id: 'second' },
  }),
  true,
)

const view = { extensionId: 'example-extension', id: 'tools' }
assert.equal(isExtensionSidebarTreeItemExpandable({ collapsibleState: 'collapsed' }), true)
assert.equal(isExtensionSidebarTreeItemExpandable({ collapsibleState: 'none' }), false)
assert.equal(
  resolveExtensionSidebarItemExpansionKey(view, { handle: 'group' }),
  'example-extension:tools:group',
)
assert.equal(
  isExtensionSidebarTreeItemExpanded({
    view,
    item: { handle: 'group', collapsibleState: 'collapsed' },
    expandedItemKeys: { 'example-extension:tools:group': false },
    controllerState: { revealedPathHandles: ['group'] },
  }),
  false,
)
assert.equal(
  isExtensionSidebarTreeItemExpanded({
    view,
    item: { handle: 'group', collapsibleState: 'collapsed' },
    controllerState: { revealedPathHandles: ['group'] },
  }),
  true,
)
assert.equal(
  isExtensionSidebarTreeItemExpanded({
    view,
    item: { handle: 'group', collapsibleState: 'expanded' },
  }),
  true,
)

assert.equal(
  resolveExtensionSidebarResultActionKey({
    id: 'entry',
    action: 'COPY-TEXT',
    targetPath: '/tmp/output.txt',
    reference_id: 'ref-1',
  }),
  'entry::copy-text::/tmp/output.txt::ref-1',
)
assert.equal(resolveExtensionSidebarResultActionMessageKey({ action: 'copy-path' }), 'Copied to clipboard')
assert.equal(resolveExtensionSidebarResultActionMessageKey({ action: 'open-reference' }), 'Opened reference')
assert.equal(resolveExtensionSidebarResultActionMessageKey({ action: 'execute-command' }), 'Extension task started')
assert.equal(resolveExtensionSidebarResultActionMessageKey({ action: 'open' }), '')

const panelSource = await readFile('src/components/extensions/ExtensionSidebarPanel.vue', 'utf8')

assert.match(
  panelSource,
  /from '..\/..\/domains\/extensions\/extensionSidebarPresentation'/,
  'ExtensionSidebarPanel must use the sidebar presentation helper',
)
assert.match(
  panelSource,
  /resolveExtensionSidebarViewPresentation/,
  'ExtensionSidebarPanel must derive view presentation through the extension domain',
)
assert.match(
  panelSource,
  /resolveExtensionSidebarResultActionKey/,
  'ExtensionSidebarPanel must derive result action busy keys through the extension domain',
)
assert.doesNotMatch(
  panelSource,
  /buildExtensionActionSurfaceState|describeExtensionRuntimeBlockPresentation/,
  'ExtensionSidebarPanel must not duplicate runtime block/header action presentation',
)
assert.doesNotMatch(
  panelSource,
  /\$\{view\.extensionId\}:\$\{view\.id\}/,
  'ExtensionSidebarPanel must use the shared view-key helper',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    viewKeyDerived: true,
    headerActionsDerived: true,
    viewPresentationDerived: true,
    activeResultDerived: true,
    treeExpansionDerived: true,
    resultActionMessagesDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
