<template>
  <section
    class="extension-host-status-surface"
    :class="[
      toneClass,
      compact ? 'is-compact' : '',
    ]"
  >
    <div class="extension-host-status-surface__header">
      <div class="extension-host-status-surface__copy">
        <div v-if="showTitleRow" class="extension-host-status-surface__title-row">
          <div v-if="title" class="extension-host-status-surface__title">{{ title }}</div>
          <span v-if="badge" class="extension-host-status-surface__badge">{{ badge }}</span>
          <slot name="title-suffix" />
        </div>
        <div v-if="description" class="extension-host-status-surface__description">
          {{ description }}
        </div>
        <slot name="copy-extra" />
      </div>

      <div v-if="hasActions" class="extension-host-status-surface__actions">
        <slot name="actions-before" />
        <UiButton
          v-if="recoveryAction?.available"
          variant="ghost"
          size="sm"
          :disabled="recoveryAction.busy"
          :title="recoveryAction.title"
          @click="$emit('recover')"
        >
          {{ recoveryAction.label }}
        </UiButton>
        <slot name="actions-after" />
      </div>
    </div>

    <div v-if="$slots.meta" class="extension-host-status-surface__meta">
      <slot name="meta" />
    </div>

    <div v-if="$slots.default" class="extension-host-status-surface__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  title: { type: String, default: '' },
  badge: { type: String, default: '' },
  description: { type: String, default: '' },
  toneClass: { type: String, default: '' },
  recoveryAction: {
    type: Object,
    default: () => ({
      available: false,
      busy: false,
      label: '',
      title: '',
    }),
  },
  compact: { type: Boolean, default: false },
})

defineEmits(['recover'])

const slots = useSlots()

const showTitleRow = computed(() =>
  Boolean(props.title || props.badge || slots['title-suffix'])
)

const hasActions = computed(() =>
  Boolean(props.recoveryAction?.available || slots['actions-before'] || slots['actions-after'])
)
</script>

<style scoped>
.extension-host-status-surface {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--border) 34%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
}

.extension-host-status-surface.is-compact {
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
}

.extension-host-status-surface.is-active {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.extension-host-status-surface.is-info {
  border-color: color-mix(in srgb, var(--accent) 20%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-base));
}

.extension-host-status-surface.is-warning {
  border-color: color-mix(in srgb, #d97706 32%, var(--border));
  background: color-mix(in srgb, #d97706 8%, var(--surface-base));
}

.extension-host-status-surface__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.extension-host-status-surface__copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

.extension-host-status-surface__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.extension-host-status-surface__title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.extension-host-status-surface__badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.extension-host-status-surface__description {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.extension-host-status-surface__actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.extension-host-status-surface__meta,
.extension-host-status-surface__body {
  min-width: 0;
}
</style>
