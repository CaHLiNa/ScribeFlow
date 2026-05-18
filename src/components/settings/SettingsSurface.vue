<template>
  <div class="settings-surface" data-surface-context-guard="true">
    <header class="settings-header">
      <h2 class="settings-header-title">{{ title }}</h2>
    </header>

    <div class="settings-content scrollbar-hidden">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
})
</script>

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
  justify-content: center;
  padding: 20px 0 16px;
}

.settings-header-title {
  margin: 0;
  width: 100%;
  max-width: 800px;
  padding: 0 32px;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0;
}

.settings-content {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  padding: 16px 0 64px;
}

@media (max-width: 720px) {
  .settings-header-title {
    padding: 0 24px;
  }
}
</style>

<style>
.settings-surface .settings-section-title {
  display: none;
}

.settings-surface .settings-page {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  flex-direction: column;
  gap: 48px;
  padding: 0 32px;
}

.settings-surface .settings-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-surface .settings-group-title {
  margin-bottom: 8px;
  padding-top: 16px;
  padding-left: 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.settings-surface .settings-group-body {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 8px;
  background: var(--surface-base);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  padding: 0;
}

.settings-surface .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  background: transparent;
  padding: 12px 16px;
  transition: background-color 0.15s ease;
}

.settings-surface .settings-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 20%, transparent);
}

.settings-surface .settings-row:last-child {
  border-bottom: none;
}

.settings-surface .settings-row-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

.settings-surface .settings-row-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
}

.settings-surface .settings-row-hint {
  margin-top: 2px;
  color: color-mix(in srgb, var(--text-secondary) 80%, transparent);
  font-size: 12px;
  line-height: 1.4;
}

.settings-surface .settings-row-control {
  display: flex;
  width: min(100%, var(--settings-select-width));
  min-width: 160px;
  flex: 0 0 auto;
  justify-content: flex-end;
}

.settings-surface .settings-row-control.compact {
  width: auto;
  min-width: auto;
}

.settings-surface .settings-row-control .ui-select-shell {
  width: 100%;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger,
.settings-surface .settings-row-control .ui-button.ui-button--secondary,
.settings-surface .settings-row-control .ui-button.ui-button--danger {
  min-height: 28px !important;
  height: 28px !important;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent) !important;
  border-radius: 6px !important;
  background: var(--surface-raised) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
  color: var(--text-primary) !important;
  font-size: 13px !important;
  padding: 0 12px !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger {
  padding: 0 24px 0 12px !important;
}

.settings-surface .settings-row-control .ui-select-shell .ui-select-trigger:hover:not(:disabled),
.settings-surface .settings-row-control .ui-button:hover:not(:disabled) {
  border-color: var(--border) !important;
  background: var(--surface-hover) !important;
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
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-raised) 50%, transparent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  padding: 2px;
}

.settings-surface .settings-segmented-btn {
  min-height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  padding: 0 12px;
  transition:
    color 0.15s,
    background 0.15s;
}

.settings-surface .settings-segmented-btn.is-active {
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  background: var(--surface-base);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
}

.theme-light .settings-surface .settings-segmented-btn.is-active {
  border-color: transparent;
  background: #ffffff;
}

@media (max-width: 720px) {
  .settings-surface .settings-page {
    width: 100%;
    padding: 0 24px;
  }

  .settings-surface .settings-row-control {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
