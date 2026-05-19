import { t } from '../i18n/index.ts'
import { useLatexStore } from '../stores/latex.ts'
import { useToastStore } from '../stores/toast.ts'
import { useUxStatusStore } from '../stores/uxStatus.ts'
import { useWorkspaceStore } from '../stores/workspace.ts'

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
