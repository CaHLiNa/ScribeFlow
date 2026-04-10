<template>
  <div class="left-shell-sidebar settings-sidebar-shell">
    <div class="settings-sidebar-header">
      <h2 class="settings-sidebar-title">{{ t('Settings') }}</h2>
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

    <div class="settings-sidebar-footer">
      <UiButton
        class="settings-sidebar-back"
        variant="ghost"
        size="sm"
        @click="workspace.closeSettings()"
      >
        {{ t('Back to workspace') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import UiButton from '../shared/ui/UiButton.vue'
import { SETTINGS_SECTION_DEFINITIONS } from './settingsSections.js'

const workspace = useWorkspaceStore()
const { t } = useI18n()

const sections = computed(() =>
  SETTINGS_SECTION_DEFINITIONS.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }))
)

const activeSection = computed(() => workspace.settingsSection || 'theme')
</script>

<style scoped>
.settings-sidebar-shell {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 24px 14px 84px 6px;
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
  flex-direction: column;
  gap: 0;
  padding: 4px 14px 18px;
}

.settings-sidebar-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.08;
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.02em;
  color: var(--text-primary);
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
  background: color-mix(in srgb, var(--surface-hover) 16%, transparent);
  border-color: color-mix(in srgb, var(--border-subtle) 14%, transparent) !important;
}

.settings-sidebar-item.is-active {
  background: color-mix(in srgb, var(--surface-hover) 22%, transparent);
  border-color: color-mix(in srgb, var(--border-subtle) 18%, transparent) !important;
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--accent) 38%, transparent) !important;
  color: var(--text-primary);
}

.settings-sidebar-item.is-active :deep(svg) {
  opacity: 0.92;
  color: color-mix(in srgb, var(--accent) 44%, currentColor);
}

.settings-sidebar-footer {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  display: flex;
  align-items: flex-end;
  padding: 0;
}

.settings-sidebar-footer :deep(.ui-button) {
  justify-content: flex-start;
  min-height: auto !important;
  width: auto !important;
  padding: 0 !important;
  border-radius: 0 !important;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
  font-size: 13px;
  line-height: 1.2;
}

.settings-sidebar-footer :deep(.settings-sidebar-back) {
  border-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
}

.settings-sidebar-footer :deep(.settings-sidebar-back:hover:not(:disabled)) {
  background: transparent !important;
  border-color: transparent !important;
  color: var(--text-primary);
}

.settings-sidebar-footer :deep(.settings-sidebar-back:active:not(:disabled)) {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  transform: none;
}

.settings-sidebar-footer :deep(.settings-sidebar-back:focus-visible) {
  box-shadow: none !important;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
</style>
