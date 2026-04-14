<!-- START OF FILE src/components/settings/SettingsTheme.vue -->
<template>
  <div class="theme-page settings-page">
    <h3 class="settings-section-title">{{ t('Appearance') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Appearance') }}</h4>
      <div class="theme-grid">
        
        <button
          v-for="theme in themes"
          :key="theme.id"
          type="button"
          class="theme-card"
          :class="{ 'is-active': workspace.theme === theme.id }"
          @click="workspace.setTheme(theme.id)"
        >
          <!-- 预览图占据卡片上半部分 -->
          <div class="theme-preview-box" :style="{ background: theme.colors.bgPrimary }">
            <div class="theme-preview-sidebar" :style="{ background: theme.colors.bgSecondary }"></div>
            <div class="theme-preview-editor">
              <div class="theme-preview-line" :style="{ background: theme.colors.fgMuted, width: '60%' }"></div>
              <div class="theme-preview-line" :style="{ background: theme.colors.accent, width: '46%' }"></div>
              <div class="theme-preview-line" :style="{ background: theme.colors.fgMuted, width: '72%' }"></div>
            </div>
            <!-- 选中标记悬浮在图片上 -->
            <div class="theme-check-badge" v-if="workspace.theme === theme.id">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </div>

          <!-- 文字说明 -->
          <div class="theme-info">
            <div class="theme-name">{{ t(theme.label) }}</div>
            <div class="theme-desc">{{ t(theme.description) }}</div>
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
            <div class="settings-row-hint">{{ t('Tint embedded PDF pages to better match the active application theme.') }}</div>
          </div>
          <div class="settings-row-control compact">
            <UiSwitch :model-value="workspace.pdfThemedPages" @update:model-value="workspace.togglePdfThemedPages()" />
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
/* 主题网格布局：放弃条状列表，改为网格图片选择 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 4px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: transparent;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.theme-preview-box {
  position: relative;
  display: flex;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.theme-card:hover .theme-preview-box {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
  transform: translateY(-2px);
}

.theme-card.is-active .theme-preview-box {
  box-shadow: 0 0 0 2px var(--accent);
}

.theme-preview-sidebar {
  width: 25%;
  border-right: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.theme-preview-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 12px;
}

.theme-preview-line {
  height: 3px;
  border-radius: 2px;
  opacity: 0.8;
}

.theme-check-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--accent);
  color: var(--bg-primary);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 4px 0;
}

.theme-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.theme-card.is-active .theme-name {
  color: var(--text-primary);
  font-weight: 600;
}
</style>
