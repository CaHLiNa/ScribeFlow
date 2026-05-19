<template>
  <div class="workspace-footer-action">
    <UiButton
      class="workspace-footer-icon-button"
      variant="ghost"
      size="icon-sm"
      icon-only
      :title="t('Settings ({shortcut})', { shortcut: `${modKey}+,` })"
      :aria-label="t('Settings')"
      @click.stop="$emit('open-settings')"
    >
      <IconSettings :size="17" :stroke-width="1.8" />
    </UiButton>

    <UiButton
      class="workspace-footer-action-button"
      variant="ghost"
      size="sm"
      block
      :title="t('Open Folder...')"
      :aria-label="t('Open Folder...')"
      @click.stop="$emit('open-folder')"
    >
      {{ t('Open Folder...') }}
    </UiButton>

    <UiButton
      class="workspace-footer-icon-button"
      variant="ghost"
      size="icon-sm"
      icon-only
      :title="t('Workspace Menu')"
      :aria-label="t('Workspace Menu')"
      @click.stop="$emit('toggle-workspace-menu', $event.currentTarget)"
    >
      <IconDotsVertical :size="17" :stroke-width="1.8" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { IconDotsVertical, IconSettings } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { modKey } from '../../platform'
import UiButton from '../shared/ui/UiButton.vue'

defineEmits(['open-folder', 'open-settings', 'toggle-workspace-menu'])

const { t } = useI18n()
</script>

<style scoped>
.workspace-footer-action {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 4px 0 0;
  background: transparent;
}

.workspace-footer-icon-button {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: color-mix(in srgb, var(--fg-muted) 78%, transparent);
  opacity: 0.86;
}

.workspace-footer-icon-button:hover:not(:disabled) {
  opacity: 1;
  background: transparent;
}

.workspace-footer-icon-button:focus-visible {
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 46%, transparent);
}

.workspace-footer-action-button {
  position: relative;
  flex: 1 1 auto;
  min-height: 32px;
  justify-content: center;
  padding-inline: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--fg-secondary);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease;
}

.workspace-footer-action-button :deep(.ui-button-label) {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: var(--sidebar-font-item);
  letter-spacing: 0;
  line-height: 1.1;
}

.workspace-footer-action-button:hover:not(:disabled) {
  background: transparent;
  color: var(--fg-primary);
}

.workspace-footer-action-button:focus-visible {
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 46%, transparent);
}
</style>
