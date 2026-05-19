import assert from 'node:assert/strict'
import { buildExtensionPluginContainerPresentation } from '../src/domains/extensions/extensionPluginContainerPresentation.ts'

const withBadge = buildExtensionPluginContainerPresentation(
  {
    id: 'examplePdfExtension.tools',
    title: 'PDF Tools',
  },
  {
    description: 'One quick action is available for the active PDF.',
    badgeValue: 2,
    badgeTooltip: 'Two quick actions are available for the active PDF.',
  },
  (value) => value,
)

assert.equal(withBadge.label, 'PDF Tools')
assert.equal(withBadge.title, 'PDF Tools (2)')
assert.equal(withBadge.description, 'One quick action is available for the active PDF.')
assert.equal(withBadge.badgeValue, 2)
assert.equal(withBadge.badgeTooltip, 'Two quick actions are available for the active PDF.')

const withoutBadge = buildExtensionPluginContainerPresentation(
  {
    id: 'exampleMarkdownExtension.notes',
    title: 'Notes',
  },
  {
    description: '',
    badgeValue: null,
    badgeTooltip: '',
  },
  (value) => value,
)

assert.equal(withoutBadge.label, 'Notes')
assert.equal(withoutBadge.title, 'Notes')
assert.equal(withoutBadge.badgeValue, null)

console.log(JSON.stringify({
  ok: true,
  summary: {
    titledBadge: withBadge.title,
    plainTitle: withoutBadge.title,
    badgeTooltip: withBadge.badgeTooltip,
  },
}, null, 2))
