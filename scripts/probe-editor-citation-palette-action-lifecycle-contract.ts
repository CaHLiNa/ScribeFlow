import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const componentSource = await readFile('src/components/editor/CitationPalette.vue', 'utf8')

assert.match(
  componentSource,
  /@mousedown\.prevent="closePalette"/,
  'CitationPalette backdrop close must invalidate pending palette actions'
)
assert.match(
  componentSource,
  /let paletteActionVersion = 0[\s\S]*let paletteDisposed = false/,
  'CitationPalette must track action version and disposed state'
)
assert.match(
  componentSource,
  /function beginPaletteAction\(\) \{[\s\S]*paletteActionVersion \+= 1[\s\S]*return \{ version: paletteActionVersion \}/,
  'CitationPalette must version each async palette action'
)
assert.match(
  componentSource,
  /function cancelPaletteActions\(\) \{[\s\S]*paletteActionVersion \+= 1[\s\S]*importLoading\.value = false/,
  'CitationPalette must invalidate pending actions and clear loading state when cancelled'
)
assert.match(
  componentSource,
  /async function focusWhenActionCurrent\(targetRef, token\) \{[\s\S]*await nextTick\(\)[\s\S]*if \(!isPaletteActionCurrent\(token\)\) return[\s\S]*targetRef\.value\?\.focus\(\)/,
  'CitationPalette delayed focus must be guarded by the current action token'
)
assert.match(
  componentSource,
  /function closePalette\(\) \{[\s\S]*cancelPaletteActions\(\)[\s\S]*emit\('close'\)/,
  'CitationPalette close must cancel stale async actions before emitting close'
)
assert.match(
  componentSource,
  /watch\(\(\) => props\.mode,[\s\S]*cancelPaletteActions\(\)[\s\S]*internalMode\.value = value/,
  'CitationPalette must cancel pending actions when mode changes'
)
assert.match(
  componentSource,
  /watch\(\s*\(\) => props\.cites,[\s\S]*cancelPaletteActions\(\)[\s\S]*editCites\.value = value\.map/,
  'CitationPalette must cancel pending actions when citation group props change'
)
assert.match(
  componentSource,
  /async function selectResult\(reference, stayOpen = false\) \{[\s\S]*const token = beginPaletteAction\(\)[\s\S]*await ensureReferenceInDocument\(reference\)[\s\S]*if \(!isPaletteActionCurrent\(token\) \|\| !ready\) return[\s\S]*emit\('insert'/,
  'CitationPalette insert selection must avoid emitting from stale async document-scope work'
)
assert.match(
  componentSource,
  /async function addToGroup\(reference\) \{[\s\S]*const token = beginPaletteAction\(\)[\s\S]*await ensureReferenceInDocument\(reference\)[\s\S]*if \(!isPaletteActionCurrent\(token\) \|\| !ready\) return[\s\S]*appendReferenceToGroup\(reference\)/,
  'CitationPalette add-to-group must avoid updating from stale async document-scope work'
)
assert.match(
  componentSource,
  /function toggleImport\(\) \{[\s\S]*const token = beginPaletteAction\(\)[\s\S]*focusWhenActionCurrent\(importTextEl, token\)[\s\S]*focusWhenActionCurrent\(addInputEl, token\)/,
  'CitationPalette import toggle focus must be action-scoped'
)
assert.match(
  componentSource,
  /async function doImport\(\) \{[\s\S]*const token = beginPaletteAction\(\)[\s\S]*await referencesStore\.importResolvedReferenceText[\s\S]*if \(!isPaletteActionCurrent\(token\)\) return[\s\S]*await referencesStore\.addDocumentReference[\s\S]*if \(!isPaletteActionCurrent\(token\)\) return[\s\S]*appendReferenceToGroup\(selectedReference\)[\s\S]*await focusWhenActionCurrent\(addInputEl, token\)[\s\S]*catch \(error\) \{[\s\S]*if \(!isPaletteActionCurrent\(token\)\) return[\s\S]*finally \{[\s\S]*if \(isPaletteActionCurrent\(token\)\) \{/,
  'CitationPalette import flow must guard stale result, document-scope add, update, focus, error and loading writes'
)
assert.match(
  componentSource,
  /onMounted\(\(\) => \{[\s\S]*const token = beginPaletteAction\(\)[\s\S]*focusWhenActionCurrent\(addInputEl, token\)/,
  'CitationPalette mount autofocus must be action-scoped'
)
assert.match(
  componentSource,
  /onUnmounted\(\(\) => \{[\s\S]*paletteDisposed = true[\s\S]*paletteActionVersion \+= 1[\s\S]*document\.removeEventListener/,
  'CitationPalette unmount must invalidate pending async actions before cleanup'
)
assert.doesNotMatch(
  componentSource,
  /nextTick\(\(\) => [^)]+\.focus\(\)\)/,
  'CitationPalette must not use unguarded nextTick focus callbacks'
)
assert.equal(
  [...componentSource.matchAll(/await nextTick\(\)[\s\S]{0,120}\.value\?\.focus\(\)/g)].length,
  1,
  'CitationPalette awaited nextTick focus must only appear inside focusWhenActionCurrent'
)
assert.match(
  componentSource,
  /async function focusWhenActionCurrent\(targetRef, token\) \{[\s\S]*await nextTick\(\)[\s\S]*if \(!isPaletteActionCurrent\(token\)\) return[\s\S]*targetRef\.value\?\.focus\(\)/,
  'CitationPalette awaited nextTick focus must be guarded inside focusWhenActionCurrent'
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    actionVersioned: true,
    closeCancelsActions: true,
    propChangesCancelActions: true,
    insertGuarded: true,
    addGuarded: true,
    importGuarded: true,
    focusGuarded: true,
    unmountInvalidatesActions: true,
  },
}, null, 2))
