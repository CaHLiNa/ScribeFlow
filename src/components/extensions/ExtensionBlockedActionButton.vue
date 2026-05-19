<template>
  <UiButton
    v-if="!native"
    v-bind="boundProps"
    @click="$emit('click', $event)"
  >
    {{ displayLabel }}
  </UiButton>

  <button
    v-else
    type="button"
    v-bind="boundProps"
    @click="$emit('click', $event)"
  >
    {{ displayLabel }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  native: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false },
  blockedLabel: { type: String, default: '' },
  blockedMessage: { type: String, default: '' },
  label: { type: String, default: '' },
  title: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'sm' },
  block: { type: Boolean, default: false },
  extraClass: { type: [String, Object, Array], default: '' },
})

defineEmits(['click'])

const displayLabel = computed(() => (
  props.blocked ? (props.blockedLabel || props.label) : props.label
))

const displayTitle = computed(() => (
  props.blocked ? (props.blockedMessage || props.title) : props.title
))

const displayDisabled = computed(() => (
  props.disabled || props.blocked
))

const boundProps = computed(() => {
  const common = {
    class: props.extraClass,
    title: displayTitle.value,
    'aria-label': displayTitle.value,
    disabled: displayDisabled.value,
  }

  if (!props.native) {
    return {
      ...common,
      variant: props.variant,
      size: props.size,
      loading: props.loading,
      block: props.block,
    }
  }

  return common
})
</script>
