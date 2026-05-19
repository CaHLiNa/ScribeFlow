import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const componentSource = await readFile('src/components/references/ReferenceCitedInPanel.vue', 'utf8')

assert.match(
  componentSource,
  /import \{ computed, nextTick, onUnmounted, ref, watch \} from 'vue'/,
  'ReferenceCitedInPanel must import lifecycle hooks for delayed focus cleanup'
)
assert.match(
  componentSource,
  /import \{ createEditorFocusRetryLifecycle \} from '..\/..\/editor\/editorFocusRetryTiming\.ts'/,
  'ReferenceCitedInPanel must use the shared editor focus retry lifecycle controller'
)
assert.match(
  componentSource,
  /const citationFocusRetryLifecycle = createEditorFocusRetryLifecycle\(\{\s*maxAttempts:\s*10,\s*retryDelayMs:\s*16,\s*\}\)/,
  'ReferenceCitedInPanel must bound cited-in source focus retries to a short lifecycle'
)
assert.match(
  componentSource,
  /let pendingCitationFocusPath = ''/,
  'ReferenceCitedInPanel must track the pending source focus target path'
)
assert.match(
  componentSource,
  /async function focusCitationSourceWhenReady\(path = '', line = 0, token, attempts = 0\) \{[\s\S]*citationFocusRetryLifecycle\.isCurrent\(token\)[\s\S]*editorStore\.getAnyEditorView\(path\)[\s\S]*focusEditorLineWithHighlight\(view, line, \{ durationMs: 1800 \}\)[\s\S]*pendingCitationFocusPath = ''/,
  'ReferenceCitedInPanel delayed focus must be token guarded before focusing and clear the pending path after a current focus'
)
assert.match(
  componentSource,
  /if \(!citationFocusRetryLifecycle\.canRetry\(token, attempts\)\) \{[\s\S]*pendingCitationFocusPath = ''[\s\S]*return[\s\S]*await nextTick\(\)[\s\S]*citationFocusRetryLifecycle\.scheduleRetry\(token, \(nextAttempts\) => \{[\s\S]*focusCitationSourceWhenReady\(path, line, token, nextAttempts\)/,
  'ReferenceCitedInPanel delayed focus must stop at the retry limit and schedule retries through the lifecycle token'
)
assert.match(
  componentSource,
  /function openCitationSource\(entry = \{\}\) \{[\s\S]*const token = citationFocusRetryLifecycle\.begin\(\)[\s\S]*if \(!token\) return[\s\S]*pendingCitationFocusPath = path[\s\S]*editorStore\.openFile\(path\)[\s\S]*citationFocusRetryLifecycle\.cancelPending\(\)[\s\S]*focusCitationSourceWhenReady\(path, line, token\)/,
  'ReferenceCitedInPanel source clicks must version each request, remember the target path, cancel invalid-line requests and use the token for delayed focus'
)
assert.match(
  componentSource,
  /watch\(\s*\(\) => \[citationKey\.value, workspace\.path\],[\s\S]*pendingCitationFocusPath = ''[\s\S]*citationFocusRetryLifecycle\.cancelPending\(\)/,
  'ReferenceCitedInPanel must cancel pending source focus when the selected citation or workspace changes'
)
assert.match(
  componentSource,
  /watch\(\s*\(\) => editorStore\.activeTab,[\s\S]*pendingCitationFocusPath && path === pendingCitationFocusPath[\s\S]*pendingCitationFocusPath = ''[\s\S]*citationFocusRetryLifecycle\.cancelPending\(\)/,
  'ReferenceCitedInPanel must cancel stale source focus when the active tab moves away from the pending target'
)
assert.match(
  componentSource,
  /onUnmounted\(\(\) => \{[\s\S]*pendingCitationFocusPath = ''[\s\S]*citationFocusRetryLifecycle\.dispose\(\)/,
  'ReferenceCitedInPanel must dispose pending source focus retries on unmount'
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    boundedRetryLifecycle: true,
    tokenGuardedFocus: true,
    retryLimitGuard: true,
    clickVersionsRequest: true,
    selectedCitationCancel: true,
    activeTabCancel: true,
    unmountDisposesRetry: true,
  },
}, null, 2))
