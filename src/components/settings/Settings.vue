<!-- START OF FILE src/components/settings/Settings.vue -->
<template>
  <div class="settings-surface" data-surface-context-guard="true">
    <header class="settings-header">
      <h2 class="settings-header-title">{{ activeSectionLabel }}</h2>
    </header>

    <div class="settings-content scrollbar-hidden">
      <component :is="activeSectionComponent" :key="activeSection" />
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import { SETTINGS_SECTION_DEFINITIONS, normalizeSettingsSectionId } from './settingsSections.js'

const SettingsGeneral = defineAsyncComponent(() => import('./SettingsGeneral.vue'))
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
  general: SettingsGeneral,
  editor: SettingsEditor,
  system: SettingsEnvironment,
  updates: SettingsUpdates,
  zotero: SettingsZotero,
}

const activeSection = computed(() =>
  sectionComponents[normalizeSettingsSectionId(workspace.settingsSection)]
    ? normalizeSettingsSectionId(workspace.settingsSection)
    : 'general'
)

const activeSectionMeta = computed(
  () => sections.value.find((item) => item.id === activeSection.value) || sections.value[0]
)

const activeSectionLabel = computed(() => activeSectionMeta.value?.label ?? t('Settings'))
const activeSectionComponent = computed(
  () => sectionComponents[activeSection.value] || SettingsGeneral
)
</script>

/* START OF FILE src/components/settings/Settings.vue (只替换 style 部分) */
<style scoped>
.settings-surface {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: transparent;
  --settings-select-width: 280px;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: center; /* 标题与内容同步居中 */
  padding: 32px 0 16px;
}

.settings-header-title {
  margin: 0;
  width: 100%;
  max-width: 800px; /* 约束居中时的最大宽度，与下方内容对齐 */
  padding: 0 32px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.settings-content {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center; /* 核心修复：让内部的 page 绝对居中 */
  overflow-y: auto;
  padding: 16px 0 64px 0;
}
</style>

<style>
/* ==========================================================================
   居中极简无边界排版 (Centered Borderless Flat Layout)
========================================================================== */
.settings-surface .settings-section-title {
  display: none; /* Already indicated by sidebar, remove redundant big titles */
}

.settings-surface .settings-page {
  display: flex;
  flex-direction: column;
  gap: 48px;
  width: 100%;
  max-width: 800px; /* 响应式最大宽度，保证在大屏下有舒适的左右留白 */
  padding: 0 32px; /* 给窄屏留出安全边距 */
  box-sizing: border-box;
}

.settings-surface .settings-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-surface .settings-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  padding-left: 8px;
  padding-top: 16px;
}

.settings-surface .settings-group-body {
  display: flex;
  flex-direction: column;
  background: var(--surface-base);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  padding: 0;
}

.settings-surface .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  background: transparent;
  transition: background-color 0.15s ease;
}
.settings-surface .settings-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 20%, transparent);
}

.settings-surface .settings-row:last-child {
  border-bottom: none;
}

.settings-surface .settings-row-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.settings-surface .settings-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.3;
}

.settings-surface .settings-row-hint {
  font-size: 12px;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
  line-height: 1.4;
  margin-top: 2px;
}

/* 右侧控件容器 */
.settings-surface .settings-row-control {
  flex: 0 0 auto;
  min-width: 160px;
  width: min(100%, var(--settings-select-width));
  display: flex;
  justify-content: flex-end;
}

.settings-surface .settings-row-control.compact {
  width: auto;
  min-width: auto;
}

.settings-surface .settings-row-control .ui-select-shell {
  width: 100%;
}

