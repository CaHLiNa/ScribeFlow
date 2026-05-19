<template>
  <ExtensionBlockedActionButton
    :disabled="disabled"
    :loading="busy.value"
    :blocked="blockPresentation.blocked"
    :blocked-label="blockPresentation.label"
    :blocked-message="blockPresentation.message"
    :label="label"
    :title="label"
    @click="start"
  >
    <template #leading>
      <IconBolt :size="14" />
    </template>
  </ExtensionBlockedActionButton>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconBolt } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { buildExtensionCommandHostState } from '../../domains/extensions/extensionCommandHostState'
import { describeExtensionHostStatePresentation } from '../../domains/extensions/extensionRuntimeBlockPresentation'
import ExtensionBlockedActionButton from './ExtensionBlockedActionButton.vue'

const props = defineProps({
  action: { type: Object, default: null },
  target: { type: Object, required: true },
  settings: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['started'])
const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const workspaceStore = useWorkspaceStore()
const toastStore = useToastStore()
const busy = ref(false)

const action = computed(() => props.action || null)
const commandId = computed(() => String(action.value?.commandId || '').trim())
const enabledExtensionIds = computed(() => new Set(extensionsStore.enabledExtensionIds))
const extension = computed(() =>
  action.value?.extensionId
    ? extensionsStore.registry.find((extension) =>
        extension.id === action.value.extensionId &&
        extension.status === 'available' &&
        enabledExtensionIds.value.has(extension.id)
      )
    : null
)
const label = computed(() => props.label || t(action.value?.title || 'Run extension action'))
const hostState = computed(() => {
  if (!action.value?.extensionId) return buildExtensionCommandHostState()
  return buildExtensionCommandHostState(
    extensionsStore.hostDiagnosticsFor(action.value.extensionId, workspaceStore.path || '')
  )
})
const blockPresentation = computed(() => describeExtensionHostStatePresentation(hostState.value, t))
const disabled = computed(() =>
  props.disabled ||
  busy.value ||
  !extension.value ||
  !commandId.value ||
  !action.value?.extensionId ||
  blockPresentation.value.blocked
)

async function start() {
  if (disabled.value || busy.value) return
  busy.value = true
  try {
    const task = await extensionsStore.executeCommand(action.value, props.target, props.settings)
    emit('started', task)
    toastStore.show(t('Extension task started'), { type: 'success', duration: 2400 })
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to start extension task')), {
      type: 'error',
      duration: 4200,
    })
  } finally {
    busy.value = false
  }
}
</script>
