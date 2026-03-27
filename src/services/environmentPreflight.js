import { invoke } from '@tauri-apps/api/core'
import { t } from '../i18n/index.js'
import { useEnvironmentStore } from '../stores/environment.js'
import { useLatexStore } from '../stores/latex.js'
import { useToastStore } from '../stores/toast.js'
import { useTypstStore } from '../stores/typst.js'
import { useUxStatusStore } from '../stores/uxStatus.js'
import { useWorkspaceStore } from '../stores/workspace.js'

const COMMAND_CACHE_MS = 5 * 60 * 1000
const commandCache = new Map()

async function resolveCommandAvailable(command) {
  const cached = commandCache.get(command)
  if (cached && Date.now() - cached.checkedAt < COMMAND_CACHE_MS) {
    return cached.available
  }

  let available = false
  try {
    const path = await invoke('resolve_command_path', { command })
    available = !!String(path || '').trim()
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

export async function ensureGitHubSyncReady() {
  if (await resolveCommandAvailable('git')) return true
  return showBlockedFeedback('missing-git-sync', t('Git is not installed. Install Git, then retry GitHub sync.'))
}

export async function getEnvironmentHealthSummary() {
  const envStore = useEnvironmentStore()
  const latexStore = useLatexStore()
  const typstStore = useTypstStore()

  if (!envStore.detected) {
    await envStore.detect()
  }

  await Promise.allSettled([
    latexStore.checkCompilers(),
    typstStore.checkCompiler(),
  ])

  const pythonPath = envStore.selectedInterpreterPath('python') || envStore.languages?.python?.path || ''
  const pythonVersion = envStore.languages?.python?.version || ''
  const jupyterPath = envStore.jupyter?.path || ''
  const jupyterVersion = envStore.jupyter?.version || ''
  const latexDetail = latexStore.availableCompilerName || latexStore.compilerPreference || ''
  const typstDetail = typstStore.path || ''
  const gitAvailable = await resolveCommandAvailable('git')

  return [
    {
      id: 'python',
      label: t('Python interpreter'),
      status: pythonPath ? 'available' : 'missing',
      detail: pythonPath ? [pythonVersion, pythonPath].filter(Boolean).join(' • ') : t('Not found'),
    },
    {
      id: 'jupyter',
      label: t('Jupyter kernel'),
      status: envStore.jupyter?.found ? 'available' : 'missing',
      detail: envStore.jupyter?.found ? [jupyterVersion, jupyterPath].filter(Boolean).join(' • ') : t('Not found'),
    },
    {
      id: 'latex',
      label: t('LaTeX Compiler'),
      status: latexStore.hasAvailableCompiler ? 'available' : 'missing',
      detail: latexStore.hasAvailableCompiler ? latexDetail : t('Not found'),
    },
    {
      id: 'typst',
      label: t('Typst Compiler'),
      status: typstStore.available ? 'available' : 'missing',
      detail: typstStore.available ? typstDetail : t('Not found'),
    },
    {
      id: 'git',
      label: t('Git'),
      status: gitAvailable ? 'available' : 'missing',
      detail: gitAvailable ? t('Installed') : t('Not found'),
    },
  ]
}
