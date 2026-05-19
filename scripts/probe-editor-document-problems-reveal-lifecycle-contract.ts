import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const componentSource = await readFile('src/components/sidebar/DocumentProblemsPanel.vue', 'utf8')

assert.match(
  componentSource,
  /import \{ computed, onUnmounted, watch \} from 'vue'/,
  'DocumentProblemsPanel must import lifecycle hooks for delayed diagnostics reveal cleanup'
)
assert.match(
  componentSource,
  /import \{ createLatexRevealLifecycle \} from '..\/..\/editor\/latexRevealTiming\.ts'/,
  'DocumentProblemsPanel must use the LaTeX reveal lifecycle controller'
)
assert.match(
  componentSource,
  /const problemRevealLifecycle = createLatexRevealLifecycle\(\)/,
  'DocumentProblemsPanel must create a diagnostics reveal lifecycle controller'
)
assert.match(
  componentSource,
  /let pendingProblemFocusPath = ''/,
  'DocumentProblemsPanel must track the pending diagnostics source target path'
)
assert.match(
  componentSource,
  /async function handleProblemClick\(problem = \{\}\) \{[\s\S]*const token = problemRevealLifecycle\.begin\(\)[\s\S]*if \(!token\) return[\s\S]*pendingProblemFocusPath = ''/,
  'DocumentProblemsPanel problem clicks must version every diagnostics reveal request'
)
assert.match(
  componentSource,
  /pendingProblemFocusPath = sourcePath[\s\S]*revealLatexSourceLocation\([\s\S]*lifecycle:\s*problemRevealLifecycle,[\s\S]*token,[\s\S]*\)[\s\S]*if \(!problemRevealLifecycle\.isCurrent\(token\)\) return[\s\S]*pendingProblemFocusPath = ''[\s\S]*workflowStore\.focusProblem\(problem\)/,
  'DocumentProblemsPanel source reveals must pass lifecycle tokens and avoid focusing stale diagnostics'
)
assert.match(
  componentSource,
  /if \(!problemRevealLifecycle\.isCurrent\(token\)\) return[\s\S]*pendingProblemFocusPath = ''[\s\S]*editorStore\.openFile\(sourcePath\)[\s\S]*workflowStore\.focusProblem\(problem\)/,
  'DocumentProblemsPanel fallback open/focus must also be token guarded'
)
assert.match(
  componentSource,
  /watch\(\s*\(\) => props\.filePath,[\s\S]*pendingProblemFocusPath = ''[\s\S]*problemRevealLifecycle\.cancelPending\(\)/,
  'DocumentProblemsPanel must cancel pending diagnostics reveals when the document changes'
)
assert.match(
  componentSource,
  /watch\(\s*\(\) => editorStore\.activeTab,[\s\S]*pendingProblemFocusPath && path === pendingProblemFocusPath[\s\S]*pendingProblemFocusPath = ''[\s\S]*problemRevealLifecycle\.cancelPending\(\)/,
  'DocumentProblemsPanel must cancel stale diagnostics reveals when the active tab moves away from the pending target'
)
assert.match(
  componentSource,
  /onUnmounted\(\(\) => \{[\s\S]*pendingProblemFocusPath = ''[\s\S]*problemRevealLifecycle\.dispose\(\)/,
  'DocumentProblemsPanel must dispose pending diagnostics reveals on unmount'
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    clickVersionsRequest: true,
    revealUsesLifecycleToken: true,
    staleFocusProblemGuarded: true,
    fallbackFocusGuarded: true,
    documentChangeCancel: true,
    activeTabCancel: true,
    unmountDisposesReveal: true,
  },
}, null, 2))