/* =========================================================================
   控件复原：保持内敛和小巧 (iOS/macOS 原生高度)
========================================================================= */
.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger,
.settings-surface .settings-row-control .ui-button.ui-button--secondary,
.settings-surface .settings-row-control .ui-button.ui-button--danger {
  min-height: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  padding: 0 12px !important;
  font-size: 13px !important;
  background: var(--surface-raised) !important;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
  color: var(--text-primary) !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger {
  padding: 0 24px 0 12px !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:hover:not(:disabled),
.settings-surface .settings-row-control .ui-button:hover:not(:disabled) {
  background: var(--surface-hover) !important;
  border-color: var(--border) !important;
}

.settings-surface button.ui-switch.ui-switch--md {
  width: 38px;
  height: 22px;
  background: var(--border);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}
.settings-surface button.ui-switch.ui-switch--md.is-on {
  background: var(--success);
  box-shadow: none;
}
.settings-surface button.ui-switch.ui-switch--md .ui-switch-knob {
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.settings-surface button.ui-switch.ui-switch--md.is-on .ui-switch-knob {
  transform: translateX(16px);
}

.settings-surface .settings-segmented {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-raised) 50%, transparent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.settings-surface .settings-segmented-btn {
  min-height: 24px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.settings-surface .settings-segmented-btn.is-active {
  background: var(--surface-base);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.theme-light .settings-surface .settings-segmented-btn.is-active {
  background: #ffffff;
  border-color: transparent;
}

/* 窄屏设备适配，上下排布 */
@media (max-width: 720px) {
  .settings-header-title {
    padding: 0 24px;
  }
  .settings-surface .settings-page {
    padding: 0 24px;
  }
  .settings-surface .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    background: transparent;
    transition: background-color 0.15s ease;
  }
  .settings-surface .settings-row:hover {
    background: color-mix(in srgb, var(--sidebar-item-hover) 20%, transparent);
  }
  .settings-surface .settings-row-hint {
    font-size: 12px;
    color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
    line-height: 1.4;
    margin-top: 2px;
  }
  .settings-surface .settings-row-control {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
<style>
/* ==========================================================================
   极简无边界排版 (Borderless Flat Layout)
========================================================================== */
.settings-surface .settings-section-title {
  display: none; /* Already indicated by sidebar, remove redundant big titles */
}

.settings-surface .settings-page {
  display: flex;
  flex-direction: column;
  gap: 48px; /* 分组之间留出巨大的呼吸空间，替代了卡片的包裹感 */
  width: 100%;
  max-width: 760px; /* 限制最大宽度，避免被无限拉长 */
}

.settings-surface .settings-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 分组标题：精致的次级标题，全大写字母带字间距，极具学术排版感 */
.settings-surface .settings-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  padding-left: 8px;
  padding-top: 16px;
}

/* 取消所有的卡片容器背景、边框和阴影 */
.settings-surface .settings-group-body {
  display: flex;
  flex-direction: column;
  background: var(--surface-base);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  padding: 0;
}

/* 每行只留极其微弱的底线，没有侧边距 */
.settings-surface .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  background: transparent;
  transition: background-color 0.15s ease;
}
.settings-surface .settings-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 20%, transparent);
}

/* 去除最后一条底线，保持组底部的干净 */
.settings-surface .settings-row:last-child {
  border-bottom: none;
}

/* 文字区排版优化，拉开主次层级 */
.settings-surface .settings-row-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-surface .settings-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.3;
}

.settings-surface .settings-row-hint {
  font-size: 12px;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
  line-height: 1.4;
  margin-top: 2px;
}

.settings-surface .settings-row-control {
  flex: 0 0 auto;
  min-width: 160px;
  width: min(100%, var(--settings-select-width));
  display: flex;
  justify-content: flex-end;
}

.settings-surface .settings-row-control.compact {
  width: auto;
  min-width: auto;
}

.settings-surface .settings-row-control .ui-select-shell {
  width: 100%;
}

/* =========================================================================
   控件复原：保持内敛和小巧 (iOS/macOS 原生高度)
========================================================================= */
.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger,
.settings-surface .settings-row-control .ui-button.ui-button--secondary,
.settings-surface .settings-row-control .ui-button.ui-button--danger {
  min-height: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  padding: 0 12px !important;
  font-size: 13px !important;

  /* 控件稍微有一点物理质感，衬托在纯平背景上 */
  background: var(--surface-raised) !important;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
  color: var(--text-primary) !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger {
  padding: 0 24px 0 12px !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:hover:not(:disabled),
.settings-surface .settings-row-control .ui-button:hover:not(:disabled) {
  background: var(--surface-hover) !important;
  border-color: var(--border) !important;
}

/* Switch 开关 */
.settings-surface button.ui-switch.ui-switch--md {
  width: 38px;
  height: 22px;
  background: var(--border);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}
.settings-surface button.ui-switch.ui-switch--md.is-on {
  background: var(--success);
  box-shadow: none;
}
.settings-surface button.ui-switch.ui-switch--md .ui-switch-knob {
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.settings-surface button.ui-switch.ui-switch--md.is-on .ui-switch-knob {
  transform: translateX(16px);
}

/* 分段控制器 */
.settings-surface .settings-segmented {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-raised) 50%, transparent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.settings-surface .settings-segmented-btn {
  min-height: 24px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.settings-surface .settings-segmented-btn.is-active {
  background: var(--surface-base);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.theme-light .settings-surface .settings-segmented-btn.is-active {
  background: #ffffff;
  border-color: transparent;
}

@media (max-width: 720px) {
  .settings-surface .settings-page {
    width: 100%;
  }
  .settings-surface .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    background: transparent;
    transition: background-color 0.15s ease;
  }
  .settings-surface .settings-row:hover {
    background: color-mix(in srgb, var(--sidebar-item-hover) 20%, transparent);
  }
  .settings-surface .settings-row-control {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
