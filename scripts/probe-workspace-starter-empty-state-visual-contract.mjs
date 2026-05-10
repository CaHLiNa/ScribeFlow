import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('../src/components/editor/WorkspaceStarterEmptyState.vue', import.meta.url),
  'utf8',
)

const requiredSnippets = [
  'class="ambient-field"',
  'ambient-orb--1',
  'ambient-orb--2',
  'ambient-orb--3',
  'class="starter-hero-graphic stagger-1"',
  'class="floating-satellite satellite-left"',
  'class="floating-satellite satellite-right"',
  'class="starter-hero-icon-plate"',
  'class="hero-badge hero-badge--left"',
  'class="hero-badge hero-badge--right"',
  '@keyframes slide-up-fade',
  '@keyframes ambient-drift',
  'animation: float 6s ease-in-out infinite',
  'animation: float-delayed 7s ease-in-out infinite',
]

for (const snippet of requiredSnippets) {
  assert.ok(source.includes(snippet), `missing workspace starter visual contract: ${snippet}`)
}

assert.ok(
  !source.includes('<div class="starter-card">'),
  'workspace empty state must keep the restored ambient starter, not the static card fallback',
)

console.log('workspace starter empty state visual contract probe passed')
