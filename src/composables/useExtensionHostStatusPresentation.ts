import { computed } from 'vue'
import { useI18n } from '../i18n'
import { useExtensionPromptRecovery } from './useExtensionPromptRecovery'
import { describeExtensionHostStatusSurface } from '../domains/extensions/extensionHostStatusPresentation'

export function useExtensionHostStatusPresentation(surface = () => null) {
  const { t } = useI18n()

  const presentation = computed(() => {
    const current = typeof surface === 'function' ? surface() : surface?.value || null
    return describeExtensionHostStatusSurface(current || {}, t)
  })

  const {
    busy: promptRecoveryBusy,
    descriptor: promptRecovery,
    cancel: cancelPromptRecovery,
  } = useExtensionPromptRecovery(() => presentation.value.recoveryOwner)

  const recoveryAction = computed(() => ({
    available: promptRecovery.value.available,
    busy: promptRecoveryBusy.value,
    label: promptRecovery.value.label,
    title: promptRecovery.value.title,
  }))

  async function triggerRecoveryAction() {
    await cancelPromptRecovery()
  }

  return {
    presentation,
    recoveryAction,
    triggerRecoveryAction,
    promptRecoveryBusy,
    promptRecovery,
    cancelPromptRecovery,
  }
}
