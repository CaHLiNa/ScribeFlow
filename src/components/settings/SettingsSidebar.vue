<template>
  <div class="left-shell-sidebar settings-sidebar-shell" data-surface-context-guard="true">
    <div class="settings-sidebar-header">
      <UiButton
        class="settings-sidebar-back"
        variant="ghost"
        size="icon-sm"
        icon-only
        :title="t('Back to workspace')"
        :aria-label="t('Back to workspace')"
        @click="workspace.closeSettings()"
      >
        <IconArrowLeft :size="18" :stroke-width="2" />
      </UiButton>
    </div>

    <nav class="settings-sidebar-nav" :aria-label="t('Settings sections')">
      <UiButton
        v-for="item in sections"
        :key="item.id"
        class="settings-sidebar-item"
        variant="ghost"
        size="sm"
        block
        :active="activeSection === item.id"
        @click="workspace.setSettingsSection(item.id)"
      >
        <template #leading>
          <component :is="item.icon" :size="16" :stroke-width="1.65" />
        </template>
        {{ item.label }}
      </UiButton>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { IconArrowLeft } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import UiButton from '../shared/ui/UiButton.vue'
import { SETTINGS_SECTION_DEFINITIONS, normalizeSettingsSectionId } from './settingsSections.js'

const workspace = useWorkspaceStore()
const { t } = useI18n()

const sections = computed(() =>
  SETTINGS_SECTION_DEFINITIONS.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }))
)

const activeSection = computed(() => normalizeSettingsSectionId(workspace.settingsSection))
</script>

<style scoped>
.settings-sidebar-shell {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 28px 14px 18px 10px;
  background: var(
    --sidebar-shell-surface,
    color-mix(in srgb, var(--panel-surface) 56%, transparent)
  );
  box-shadow: none;
  backdrop-filter: blur(var(--sidebar-shell-blur, 18px))
    saturate(var(--sidebar-shell-saturate, 1.08));
}

.settings-sidebar-shell > * {
  min-width: 0;
}

.settings-sidebar-shell > :last-child {
  min-height: 0;
}

.settings-sidebar-header {
  display: flex;
  align-items: center;
  padding: 0 12px 10px;
}

.settings-sidebar-nav {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  gap: 4px;
  padding: 0 8px;
}

.settings-sidebar-item {
  justify-content: flex-start;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid transparent !important;
  border-radius: 12px;
  box-shadow: none !important;
  text-align: left;
  color: color-mix(in srgb, var(--text-secondary) 84%, transparent);
  font-size: 14px;
  font-weight: var(--font-weight-medium);
}

.settings-sidebar-item :deep(svg) {
  opacity: 0.76;
}

.settings-sidebar-item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sidebar-item-hover) 92%, transparent);
  border-color: transparent !important;
}

.settings-sidebar-item.is-active {
  background: color-mix(in srgb, var(--sidebar-item-active) 96%, transparent);
  border-color: transparent !important;
  box-shadow: none !important;
  color: var(--text-primary);
}

.settings-sidebar-item.is-active :deep(svg) {
  opacity: 0.92;
  color: color-mix(in srgb, var(--accent) 44%, currentColor);
}

.settings-sidebar-back {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}

.settings-sidebar-back :deep(svg) {
  opacity: 0.96;
}

.settings-sidebar-back:hover:not(:disabled) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 22%, transparent);
  border-color: color-mix(in srgb, var(--border) 36%, transparent);
}

.settings-sidebar-back:hover:not(:disabled) :deep(svg) {
  opacity: 1;
}
</style>
