import { computed, ref } from 'vue'
import { useI18n } from '../i18n'
import { useExtensionsStore } from '../stores/extensions'
import { useToastStore } from '../stores/toast'
import { buildExtensionPromptRecoveryDescriptor } from '../domains/extensions/extensionPromptRecovery'

export function useExtensionPromptRecovery(owner = () => null) {
  const { t } = useI18n()
  const extensionsStore = useExtensionsStore()
  const toastStore = useToastStore()
  const busy = ref(false)

  const descriptor = computed(() => {
    const current = typeof owner === 'function' ? owner() : owner?.value || null
    const base = buildExtensionPromptRecoveryDescriptor(current, {
      cancelling: busy.value,
    })
    return {
      ...base,
      label: base.labelKey ? t(base.labelKey) : '',
      title: base.titleKey ? t(base.titleKey, base.titleParams) : '',
    }
  })

  async function cancel() {
    if (!descriptor.value.available || busy.value) return false
    busy.value = true
    try {
      await extensionsStore.cancelPendingPromptForExtension(
        descriptor.value.extensionId,
        descriptor.value.workspaceRoot,
      )
      toastStore.show(t('Cancelled the blocking extension prompt'), {
        type: 'success',
        duration: 2600,
      })
      return true
    } catch (error) {
      toastStore.show(error?.message || String(error || t('Failed to cancel extension prompt')), {
        type: 'error',
        duration: 4200,
      })
      return false
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    descriptor,
    cancel,
  }
}
