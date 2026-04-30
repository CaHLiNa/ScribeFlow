<template>
  <div v-if="actions.length > 0" class="plugin-action-buttons">
    <PluginCapabilityButton
      v-for="action in actions"
      :key="`${action.pluginId}:${action.id}`"
      :action="action"
      :target="target"
      :settings="settings"
      :disabled="disabled"
      @started="$emit('started', $event)"
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { usePluginsStore } from '../../stores/plugins'
import PluginCapabilityButton from './PluginCapabilityButton.vue'

const props = defineProps({
  surface: { type: String, required: true },
  target: { type: Object, required: true },
  settings: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
})

defineEmits(['started'])

const pluginsStore = usePluginsStore()
const actions = computed(() => pluginsStore.actionsForSurface(props.surface))

onMounted(() => {
  void pluginsStore.refreshRegistry().catch(() => {})
  void pluginsStore.refreshJobs().catch(() => {})
})
</script>

<style scoped>
.plugin-action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
</style>
