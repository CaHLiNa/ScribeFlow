import { invoke } from '@tauri-apps/api/core'
import { t } from '../i18n'
import { useEnvironmentStore } from '../stores/environment'
import { useLatexStore } from '../stores/latex'
import { useToastStore } from '../stores/toast'
import { useTypstStore } from '../stores/typst'
import { useUxStatusStore } from '../stores/uxStatus'
import { useWorkspaceStore } from '../stores/workspace'

const COMMAND_CACHE_MS = 5 * 60 * 1000
const commandCache = new Map()

function isWindows() {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || ''
  return /win/i.test(platform)
}

function stdoutOnly(output) {
  const text = String(output || '')
  const marker = '\n--- stderr ---\n'
  const idx = text.indexOf(marker)
  return idx >= 0 ? text.slice(0, idx) : text
}

function firstOutputLine(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean) || ''
}

async function resolveCommandAvailable(command) {
  const cached = commandCache.get(command)
  if (cached && Date.now() - cached.checkedAt < COMMAND_CACHE_MS) {
    return cached.available
  }

  const workspace = useWorkspaceStore()
  const cwd = workspace.path || workspace.globalConfigDir || await invoke('get_global_config_dir').catch(() => '.')
  const query = isWindows()
    ? `where.exe ${command} 2>NUL`
    : `command -v ${command} 2>/dev/null`

  let available = false
  try {
    const output = await invoke('run_shell_command', { cwd, command: query })
    available = !!firstOutputLine(stdoutOnly(output))
  } catch {
    available = false
  }

  commandCache.set(command, {
    checkedAt: Date.now(),
    available,
  })
  return available
}

function openSettingsFooterAction(section = 'environment') {
  return {
    type: 'open-settings',
    section,
    label: t('Open Settings'),
  }
}

function showBlockedFeedback(key, message, { section = 'environment', type = 'warning', cooldown = 6000 } = {}) {
  const workspace = useWorkspaceStore()
  const toastStore = useToastStore()
  const uxStatusStore = useUxStatusStore()

  uxStatusStore.showOnce(`ux:${key}`, message, {
    type,
    duration: 5000,
    action: openSettingsFooterAction(section),
  }, cooldown)

  toastStore.showOnce(`toast:${key}`, message, {
    type,
    duration: 8000,
    action: {
      label: t('Settings'),
      onClick: () => workspace.openSettings(section),
    },
  }, cooldown)

  return false
}

export async function ensureLanguageExecutionReady(language) {
  const envStore = useEnvironmentStore()
  await envStore.detect()

  switch (language) {
    case 'python':
      if (envStore.languages.python.found && envStore.selectedInterpreterPath('python')) return true
      return showBlockedFeedback('missing-python', t('Python interpreter not found. Choose one in Environment settings.'))
    case 'r':
      if (envStore.languages.r.found) return true
      return showBlockedFeedback('missing-r', t('R is not available. Install it, then retry from Environment settings.'))
    case 'julia':
      if (envStore.languages.julia.found) return true
      return showBlockedFeedback('missing-julia', t('Julia is not available. Install it, then retry from Environment settings.'))
    default:
      return true
  }
}

export async function ensureDocumentRenderReady(filePath) {
  const lowerPath = String(filePath || '').toLowerCase()
  if (lowerPath.endsWith('.qmd')) {
    if (await resolveCommandAvailable('quarto')) return true
    return showBlockedFeedback('missing-quarto', t('Quarto CLI not found. Install Quarto, then retry from Environment settings.'))
  }
  return ensureLanguageExecutionReady('r')
}

export async function ensureLatexCompileReady() {
  const latexStore = useLatexStore()
  await latexStore.checkCompilers()

  if (latexStore.hasAvailableCompiler) return true

  if (latexStore.compilerPreference === 'system') {
    return showBlockedFeedback('missing-system-tex', t('System TeX is not available. Install latexmk or switch compiler in Environment settings.'))
  }

  if (latexStore.compilerPreference === 'tectonic') {
    return showBlockedFeedback('missing-tectonic', t('Tectonic is not installed. Download it from Environment settings.'))
  }

  return showBlockedFeedback('missing-latex', t('No LaTeX compiler found. Install System TeX or Tectonic in Environment settings.'))
}

export async function ensureTypstCompileReady() {
  const typstStore = useTypstStore()
  await typstStore.checkCompiler()
  if (typstStore.available) return true
  return showBlockedFeedback('missing-typst', t('Typst CLI not found. Install or download it in Environment settings.'))
}

export async function ensureMarkdownPdfExportReady() {
  return ensureTypstCompileReady()
}
