<template>
  <div class="settings-surface" data-surface-context-guard="true">
    <header class="settings-header">
      <h2 class="settings-header-title">{{ activeSectionLabel }}</h2>
    </header>

    <div class="settings-content">
      <component :is="activeSectionComponent" :key="activeSection" />
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { SETTINGS_SECTION_DEFINITIONS } from './settingsSections.js'

const SettingsTheme = defineAsyncComponent(() => import('./SettingsTheme.vue'))
const SettingsEditor = defineAsyncComponent(() => import('./SettingsEditor.vue'))
const SettingsEnvironment = defineAsyncComponent(() => import('./SettingsEnvironment.vue'))
const SettingsUpdates = defineAsyncComponent(() => import('./SettingsUpdates.vue'))

const workspace = useWorkspaceStore()
const { t } = useI18n()

const sections = computed(() =>
  SETTINGS_SECTION_DEFINITIONS.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }))
)

const sectionComponents = {
  theme: SettingsTheme,
  editor: SettingsEditor,
  system: SettingsEnvironment,
  updates: SettingsUpdates,
}

const activeSection = computed(() =>
  sectionComponents[workspace.settingsSection] ? workspace.settingsSection : 'theme'
)

const activeSectionMeta = computed(
  () => sections.value.find((item) => item.id === activeSection.value) || sections.value[0]
)

const activeSectionLabel = computed(() => activeSectionMeta.value?.label ?? t('Settings'))
const activeSectionComponent = computed(
  () => sectionComponents[activeSection.value] || SettingsTheme
)
</script>

<style scoped>
.settings-surface {
  --settings-row-surface: color-mix(in srgb, var(--surface-muted) 74%, transparent);
  --settings-row-border: color-mix(in srgb, var(--border-subtle) 34%, transparent);
  --settings-control-surface: color-mix(in srgb, var(--surface-hover) 82%, var(--surface-muted));
  --settings-control-surface-hover: color-mix(
    in srgb,
    var(--surface-hover) 90%,
    var(--surface-muted)
  );
  --settings-popover-surface: color-mix(in srgb, var(--surface-muted) 92%, var(--surface-base));
  --settings-control-border: color-mix(in srgb, var(--border-subtle) 42%, transparent);
  --settings-control-border-strong: color-mix(in srgb, var(--border-subtle) 58%, transparent);
  --settings-control-shadow: none;
  --settings-popover-shadow: 0 18px 38px rgba(0, 0, 0, 0.08), 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 28px 28px 18px 18px;
  background: transparent;
}

.theme-light .settings-surface {
  --settings-row-surface: rgba(221, 224, 229, 0.72);
  --settings-row-border: rgba(160, 166, 176, 0.26);
  --settings-control-surface: rgba(212, 216, 222, 0.9);
  --settings-control-surface-hover: rgba(205, 210, 217, 0.96);
  --settings-popover-surface: rgba(228, 231, 236, 0.98);
  --settings-control-border: rgba(154, 160, 169, 0.34);
  --settings-control-border-strong: rgba(136, 143, 153, 0.44);
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 2px 4px 16px;
}

.settings-header-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.06;
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.settings-content {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  justify-content: flex-start;
  overflow-y: auto;
  padding: 0 4px 18px 0;
}
</style>

<style>
.settings-surface .settings-section-title {
  display: none;
}

.settings-surface .settings-hint {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  margin: -8px 0 16px;
}

.settings-surface .settings-hint code {
  background: var(--surface-muted);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--ui-font-micro);
}

.settings-surface .settings-choice-grid {
  display: grid;
  gap: var(--space-2);
}

.settings-surface .settings-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 100%;
  width: min(100%, 760px);
}

.settings-surface .settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-surface .settings-group-title {
  margin: 0;
  padding: 0 4px;
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: color-mix(in srgb, var(--text-secondary) 72%, transparent);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settings-surface .settings-group-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: visible;
}

