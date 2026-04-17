import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dedupe = (items) => [...new Set(items)]

export const FRONTEND_BASELINE_LINT_TARGETS = Object.freeze(
  dedupe([
    'src/App.vue',
    'src/i18n/index.js',
    'src/components/settings/**/*.vue',
    'src/components/shared/**/*.vue',
    'src/components/editor/TabBar.vue',
    'src/components/editor/DocumentWorkflowBar.vue',
    'src/components/editor/WorkspaceStarter.vue',
    'src/components/editor/EditorContextMenu.vue',
    'src/components/editor/EditorPane.vue',
    'src/components/editor/PdfIframeSurface.vue',
    'src/components/editor/TextEditor.vue',
    'src/components/sidebar/FileTree.vue',
    'src/components/sidebar/FileTreeItem.vue',
    'src/components/layout/WorkbenchRail.vue',
    'src/components/layout/ToastContainer.vue',
    'src/shared/**/*.js',
    'scripts/frontendBaselineTooling.mjs',
    'tests/editorOpenRoutingRuntime.test.mjs',
    'tests/frontendBaselineAudit.test.mjs',
    'tests/frontendInlineStyleAudit.test.mjs',
    'tests/frontendToolingBaselineTargets.test.mjs',
    'tests/paneTreeViewerRuntime.test.mjs',
    'tests/shellResizeSignals.test.mjs',
    'tests/workbenchChromeEntries.test.mjs',
    'tests/workbenchInspectorPanels.test.mjs',
    'tests/workbenchSidebarPanels.test.mjs',
    'tests/workspacePreferences.test.mjs',
    'tests/workspaceStarterMetrics.test.mjs',
  ])
)

export const FRONTEND_BASELINE_FORMAT_TARGETS = Object.freeze(
  dedupe([
    'package.json',
    'eslint.config.js',
    '.prettierrc.json',
    ...FRONTEND_BASELINE_LINT_TARGETS,
    'src/css/**/*.css',
    'docs/ARCHITECTURE.md',
    'docs/ACADEMIC_PLATFORM_DIRECTION.md',
    'docs/BUILD_SYSTEM.md',
    'docs/CONTRIBUTING.md',
    'docs/DATA_MODEL.md',
    'docs/DOCUMENT_WORKFLOW.md',
    'docs/DOMAINS.md',
    'docs/OPERATIONS.md',
    'docs/PRODUCT.md',
  ])
)

export const FRONTEND_BASELINE_RAW_FORM_CONTROL_FILES = Object.freeze([
  'src/components/editor/WorkspaceStarter.vue',
  'src/components/sidebar/FileTree.vue',
  'src/components/sidebar/FileTreeItem.vue',
  'src/components/editor/EditorContextMenu.vue',
])

export const FRONTEND_BASELINE_INLINE_STYLE_FILES = Object.freeze([
  'src/components/editor/EditorContextMenu.vue',
  'src/components/editor/EditorPane.vue',
  'src/components/editor/PdfIframeSurface.vue',
  'src/components/editor/TabBar.vue',
  'src/components/editor/TextEditor.vue',
])

const TOOL_COMMANDS = {
  lint: {
    bin: 'eslint',
    args: ['eslint.config.js', ...FRONTEND_BASELINE_LINT_TARGETS],
  },
  'lint:fix': {
    bin: 'eslint',
    args: ['eslint.config.js', ...FRONTEND_BASELINE_LINT_TARGETS, '--fix'],
  },
  format: {
    bin: 'prettier',
    args: ['--write', ...FRONTEND_BASELINE_FORMAT_TARGETS],
  },
  'format:check': {
    bin: 'prettier',
    args: ['--check', ...FRONTEND_BASELINE_FORMAT_TARGETS],
  },
}

export function runFrontendBaselineTool(commandName) {
  const command = TOOL_COMMANDS[commandName]

  if (!command) {
    const availableCommands = Object.keys(TOOL_COMMANDS).join(', ')
    console.error(
      `Unknown frontend baseline tooling command "${commandName}". Expected one of: ${availableCommands}.`
    )
    process.exit(1)
  }

  const executable = process.platform === 'win32' ? `${command.bin}.cmd` : command.bin
  const result = spawnSync(executable, command.args, {
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  runFrontendBaselineTool(process.argv[2])
}
