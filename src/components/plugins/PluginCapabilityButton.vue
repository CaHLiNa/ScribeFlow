<template>
  <UiButton
    variant="secondary"
    size="sm"
    :disabled="disabled || busy"
    :loading="busy"
    @click="start"
  >
    <template #leading>
      <IconBolt :size="14" />
    </template>
    {{ label }}
  </UiButton>
</template>

<script setup>
import { computed, ref } from 'vue'
import { IconBolt } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { usePluginsStore } from '../../stores/plugins'
import { useToastStore } from '../../stores/toast'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  capability: { type: String, default: '' },
  action: { type: Object, default: null },
  target: { type: Object, required: true },
  settings: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['started'])
const { t } = useI18n()
const pluginsStore = usePluginsStore()
const toastStore = useToastStore()
const busy = ref(false)

const action = computed(() => props.action || null)
const capability = computed(() => String(action.value?.capability || props.capability || '').trim())
const enabledPluginIds = computed(() => new Set(pluginsStore.enabledPluginIds))
const provider = computed(() =>
  action.value?.pluginId
    ? pluginsStore.registry.find((plugin) =>
        plugin.id === action.value.pluginId &&
        plugin.status === 'available' &&
        enabledPluginIds.value.has(plugin.id)
      )
    : pluginsStore.defaultProviderForCapability(capability.value)
)
const label = computed(() => props.label || t(action.value?.label || 'Run plugin action'))
const disabled = computed(() => props.disabled || !provider.value || !capability.value)

async function start() {
  if (disabled.value || busy.value) return
  busy.value = true
  try {
    const job = action.value?.pluginId
      ? await pluginsStore.startPluginAction(action.value, props.target, props.settings)
      : await pluginsStore.startCapabilityJob(capability.value, props.target, props.settings)
    emit('started', job)
    toastStore.show(t('Plugin job started'), { type: 'success', duration: 2400 })
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to start plugin job')), {
      type: 'error',
      duration: 4200,
    })
  } finally {
    busy.value = false
  }
}
</script>