.settings-surface .settings-page::after {
  content: '';
  flex: 1 0 20px;
}

.settings-surface .settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 15px;
  border-radius: 14px;
  background: var(--settings-row-surface);
  border: 1px solid var(--settings-row-border);
  box-shadow: none;
}

.settings-surface .settings-row-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-surface .settings-row-title {
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: color-mix(in srgb, var(--text-primary) 94%, transparent);
  line-height: 1.35;
}

.settings-surface .settings-row-hint {
  font-size: 12px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--text-secondary) 76%, transparent);
}

.settings-surface .settings-row-control {
  flex: 0 0 auto;
  align-self: center;
  min-width: 116px;
  display: flex;
  justify-content: flex-end;
}

.settings-surface .settings-row-control.compact {
  min-width: auto;
}

.settings-surface .settings-row-control .ui-select-shell {
  border-radius: 11px;
  background: transparent;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger {
  border-radius: 11px;
  border-color: var(--settings-control-border) !important;
  background: var(--settings-control-surface) !important;
  color: color-mix(in srgb, var(--text-primary) 92%, transparent) !important;
  box-shadow: var(--settings-control-shadow) !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:hover:not(:disabled) {
  background: var(--settings-control-surface-hover) !important;
  border-color: var(--settings-control-border-strong) !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 26%, transparent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}

.settings-surface .settings-row-control .ui-select-shell.is-open .ui-select-trigger {
  background: var(--settings-control-surface-hover) !important;
  border-color: var(--settings-control-border-strong) !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-value {
  font-size: 13px;
  color: color-mix(in srgb, var(--text-primary) 92%, transparent);
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-caret {
  right: 10px;
  color: color-mix(in srgb, var(--text-muted) 82%, transparent);
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-menu {
  margin-top: 6px;
  padding: 4px;
  border-color: var(--settings-control-border) !important;
  border-radius: 12px;
  background: var(--settings-popover-surface) !important;
  box-shadow: var(--settings-popover-shadow) !important;
  backdrop-filter: blur(18px) saturate(0.92);
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-option {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 9px;
  font-size: 13px;
  color: color-mix(in srgb, var(--text-secondary) 92%, transparent);
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-option:hover:not(:disabled),
.settings-surface
  .settings-row-control
  .ui-select-shell
  .ui-select-option.is-highlighted:not(:disabled) {
  background: var(--settings-control-surface) !important;
  color: var(--text-primary);
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-option.is-selected {
  background: color-mix(in srgb, var(--settings-control-surface) 92%, white 8%) !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-option-check {
  color: color-mix(in srgb, var(--text-primary) 86%, transparent);
}

.settings-surface .settings-row-control .ui-button.ui-button--secondary {
  background: var(--settings-control-surface) !important;
  border-color: var(--settings-control-border) !important;
  color: color-mix(in srgb, var(--text-primary) 90%, transparent) !important;
  box-shadow: var(--settings-control-shadow) !important;
  border-radius: 11px;
}

.settings-surface .settings-row-control .ui-button.ui-button--secondary:hover:not(:disabled) {
  background: var(--settings-control-surface-hover) !important;
  border-color: var(--settings-control-border-strong) !important;
  color: var(--text-primary);
}

.settings-surface button.ui-switch.ui-switch--md {
  width: 38px;
  height: 22px;
  background: color-mix(in srgb, var(--text-secondary) 28%, var(--settings-control-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--settings-control-border) 90%, transparent);
}

.settings-surface button.ui-switch.ui-switch--md.is-on {
  background: color-mix(in srgb, var(--accent) 28%, var(--settings-control-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent);
}

.settings-surface button.ui-switch.ui-switch--md:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-secondary) 28%, var(--settings-control-surface-hover));
}

.settings-surface button.ui-switch.ui-switch--md.is-on:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 38%, var(--settings-control-surface-hover));
}

.settings-surface button.ui-switch.ui-switch--md .ui-switch-knob {
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: color-mix(in srgb, white 88%, var(--surface-base));
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.12),
    0 0 0 1px color-mix(in srgb, var(--text-muted) 26%, transparent);
}

.settings-surface button.ui-switch.ui-switch--md.is-on .ui-switch-knob {
  transform: translateX(16px);
}

.settings-surface .settings-choice-card {
  justify-content: flex-start;
  align-items: stretch;
  padding: 12px 14px;
  text-align: left;
  border-radius: 12px;
}

.settings-surface .settings-choice-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--border) 34%, transparent);
  background: color-mix(in srgb, var(--surface-hover) 42%, transparent);
}

.settings-surface .settings-choice-card.is-active {
  border-color: color-mix(in srgb, var(--border) 36%, transparent);
  background: color-mix(in srgb, var(--settings-control-surface) 84%, transparent);
  color: var(--text-primary);
}

.settings-surface .settings-choice-card-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-surface .settings-choice-card-title {
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.settings-surface .settings-choice-card-desc {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
}

.settings-surface .settings-choice-card-meta {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  margin-top: var(--space-1);
  padding: 2px 7px;
  border-radius: 999px;
  font-size: var(--ui-font-micro);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-base) 32%, transparent);
}

