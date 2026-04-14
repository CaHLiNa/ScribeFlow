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
const SettingsZotero = defineAsyncComponent(() => import('./SettingsZotero.vue'))

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
  zotero: SettingsZotero,
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
  --settings-row-surface: var(--surface-base);
  --settings-row-border: color-mix(in srgb, var(--border-subtle) 40%, transparent);
  --settings-control-surface: var(--surface-raised);
  --settings-control-surface-hover: color-mix(in srgb, var(--surface-hover) 80%, transparent);
  --settings-popover-surface: var(--surface-raised);
  --settings-control-border: color-mix(in srgb, var(--border-subtle) 60%, transparent);
  --settings-control-border-strong: color-mix(in srgb, var(--border) 80%, transparent);
  --settings-control-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  --settings-popover-shadow: var(--shadow-md);
  
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 32px 32px 20px 24px;
  background: transparent;
}

.theme-light .settings-surface {
  --settings-row-surface: #ffffff;
  --settings-row-border: rgba(0, 0, 0, 0.1);
  --settings-control-surface: #ffffff;
  --settings-control-surface-hover: rgba(0, 0, 0, 0.04);
  --settings-control-border: rgba(0, 0, 0, 0.15);
  --settings-control-border-strong: rgba(0, 0, 0, 0.25);
  --settings-control-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 0 0 20px;
}

.settings-header-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.01em;
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
/* 重构为 macOS Ventura 分组列表风格 */
.settings-surface .settings-section-title {
  display: none;
}

.settings-surface .settings-page {
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-height: 100%;
  width: min(100%, 720px);
}

.settings-surface .settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-surface .settings-group-title {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

/* 核心：将所有行包裹在一个连续的白底/黑底边框容器中 */
.settings-surface .settings-group-body {
  display: flex;
  flex-direction: column;
  background: var(--settings-row-surface);
  border: 1px solid var(--settings-row-border);
  border-radius: 8px; /* 紧凑的容器圆角 */
  overflow: hidden; /* 切掉内部直角 */
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.settings-surface .settings-page::after {
  content: '';
  flex: 1 0 20px;
}

/* 去掉单行的独立背景和边框，改为下划线分割 */
.settings-surface .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--settings-row-border);
  box-shadow: none;
}

/* 最后一行去掉分割线 */
.settings-surface .settings-row:last-child {
  border-bottom: none;
}

.settings-surface .settings-row-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-surface .settings-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
}

.settings-surface .settings-row-hint {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}

.settings-surface .settings-row-control {
  flex: 0 0 auto;
  align-self: center;
  min-width: 140px;
  display: flex;
  justify-content: flex-end;
}

.settings-surface .settings-row-control.compact {
  min-width: auto;
}

