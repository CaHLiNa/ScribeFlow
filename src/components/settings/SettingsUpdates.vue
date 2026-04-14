<!-- START OF FILE src/components/settings/SettingsUpdates.vue -->
<template>
  <div class="updates-page settings-page">
    <h3 class="settings-section-title">{{ t('About') }}</h3>
    <div class="updates-hero">
      
      <!-- 彻底去掉多余的边框和阴影，还原干净图标 -->
      <div class="app-icon-container">
        <img src="/icon.png" :alt="t('Altals Logo')" class="app-icon" draggable="false" />
      </div>
      
      <div class="app-info">
        <h1 class="app-title">Altals</h1>
        <div class="app-version">{{ t('Version') }} {{ appVersion }}</div>
      </div>

      <div class="app-description">
        {{ t('Altals is a local-first workspace for academic writing and research.') }}<br>
        <span class="app-description-muted">{{ t('Automatic updates are disabled in this local build.') }}</span>
      </div>

      <div class="app-actions">
        <UiButton variant="secondary" size="md" @click="openReleases">
          {{ t('Check for Updates via GitHub') }}
        </UiButton>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAppVersion, openReleasesPage } from '../../services/appUpdater'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const appVersion = ref('...')
const { t } = useI18n()

async function openReleases() {
  await openReleasesPage()
}

onMounted(async () => {
  appVersion.value = await getAppVersion()
})
</script>

<style scoped>
.updates-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding-bottom: 15vh; /* 视觉居中略偏上 */
}

.updates-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: min(100%, 400px);
}

.app-icon-container {
  width: 112px;
  height: 112px;
  margin-bottom: 24px;
  /* 移除丑陋边框，仅保留对非 PNG 图标的圆角保护 */
  border-radius: 26px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  background: transparent;
}

.app-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-info {
  margin-bottom: 24px;
}

.app-title {
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}

.app-version {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.app-description {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 32px;
  padding: 0 16px;
}

.app-description-muted {
  color: var(--text-muted);
}

.app-actions {
  display: flex;
  justify-content: center;
}

.app-actions :deep(.ui-button) {
  min-width: 220px;
  min-height: 36px !important;
  border-radius: 8px !important;
}
</style>