.settings-surface .settings-choice-card-meta.is-good {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.settings-surface .settings-segmented {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--settings-control-border) 80%, transparent);
  border-radius: 11px;
  background: var(--settings-control-surface);
  box-shadow: var(--settings-control-shadow);
}

.settings-surface .settings-segmented-btn {
  min-height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  font: inherit;
  cursor: pointer;
}

.settings-surface .settings-segmented-btn.is-active {
  background: var(--settings-control-surface-hover);
  color: var(--text-primary);
}

.settings-surface .settings-segmented-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--settings-control-surface) 94%, white 6%);
}

.settings-surface .settings-list-button {
  justify-content: flex-start;
  width: 100%;
  padding: 6px 8px;
  text-align: left;
}

.settings-surface .settings-list-button.is-active {
  background: color-mix(in srgb, var(--surface-base) 92%, var(--toolbar-surface));
  color: var(--text-primary);
}

.settings-surface .settings-list-button-copy {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.settings-surface .settings-disclosure-button {
  justify-content: flex-start;
  gap: 6px;
  padding: 0;
  min-height: 24px;
  color: var(--text-muted);
}

.settings-surface .settings-disclosure-button:hover:not(:disabled) {
  color: var(--text-secondary);
  background: transparent;
}

.settings-surface .settings-disclosure-icon {
  transition: transform 0.15s ease;
  transform-origin: center;
}

.settings-surface .settings-disclosure-button.is-active .settings-disclosure-icon {
  transform: rotate(90deg);
}

.settings-surface .env-lang-card {
  border: 1px solid color-mix(in srgb, var(--border-subtle) 34%, transparent);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--surface-base) 32%, transparent);
}

.settings-surface .env-lang-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-surface .env-lang-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.settings-surface .env-lang-dot.good {
  background: var(--success, #50fa7b);
}

.settings-surface .env-lang-dot.warn {
  background: var(--warning, #e2b93d);
}

.settings-surface .env-lang-dot.none {
  background: var(--fg-muted);
  opacity: 0.4;
}

.settings-surface .env-lang-name {
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.settings-surface .env-lang-version {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.settings-surface .env-lang-missing {
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  font-style: italic;
}

.settings-surface .env-lang-hint {
  margin-top: 4px;
  padding-left: 16px;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.settings-surface .settings-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: none;
}

.settings-surface .settings-link:hover {
  text-decoration: underline;
}

@media (max-width: 720px) {
  .settings-surface {
    padding: 28px 18px 18px;
  }

  .settings-surface .settings-row {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-surface .settings-row-control {
    width: 100%;
    justify-content: flex-start;
  }

  .settings-surface .settings-page {
    width: 100%;
  }
}
</style>