/* 原生化的 Select 和 Button 控件 */
.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger,
.settings-surface .settings-row-control .ui-button.ui-button--secondary {
  border-radius: 6px !important; /* 修正原来 11px 的圆润网页感 */
  border: 1px solid var(--settings-control-border) !important;
  background: var(--settings-control-surface) !important;
  color: var(--text-primary) !important;
  box-shadow: var(--settings-control-shadow) !important;
  min-height: 26px !important;
  font-size: 13px !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:hover:not(:disabled),
.settings-surface .settings-row-control .ui-button.ui-button--secondary:hover:not(:disabled) {
  background: var(--settings-control-surface-hover) !important;
  border-color: var(--settings-control-border-strong) !important;
}

/* Switch 调整为原生比例 */
.settings-surface button.ui-switch.ui-switch--md {
  width: 36px;
  height: 20px;
  background: var(--border);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
}
.settings-surface button.ui-switch.ui-switch--md.is-on {
  background: var(--success);
  box-shadow: none;
}
.settings-surface button.ui-switch.ui-switch--md .ui-switch-knob {
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.settings-surface button.ui-switch.ui-switch--md.is-on .ui-switch-knob {
  transform: translateX(16px);
}

/* 分段控制器 (Segmented Control) 紧凑化 */
.settings-surface .settings-segmented {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px;
  border: 1px solid var(--settings-control-border);
  border-radius: 6px;
  background: var(--settings-control-surface);
  box-shadow: var(--settings-control-shadow);
}

.settings-surface .settings-segmented-btn {
  min-height: 22px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.settings-surface .settings-segmented-btn.is-active {
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

@media (max-width: 720px) {
  .settings-surface {
    padding: 24px 16px 16px;
  }
  .settings-surface .settings-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .settings-surface .settings-row-control {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>

<style>
.settings-surface .settings-section-title { display: none; }

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

.settings-surface .settings-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 100%;
  width: min(100%, 720px);
}

.settings-surface .settings-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-surface .settings-group-title {
  margin: 0;
  padding: 0 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
}

/* ★ Unified List Box */
.settings-surface .settings-group-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--surface-base);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}

.settings-surface .settings-page::after { content: ''; flex: 1 0 20px; }

/* ★ Unified List Row */
.settings-surface .settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 30%, transparent);
  box-shadow: none;
}

.settings-surface .settings-row:last-child {
  border-bottom: none;
}

.settings-surface .settings-row-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-surface .settings-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.settings-surface .settings-row-hint {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}

.settings-surface .settings-row-control {
  flex: 0 0 auto;
  align-self: center;
  min-width: 116px;
  display: flex;
  justify-content: flex-end;
}
.settings-surface .settings-row-control.compact { min-width: auto; }

/* Control overwrites... (selects, buttons, switches) */
.settings-surface .settings-row-control .ui-select-shell { border-radius: 6px; background: transparent; }
.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger { border-radius: 6px; border-color: var(--settings-control-border) !important; background: var(--settings-control-surface) !important; color: color-mix(in srgb, var(--text-primary) 92%, transparent) !important; box-shadow: var(--settings-control-shadow) !important; }
.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:hover:not(:disabled) { background: var(--settings-control-surface-hover) !important; border-color: var(--settings-control-border-strong) !important; }
.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:focus-visible { border-color: color-mix(in srgb, var(--accent) 26%, transparent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent); }
.settings-surface .settings-row-control .ui-select-shell.is-open .ui-select-trigger { background: var(--settings-control-surface-hover) !important; border-color: var(--settings-control-border-strong) !important; }
.settings-surface .settings-row-control .ui-select-shell .ui-select-value { font-size: 13px; color: color-mix(in srgb, var(--text-primary) 92%, transparent); }
.settings-surface .settings-row-control .ui-select-shell .ui-select-caret { right: 10px; color: color-mix(in srgb, var(--text-muted) 82%, transparent); }
.settings-surface .settings-row-control .ui-select-shell .ui-select-menu { margin-top: 6px; padding: 4px; border-color: var(--settings-control-border) !important; border-radius: 8px; background: var(--settings-popover-surface) !important; box-shadow: var(--settings-popover-shadow) !important; backdrop-filter: blur(18px) saturate(0.92); }
.settings-surface .settings-row-control .ui-select-shell .ui-select-option { min-height: 26px; padding: 0 10px; border-radius: 5px; font-size: 13px; color: color-mix(in srgb, var(--text-secondary) 92%, transparent); }
.settings-surface .settings-row-control .ui-select-shell .ui-select-option:hover:not(:disabled), .settings-surface .settings-row-control .ui-select-shell .ui-select-option.is-highlighted:not(:disabled) { background: var(--settings-control-surface) !important; color: var(--text-primary); }
.settings-surface .settings-row-control .ui-select-shell .ui-select-option.is-selected { background: color-mix(in srgb, var(--settings-control-surface) 92%, white 8%) !important; }
.settings-surface .settings-row-control .ui-select-shell .ui-select-option-check { color: color-mix(in srgb, var(--text-primary) 86%, transparent); }

.settings-surface .settings-row-control .ui-button.ui-button--secondary { background: var(--settings-control-surface) !important; border-color: var(--settings-control-border) !important; color: color-mix(in srgb, var(--text-primary) 90%, transparent) !important; box-shadow: var(--settings-control-shadow) !important; border-radius: 6px; }
.settings-surface .settings-row-control .ui-button.ui-button--secondary:hover:not(:disabled) { background: var(--settings-control-surface-hover) !important; border-color: var(--settings-control-border-strong) !important; color: var(--text-primary); }

.settings-surface button.ui-switch.ui-switch--md { width: 36px; height: 20px; background: color-mix(in srgb, var(--text-secondary) 28%, var(--settings-control-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--settings-control-border) 90%, transparent); }
.settings-surface button.ui-switch.ui-switch--md.is-on { background: color-mix(in srgb, var(--accent) 28%, var(--settings-control-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent); }
.settings-surface button.ui-switch.ui-switch--md:hover:not(:disabled) { background: color-mix(in srgb, var(--text-secondary) 28%, var(--settings-control-surface-hover)); }
.settings-surface button.ui-switch.ui-switch--md.is-on:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 38%, var(--settings-control-surface-hover)); }
.settings-surface button.ui-switch.ui-switch--md .ui-switch-knob { top: 2px; left: 2px; width: 16px; height: 16px; background: color-mix(in srgb, white 88%, var(--surface-base)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 1px color-mix(in srgb, var(--text-muted) 26%, transparent); }
.settings-surface button.ui-switch.ui-switch--md.is-on .ui-switch-knob { transform: translateX(16px); }

.settings-surface .settings-segmented { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid color-mix(in srgb, var(--settings-control-border) 80%, transparent); border-radius: 6px; background: var(--settings-control-surface); box-shadow: var(--settings-control-shadow); }
.settings-surface .settings-segmented-btn { min-height: 22px; padding: 0 10px; border: none; border-radius: 4px; background: transparent; color: color-mix(in srgb, var(--text-secondary) 86%, transparent); font: inherit; cursor: pointer; }
.settings-surface .settings-segmented-btn.is-active { background: var(--settings-control-surface-hover); color: var(--text-primary); }
.settings-surface .settings-segmented-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--settings-control-surface) 94%, white 6%); }

/* Responsive */
@media (max-width: 720px) {
  .settings-surface { padding: 28px 18px 18px; }
  .settings-surface .settings-row { flex-direction: column; align-items: stretch; }
  .settings-surface .settings-row-control { width: 100%; justify-content: flex-start; }
  .settings-surface .settings-page { width: 100%; }
}
</style>
