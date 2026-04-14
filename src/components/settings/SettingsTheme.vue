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
  /* Inherits from standard settings-group-body */
}

.theme-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 30%, transparent);
  box-shadow: none;
  text-align: left;
  transition: background-color 140ms ease;
}

.theme-row:last-child {
  border-bottom: none;
}

.theme-row:hover {
  background: color-mix(in srgb, var(--surface-hover) 30%, transparent);
}

.theme-row.is-active {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.theme-row-preview {
  flex: 0 0 56px;
  height: 34px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-subtle) 40%, transparent);
}

.theme-row-sidebar { width: 24%; }

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
  gap: 2px;
}

.theme-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.theme-row-hint {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted);
}
</style>