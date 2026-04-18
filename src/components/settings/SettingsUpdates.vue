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
        {{ t('Altals is a local-first workspace for academic writing and research.') }}<br />
        <span class="app-description-muted">{{ statusMessage }}</span>
      </div>

      <div class="app-actions">
        <UiButton
          variant="secondary"
          size="md"
          :loading="updateStatus === 'checking'"
          @click="handleUpdateAction"
        >
          {{ actionLabel }}
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { checkForAppUpdates, getAppVersion, openReleasesPage } from '../../services/appUpdater'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const appVersion = ref('...')
const latestVersion = ref('')
const releaseUrl = ref('')
const updateStatus = ref('idle')
const { t } = useI18n()

const statusMessage = computed(() => {
  if (updateStatus.value === 'checking') {
    return t('Checking GitHub for the latest release...')
  }
  if (updateStatus.value === 'update-available') {
    return t('A newer version {version} is available. Open GitHub to download it.', {
      version: latestVersion.value,
    })
  }
  if (updateStatus.value === 'up-to-date') {
    return t('You are already on the latest version.')
  }
  if (updateStatus.value === 'failed') {
    return t('Unable to check for updates right now. Please try again.')
  }
  return t('Automatic updates are disabled in this local build. Click once to check GitHub for a newer version.')
})

const actionLabel = computed(() => {
  if (updateStatus.value === 'checking') return t('Checking...')
  if (updateStatus.value === 'update-available') return t('Open GitHub to Update')
  if (updateStatus.value === 'up-to-date') return t('Check Again')
  if (updateStatus.value === 'failed') return t('Retry Update Check')
  return t('Check for Updates')
})

async function handleUpdateAction() {
  if (updateStatus.value === 'checking') return
  if (updateStatus.value === 'update-available') {
    await openReleasesPage(releaseUrl.value)
    return
  }

  updateStatus.value = 'checking'
  try {
    const result = await checkForAppUpdates(appVersion.value)
    latestVersion.value = result.latestVersion
    releaseUrl.value = result.releaseUrl
    updateStatus.value = result.hasUpdate ? 'update-available' : 'up-to-date'
  } catch {
    updateStatus.value = 'failed'
  }
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
