<template>
  <div v-if="actions.length > 0" class="extension-action-buttons">
    <ExtensionCommandButton
      v-for="action in actions"
      :key="`${action.extensionId}:${action.commandId}`"
      :action="action"
      :target="target"
      :settings="settings"
      :disabled="disabled"
      @started="$emit('started', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useExtensionsStore } from '../../stores/extensions'
import { buildSurfaceContext } from '../../domains/extensions/extensionContributionRegistry'
import ExtensionCommandButton from './ExtensionCommandButton.vue'

const props = defineProps({
  surface: { type: String, required: true },
  target: { type: Object, required: true },
  settings: { type: Object, default: () => ({}) },
  context: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false },
})

defineEmits(['started'])

const extensionsStore = useExtensionsStore()
const surfaceContext = computed(() => buildSurfaceContext(props.target, props.context))
const actions = computed(() => extensionsStore.menuActionsForSurface(props.surface, surfaceContext.value))

onMounted(() => {
  void extensionsStore.refreshRegistryAndTasks().catch(() => {})
})
</script>

<style scoped>
.extension-action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
</style>
