import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workbenchSource = await readFile('src/components/references/ReferenceLibraryWorkbench.vue', 'utf8')
const detailDockSource = await readFile('src/components/references/ReferenceLibraryDetailDock.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const workbenchStyle = scopedStyleBlock(workbenchSource)
const detailDockStyle = scopedStyleBlock(detailDockSource)

assert.match(
  workbenchSource,
  /import ReferenceLibraryDetailDock from '\.\/ReferenceLibraryDetailDock\.vue'/,
  'ReferenceLibraryWorkbench must render the detail dock through ReferenceLibraryDetailDock',
)
assert.match(
  workbenchSource,
  /<ReferenceLibraryDetailDock[\s\S]*:active-key="activeReferenceDockKey"[\s\S]*:active-page="activeReferenceDockPage"[\s\S]*:pages="referenceDockPages"/,
  'ReferenceLibraryWorkbench must pass derived dock page state into the detail dock shell',
)
assert.match(
  workbenchSource,
  /@activate-page="activateReferenceDockPage"[\s\S]*@close-page="closeReferenceDockPage"/,
  'ReferenceLibraryWorkbench must keep reference dock page orchestration wired',
)
assert.match(
  workbenchSource,
  /@resize="handleReferenceDetailResize"[\s\S]*@resize-snap="handleReferenceDetailResizeSnap"/,
  'ReferenceLibraryWorkbench must keep reference dock resize orchestration wired',
)
assert.doesNotMatch(
  workbenchSource,
  /import InlineDockFrame from '\.\.\/layout\/InlineDockFrame\.vue'|import InlineDockTabBar from '\.\.\/layout\/InlineDockTabBar\.vue'/,
  'ReferenceLibraryWorkbench must not import detail dock presentation shells directly',
)
assert.doesNotMatch(
  workbenchSource,
  /<InlineDockFrame|<InlineDockTabBar/,
  'ReferenceLibraryWorkbench must not render detail dock shell DOM directly',
)

for (const className of [
  'reference-workbench__detail-panel',
  'reference-workbench__detail-shell',
  'reference-workbench__detail-tabbar',
  'reference-workbench__detail-tabs',
  'reference-workbench__detail-tab--icon',
  'reference-workbench__detail-tab-label',
  'reference-workbench__detail-tab-close',
]) {
  assert.doesNotMatch(
    workbenchStyle,
    new RegExp(`\\.${className}\\b`),
    `ReferenceLibraryWorkbench must not own detail dock scoped style .${className}`,
  )
  assert.match(
    detailDockStyle,
    new RegExp(`\\.${className}\\b`),
    `ReferenceLibraryDetailDock must own detail dock scoped style .${className}`,
  )
}

assert.match(
  detailDockSource,
  /import InlineDockFrame from '\.\.\/layout\/InlineDockFrame\.vue'/,
  'ReferenceLibraryDetailDock must own the inline dock frame shell',
)
assert.match(
  detailDockSource,
  /import InlineDockTabBar from '\.\.\/layout\/InlineDockTabBar\.vue'/,
  'ReferenceLibraryDetailDock must own the inline dock tabbar shell',
)
assert.match(
  detailDockSource,
  /<component[\s\S]*:is="activePage\?\.component"[\s\S]*v-bind="activePage\?\.componentProps \|\| \{\}"[\s\S]*v-on="activePage\?\.componentEvents \|\| \{\}"/,
  'ReferenceLibraryDetailDock must render the active dock component and forward registry props/events',
)
assert.match(
  detailDockSource,
  /@activate="\$emit\('activate-page', \$event\)"[\s\S]*@close="\$emit\('close-page', \$event\)"/,
  'ReferenceLibraryDetailDock must emit page intents instead of mutating workspace state',
)
assert.doesNotMatch(
  detailDockSource,
  /useReferencesStore|useWorkspaceStore|useToastStore|useUxStatusStore|openNativeDialog|saveNativeDialog|referenceDockPageRegistry|referencesStore|workspace\./,
  'ReferenceLibraryDetailDock must stay presentation-only and avoid store/service authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    workbenchUsesDetailDockComponent: true,
    parentKeepsReferenceDockOrchestration: true,
    detailDockOwnsTabShellAndStyles: true,
    detailDockAvoidsStoreAndServiceAuthority: true,
  },
}, null, 2))
