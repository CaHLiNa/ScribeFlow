<template>
  <div class="theme-page settings-page">
    <h3 class="settings-section-title">{{ t('Theme') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Appearance') }}</h4>
      <div class="settings-group-body theme-group-body">
        <button
          v-for="theme in themes"
          :key="theme.id"
          type="button"
          class="theme-row"
          :class="{ 'is-active': workspace.theme === theme.id }"
          @click="workspace.setTheme(theme.id)"
        >
          <div class="theme-row-preview" :style="{ background: theme.colors.bgPrimary }">
            <div class="theme-row-sidebar" :style="{ background: theme.colors.bgSecondary }"></div>
            <div class="theme-row-editor">
              <div
                class="theme-row-line"
                :style="{ background: theme.colors.fgMuted, width: '60%' }"
              ></div>
              <div
                class="theme-row-line"
                :style="{ background: theme.colors.accent, width: '46%' }"
              ></div>
              <div
                class="theme-row-line"
                :style="{ background: theme.colors.fgMuted, width: '72%' }"
              ></div>
            </div>
          </div>

          <div class="theme-row-copy">
            <div class="theme-row-title">{{ t(theme.label) }}</div>
            <div class="theme-row-hint">{{ t(theme.description) }}</div>
          </div>
        </button>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('PDF Viewer') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Themed PDF pages') }}</div>
            <div class="settings-row-hint">
              {{ t('Tint embedded PDF pages to better match the active application theme.') }}
            </div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch
              :model-value="workspace.pdfThemedPages"
              :aria-label="t('Toggle themed PDF pages')"
              @update:model-value="workspace.togglePdfThemedPages()"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { WORKSPACE_THEME_OPTIONS } from '../../shared/workspaceThemeOptions.js'
import UiSwitch from '../shared/ui/UiSwitch.vue'

const workspace = useWorkspaceStore()
const { t } = useI18n()
const themes = WORKSPACE_THEME_OPTIONS
</script>

<style scoped>
.theme-group-body {
  gap: 8px;
}

.theme-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid
    var(--settings-row-border, color-mix(in srgb, var(--border-subtle) 24%, transparent));
  border-radius: 14px;
  background: var(
    --settings-row-surface,
    color-mix(in srgb, var(--shell-muted-surface) 92%, transparent)
  );
  box-shadow: none;
  text-align: left;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.theme-row + .theme-row {
  margin-top: 0;
}

.theme-row:hover {
  background: var(
    --settings-control-surface,
    color-mix(in srgb, var(--shell-surface) 72%, var(--shell-muted-surface))
  );
  border-color: var(
    --settings-control-border,
    color-mix(in srgb, var(--border-subtle) 32%, transparent)
  );
}

.theme-row.is-active {
  background: var(
    --settings-control-surface-hover,
    color-mix(in srgb, var(--shell-surface) 88%, var(--shell-muted-surface))
  );
  border-color: var(
    --settings-control-border-strong,
    color-mix(in srgb, var(--border-subtle) 44%, transparent)
  );
}

.theme-row-preview {
  flex: 0 0 56px;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 22%, transparent);
}

.theme-row-sidebar {
  width: 24%;
}

.theme-row-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 5px 6px;
}

.theme-row-line {
  height: 2px;
  border-radius: 999px;
  opacity: 0.74;
}

.theme-row-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.theme-row-title {
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.theme-row-hint {
  font-size: 11.5px;
  line-height: 1.38;
  color: var(--text-muted);
}
</style>
